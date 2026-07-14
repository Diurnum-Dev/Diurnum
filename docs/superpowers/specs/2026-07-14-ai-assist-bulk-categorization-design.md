# AI Assist: Bulk Categorization for Bank Imports

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan

## Problem

The Inbox makes importing raw bank files easy, but categorizing and approving
each Statement Row is retail work: one `Approve Entry` click per row, with no
multi-select and no bulk accept. A real import (177 pending rows in testing)
means 177 manual categorize-and-approve cycles. The Categorization Rules
engine could absorb recurring rows, but rules must be hand-written, so in
practice imports show "0 matched by rules" — the cold-start problem.

The existing BYO AI Adapter (`ai_adapter.rs`) can suggest a category, but it
only fires synchronously, per row, as a fallback when no rule matches — one
subprocess per row, re-sending the same chart of accounts every time. It is
neither fast enough nor visible enough to change the workflow.

## Product stance

**The pen stays human; approval goes wholesale.** AI drafts categorization,
payee/narration cleanup, and durable rules for an entire import in one batch
pass. The Founder-Operator reviews the results grouped by category and signs
once — "Approve 158 entries" — instead of 158 times. This preserves the
"AI never gets the pen" DNA (AI Suggestions still require Approval; nothing
reaches the ledger without a human click) while removing the tedium.

Decisions made during design:

| Decision | Choice |
|---|---|
| Trust model | Bulk approval; human holds the pen and signs once |
| Engine | Batch the existing BYO adapter (no hosted AI, no embedded API keys) |
| Rule learning | AI proposes durable Categorization Rules as part of the pass |
| Trigger | Explicit button ("AI Assist"), never automatic |
| Draft scope | Ledger account + cleaned payee + narration + proposed rules |
| Review UX | Results grouped by proposed category, needs-attention tail |
| Undo | Batch is a first-class unit: git snapshot + batch revert + per-entry revert |
| Batch shape | Chunked batch protocol (~40 rows/invocation), sequential, resumable |

## Architecture

### Trigger and eligibility

