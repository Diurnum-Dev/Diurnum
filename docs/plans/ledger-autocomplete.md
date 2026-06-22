---
title: Ledger Editor Autocomplete & Entry Completion
type: PRD
status: Draft
belongs_to: "[[Diurnum]]"
date: 2026-06-21
tags:
  - diurnum
  - product
  - ledger-editor
---

# Ledger Editor Autocomplete & Entry Completion

> [!info] Purpose
> Authoritative spec for context-aware completion in the Ledger Editor. Written
> for contributors and agents. Acceptance criteria are precise enough to
> implement and verify without follow-up questions. Architecture decision in
> [ADR-0004](../adr/0004-in-process-tiered-editor-completion.md).

---

## Summary

When the Founder-Operator writes or edits a Beancount entry by hand, the Ledger
Editor should complete the thing under the cursor: account names from
`accounts.bean`, previously-used payees and narrations, and — on the date header
line — a whole entry inferred by the configured AI adapter. The single best
guess appears as an inline ghost the user accepts with Tab; when several
candidates are plausible, a dropdown opens for arrow-key selection.

This is **not** an LSP. It extends Diurnum's existing in-process completion
(`workspace::ledger_editor`) and the existing inline-ghost UI, adding a fast
local tier and a dropdown. See ADR-0004 for why no language server / sidecar.

## Background: two ways entries enter the ledger

There are two paths to a ledger entry, and both are supported:

1. **CSV Import → Inbox triage → Approval** — the *primary* path. Statement Rows
   become Suggested Entries the user reviews and approves (ADR-0003).
2. **Manual Ledger Edit** — typing an entry directly in the Ledger Editor. The
   *secondary* path, but a first-class escape hatch when import does not fit
   (recurring bills entered before the statement lands, adjusting entries,
   corrections).

This PRD makes path 2 feel fast. The completion signals it draws on (Rules,
history) are largely produced by path 1, so the two paths reinforce each other.

## What already exists

- `workspace::ledger_editor::get_predictive_entry_completion` — produces a
  whole-entry completion on the date header line from, in priority order,
  Categorization Rules → history → AI adapter. Returns a single insert string.
- `read_chart_of_accounts` — parses `open` directives from `accounts.bean`.
- Inline **ghost** rendering + **Tab-to-accept** / **Esc-to-dismiss** in
  `LedgerEditor.tsx` (`GhostCompletionWidget`, the Tab keymap, `ghostCompletion`).
- `WorkspaceView.knownAccounts` — the chart of accounts, already computed and
  available in `App.tsx`, currently passed only to the Inbox, **not** the editor.
- `@codemirror/autocomplete` — already a dependency, currently unused here.

## Goals

- Account completion in posting position, ranked by entry context.
- Payee + narration completion in the description string position.
- Keep AI whole-entry inference on the date header line (unchanged behavior).
- Inline ghost for the single best guess; dropdown when ambiguous.
- Feel instant for account/payee; never block typing on the AI subprocess.

## Non-goals

- No LSP server, sidecar process, or Python runtime (ADR-0004).
- No go-to-definition, hover, rename, or semantic diagnostics beyond the
  existing Ledger Validation.
- No new completion for amounts, dates, flags, directives, or commodities.
- No change to the Inbox / Approval path.

---

## Architecture: two latency tiers

Per ADR-0004:

- **Instant tier (account + payee/narration).** The dropdown and ghost filter an
  **in-memory** list held by the frontend. Accounts come from `knownAccounts`
  (threaded in as a prop). Payees/narrations come from a backend command run on
  file open and after each save, then cached. No per-keystroke IPC.
- **Deferred tier (AI whole-entry).** Unchanged: a debounced async Tauri call to
  `get_predictive_entry_completion` on the date header line, rendered as ghost.

**Context ranking** (the "Phone Bill → Expenses:Utilities" magic) is fetched
**once per transaction block** — when the cursor enters a block, request ranked
account hints derived from Rules + history for that block's description — and
**cached for the block**. The instant-tier dropdown reorders its locally
filtered accounts so hinted accounts sort first. Ranking never gates
per-keystroke filtering, and AI is excluded from ranking (too slow).

---

## The three completion contexts

Context is determined by cursor position within the entry:

| # | Context | Trigger position | Source | Tier |
|---|---------|------------------|--------|------|
| 1 | **Account** | a posting line (indented), in the account token | `knownAccounts`, reordered by per-block ranking | Instant |
| 2 | **Payee / narration** | inside the `"…"` after `date flag` | ledger-derived payee + narration list | Instant |
| 3 | **Whole entry** | the bare date header line | AI adapter / Rules / history (existing) | Deferred |

### Context 1 — Account completion

- Triggers on an indented posting line when the cursor is in the account token
  (before the amount).
- Candidates = `knownAccounts` filtered by the typed substring (case-insensitive,
  segment-aware so `exp:util` matches `Expenses:Utilities`).
- **Ranking** within the filtered set:
  1. Accounts surfaced by the per-block context hint (Rules + history for this
     block's description) sort first.
  2. **Debit/credit awareness:** on the *first* posting line, bias toward
     `Expenses:` / `Income:`; on the *balancing* (second+) posting, bias toward
     `Assets:` / `Liabilities:`. Bias affects sort order only — every account
     remains reachable.
  3. Remaining accounts in chart order.

### Context 2 — Payee / narration completion

- Triggers inside a quoted string in the header's payee/narration slots.
- Candidates = distinct strings that have appeared in description position across
  the workspace's `.bean` transactions — **both** payee (first slot) and
  narration (second slot), each tagged in the dropdown so the user sees which is
  which.
- Filtered by typed substring (case-insensitive).

### Context 3 — Whole-entry AI inference (existing)

- Unchanged. On the bare date header line, the debounced async call populates the
  ghost with a full inferred entry. The dropdown does **not** auto-open here, so
  AI inference is never drowned out by a list.

---

## UX model

### Presentation: ghost default, dropdown on ambiguity

- The **inline ghost** always shows the single best candidate (top of the ranked
  list) for the current context.
- The **dropdown auto-opens** in the account and payee contexts once there are
  **≥2 candidates** and the user has typed **≥1 character**. It does not
  auto-open on the bare date line.
- **`Ctrl+Space`** forces the dropdown open in any completable context,
  regardless of candidate count — the universal "show me my options" escape hatch
  for when the ghost guessed wrong.

### Key handling: Tab precedence

When Tab is pressed, in priority order:

1. **Dropdown open** → accept the highlighted dropdown item.
2. **Ghost showing, no dropdown** → accept the ghost.
3. **Neither** → default indent behavior.

Because the ghost's top pick equals the dropdown's first item, Tab does the same
thing whether or not the dropdown is engaged; behavior only diverges *after* the
user arrows to a different item — which is the intent. Implement as a guard in
the existing Tab handler: check `completionStatus(view.state) === "active"`
first; if active, accept the dropdown; else fall through to the existing ghost
logic; else indent.

- **Arrow Up/Down** navigate the dropdown when open.
- **Esc** dismisses the dropdown if open, else the ghost.
- Continued typing refines candidates in both ghost and dropdown.

### Acceptance behavior

On accepting a completion:

- Insert the chosen text.
- **Account context:** if the posting line has no amount yet, advance the cursor
  to the amount column (or insert a sensible separator) so the user keeps typing
  the number.
- **Do not** run `alignTransactionAmounts` on accept. Alignment already runs on
  save; reformatting mid-edit is jarring and contradicts the existing
  "don't reformat the active line while editing" behavior.

---

## Phase 0 (prerequisite): fix Ledger Editor auto-save

Freshness depends on auto-save firing. Investigation found it currently does
not, and blur-save was never wired. Both must be fixed first.

**Root cause (debounce starvation).** `handleLedgerValidationChange` /
`handleLedgerFileSaved` in `App.tsx` are plain function declarations (new
identity every render). They flow into `runValidation` and `saveActiveFile`
`useCallback` deps in `LedgerEditor.tsx`. `applyLedgerValidation`
(`session.ts:529`) sets a brand-new `workspace` object, forcing an App
re-render. While a tab is dirty, the validation effect re-validates ~every 300ms
in a loop, and each iteration re-arms the 2000ms save timer — so it never
reaches 2s. The ledger is also being re-validated continuously as a side effect.

**Fix.**

- Break the dependency loop so `runValidation` / `saveActiveFile` identities do
  not churn on every App render — either memoize the App handlers with
  `useCallback`, or drive these through refs (matching the existing
  `callbacksRef` pattern at `LedgerEditor.tsx:833`).
- Add **blur-save**: a `window` `blur` + `visibilitychange` listener that calls
  `saveActiveFile` when the active tab is dirty.

**Acceptance criteria.**

- AC-0.1: Typing in a dirty file and pausing **2s** writes the file (assert via a
  save spy / mtime change) — exactly once, not repeatedly.
- AC-0.2: While idle-dirty, `validateWorkspace` is **not** called in a loop
  (assert call count stabilizes after one validation).
- AC-0.3: Switching away from the app window (blur) or hiding the tab with a
  dirty file triggers a save.
- AC-0.4: No regression to `Mod-s` / menu-save.

---

## Functional acceptance criteria

**Account completion (Context 1)**

- AC-1.1: On an indented posting line, typing ≥1 char of an account shows an
  inline ghost of the best-ranked matching account; Tab accepts it.
- AC-1.2: With ≥2 matches and ≥1 char typed, a dropdown auto-opens listing
  matches; Up/Down navigate; Tab/Enter accept the highlighted item.
- AC-1.3: Segment-aware filtering: `exp:util` matches `Expenses:Utilities`.
- AC-1.4: When the current block's description maps (via a Rule or history) to an
  account, that account ranks first.
- AC-1.5: On the first posting line, `Expenses:`/`Income:` accounts rank above
  `Assets:`/`Liabilities:` among otherwise-equal matches; on the balancing
  posting, the reverse. All accounts remain selectable.
- AC-1.6: Accepting an account with no amount yet leaves the cursor positioned to
  type the amount; the active line is not reformatted.

**Payee / narration completion (Context 2)**

- AC-2.1: Inside a header quoted string, typing ≥1 char suggests previously-used
  payees and narrations from existing `.bean` transactions.
- AC-2.2: Candidates are de-duplicated and tagged payee vs narration in the
  dropdown.
- AC-2.3: A payee/narration typed in another transaction and saved appears as a
  candidate (subject to the save-based freshness window).

**Whole-entry AI (Context 3)**

- AC-3.1: Existing date-header-line ghost behavior is unchanged.
- AC-3.2: The account/payee dropdown does not auto-open on the bare date line.

**Cross-cutting**

- AC-4.1: `Ctrl+Space` opens the dropdown in any completable context regardless
  of candidate count.
- AC-4.2: Tab precedence is dropdown-when-open → ghost → indent (per UX model).
- AC-4.3: Esc dismisses dropdown if open, else ghost.
- AC-4.4: Account/payee filtering does not issue a backend call per keystroke
  (instant tier holds data in memory).

---

## Data sources & freshness

- **Accounts:** `knownAccounts`, threaded from `App.tsx` into `LedgerEditor` and
  `CodeMirrorEditor` as a prop. No new endpoint.
- **Payees/narrations:** a backend command returning distinct description-slot
  strings parsed from the workspace `.bean` files; fetched on file open and after
  each save, cached in the frontend.
- **Per-block ranking hints:** a backend call (Rules + history, debit/credit
  aware) made when the cursor enters a transaction block, keyed/cached by the
  block's description.
- **Freshness policy:** refresh the cached lists on **save** and on **file
  open**; tolerate staleness between saves. With Phase 0 fixed, the auto-save
  debounce bounds staleness to ~2s. (Future option, out of scope: also live-parse
  the open buffer to eliminate the staleness window — purely additive.)

---

## Phasing

- **Phase 0 — Auto-save fix** (prerequisite). Debounce-loop fix + blur-save.
- **Phase 1 — Account completion.** Thread `knownAccounts`; wire
  `@codemirror/autocomplete` for the account context; ghost + dropdown + Tab
  precedence; per-block ranking with debit/credit awareness.
- **Phase 2 — Payee/narration completion.** Backend payee/narration command +
  cache; payee context completion.
- **Phase 3 — Polish.** `Ctrl+Space`, acceptance cursor-advance, dropdown
  tagging, edge cases.

(AI whole-entry inference already ships; it is folded in, not rebuilt.)

## Open questions

- Exact column/separator inserted on account-accept when advancing to the amount.
- Whether narration candidates should be scoped to the matched payee (e.g. only
  narrations previously used with "Phone Bill") — a possible ranking refinement,
  deferred.

## Related

- [ADR-0004 — In-process tiered editor completion](../adr/0004-in-process-tiered-editor-completion.md)
- [ADR-0003 — Post-approval Inbox triage flow](../adr/0003-post-approval-inbox-triage-flow.md)
- Diurnum Inbox — AI smart-matching existing transactions (related, separate)