- An **AI Assist** button lives in the Inbox toolbar and is also offered as
  the closing step of a Smart CSV Import ("AI Assist — categorize 177
  pending entries").
- First-run click shows the AI Context Disclosure with a "don't show again"
  acknowledgment. With no adapter configured, the button renders in a setup
  state that links to Settings and the detected-harness one-liner.
- **Eligible rows** = pending standard rows with no Categorization Rule
  match. Rule-matched rows are categorized deterministically for free.
  Transfer-kind rows are excluded and keep the existing transfer flow.

### Batch adapter protocol

The existing per-row adapter contract is untouched (the Ledger Editor
ghost-text path continues to use it). AI Assist sends a new versioned
envelope to the same configured adapter command:

```jsonc
// stdin →
{
  "type": "batchSuggestionRequest",
  "version": 1,
  "sharedContext": {
    "chartOfAccounts": ["..."],
    "categorizationRules": [ ... ],
    "businessProfile": { "name": "...", "baseCurrency": "...", "booksStartDate": "..." },
    "recentApprovedEntries": [ ... ]
  },
  "rows": [
    { "id": "...", "postedDate": "...", "description": "...",
      "sourceAccount": "...", "sourceAmount": "..." }
  ]
}

// stdout ←
{
  "suggestions": [
    { "rowId": "...", "ledgerAccount": "Expenses:Software",
      "payee": "Autobooks", "narration": "...",
      "confidence": 0.93, "explanation": "...",
      "needsHumanAttention": false }
  ],
  "proposedRules": [
    { "matchText": "WEB PMTS Autobooks", "sourceAccount": "...",
      "ledgerAccount": "Expenses:Software", "matchedRowIds": ["..."] }
  ]
}
```

Shared context is sent once per invocation instead of once per row.

### Execution model

- Rows are chunked (~40 per invocation) and chunks run **sequentially** from
  an async Tauri task; the pass never blocks the UI.
- The UI receives progress events ("64 of 177 categorized…"); partial
  results appear in the review screen as chunks complete.
- Each chunk has a generous timeout (~120s). A failed chunk (crash, bad
  JSON, timeout) marks only its rows *failed*; the pass continues.
- **Persistence:** suggestions are written to a new SQLite table
  (`ai_suggestions`, keyed by statement row id + pass id) as each chunk
  returns. Crash/restart never loses paid-for results; reopening the Inbox
  rehydrates them. Re-running AI Assist processes only rows without a stored
  suggestion, with an explicit "re-run all" escape hatch.
- **Boundary validation:** every suggested `ledgerAccount` is checked
  against the chart of accounts. Unknown or malformed accounts demote the
  row to the needs-attention tail; the adapter can never introduce an
  account the Workspace does not have. Response rows with unknown `rowId`s
  are ignored; requested rows missing from the response are treated as
  failed.

### Reference adapter

Diurnum ships a documented prompt/wrapper for Claude Code CLI (the harness
AI Adapter Detection already discovers), so configuring the adapter is
paste-one-command, not write-your-own-script.

## Review screen

The review screen is a **mode of the Inbox** (not a separate route) that
replaces the list body while a pass's results exist.

- Rows group under their **proposed ledger account**. Group headers show
  count and net amount. Rows show cleaned payee, `was: <raw memo>`, and
  amount. Everything AI-suggested starts **checked**; group and row
  checkboxes cascade.
- Clicking a row opens the existing Inspector for per-row edits; changing
  the account there moves the row to that group.
- A **"Needs your eye" group** pins to the bottom: rows flagged
  `needsHumanAttention`, low-confidence suggestions (below ~0.6),
  failed-chunk rows, and boundary-validation rejects. These start
  **unchecked** and remain in the normal Inbox after approval — the tail
  never blocks the batch. Failed rows show "N rows failed — Retry", which
  re-runs only those rows.
- **Proposed rules render inline inside their group** ("⚡ New rule:
  'WEB PMTS Autobooks' → Expenses:Software · matches 6 rows"), checked by
  default. A rule whose group the user unchecks is auto-unchecked. A
  proposed rule duplicating an existing enabled rule (same source account +
  match text) is not proposed.
- Header shows **"Approve N entries"** with a live count, plus a
  **"Dismiss results"** action that returns to the plain Inbox (suggestions
  stay in SQLite, marked dismissed).

## Bulk write (atomic)

1. On approve, Diurnum records an `ai_assist_batches` row (id, timestamp,
   counts) and makes a git commit/snapshot of the pre-approval state via the
   existing Git Integration.
2. Checked entries are written through the existing
   `approve_suggested_entry` path in a loop — same provenance metadata,
   dedup, and Beancount formatting — plus one extra provenance key: the
   **batch id**. Checked rules are created via the existing
   `categorization_rules` machinery. One ledger save, one post-approval
   commit ("AI Assist: approved 158 entries"), one Workspace Session
   refresh.
3. **Golden-path validation gates the whole write**: the ledger is validated
   after the write and before the commit; a validation failure aborts and
   rolls back the entire batch — never a half-applied batch.
4. Rows approved or edited in the Inspector while a pass is running are
   dropped from results at write time (existing "no longer pending" guard).
   A Manual Ledger Edit that invalidates the ledger blocks batch approval
   exactly as it blocks single approval.

## Undo

- **Revert batch:** a "Recent AI Assist batches" list (Inbox toolbar
  overflow or Settings) offers one-click revert — removes all entries
  carrying that batch id (their rows return to pending) and the rules the
  batch created.
- **Per-entry revert** continues to work unchanged for single stragglers.
- The pre-approval git snapshot is the belt-and-suspenders layer beneath
  both.

## Scope boundaries

- Payee/narration cleanup applies to **AI-suggested rows only**;
  rule-matched rows keep raw bank text (rules map accounts only). Extending
  rules to carry payee cleanup is a follow-up, out of scope.
- No hosted AI service, no embedded API keys, no automatic (non-button)
  triggering, no AI auto-approval.
- Transfers keep their existing detection and approval flow.

## Testing

- **Rust unit tests:** batch envelope serialization/versioning; chunking;
  per-chunk failure isolation; suggestion persistence and rehydration;
  account-validation demotion; batch-write atomicity (validation failure
  rolls back); batch revert (entries removed, rows re-pending, rules
  removed); duplicate-rule suppression. Fake adapter is a shell script,
  matching the existing `ai_adapter.rs` test pattern.
- **UI tests:** grouping and cascade-check behavior; live approve count;
  needs-attention starts unchecked; rule checkbox follows its group;
  dismiss restores the plain Inbox.
- **E2E golden path:** import CSV → run AI Assist against a scripted
  adapter → review → bulk approve → `bean-check` passes → revert batch →
  rows return to pending.

## Success criteria

A 177-row import goes from raw bank sludge to approved, cleanly named,
categorized ledger entries in under 5 minutes of human time. Every
AI-touched entry is traceable (batch id in provenance) and reversible. The
next import from the same bank mostly matches by rules before AI is invoked.
