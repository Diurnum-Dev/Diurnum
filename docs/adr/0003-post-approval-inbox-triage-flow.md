# Post-Approval flow keeps the Founder-Operator in the Inbox

## Status

Accepted

## Context

When the Founder-Operator approves a Suggested Entry, the app currently
navigates away from the Inbox and into the Ledger Editor, opening the Monthly
Transaction File the approved entry was written to (see the pre-refactor
`handleApproveSuggestedEntry` / `handleApproveTransferEntry` in `src/App.tsx`,
which set `activeScreen = "ledger"` and the requested file to
`transactions/YYYY-MM.bean`).

The Inbox is a triage surface: the Founder-Operator works down a queue of
Suggested Entries, approving each in turn. Jumping to the Ledger Editor after
every Approval breaks that rhythm — the user has to navigate back to the Inbox
to approve the next item, once per entry. The keyboard-first triage hint the
shell already advertises (`⏎ Accept · J / K Navigate · E Edit`) implies a
stay-in-place flow that the navigation behaviour contradicts.

This decision was made while reshaping the open-Workspace state into a single
**Workspace Session** module (see `docs/plans/workspace-session.md`). With the
session owning data and the App owning navigation, where to land after Approval
became an explicit choice rather than an incidental side effect of the handler.

## Decision

After an Approval (standard or transfer), Diurnum **stays in the Inbox** and
**advances the selection to the next item** so triage continues without
navigation.

- The Workspace Session does not navigate. Its mutation methods resolve with
  the approved `statementRowId`.
- The Inbox owns selection, keyed by `statementRowId`. When the session's
  refreshed `suggestedEntries` no longer contains the approved id, selection
  moves to the next-nearest remaining row (or clears when the queue is empty).
- The Ledger Editor remains one keystroke away (the existing `E` / open-file
  affordances); it is no longer forced on the user as a post-Approval
  destination.

## Consequences

- The approved entry is no longer shown in the editor automatically. Trust in
  the write still comes from the Reviewable Diff at review time and from Ledger
  Validation, not from landing in the file.
- "Approve, then approve the next" becomes a tight keyboard loop with no manual
  re-navigation.
- Any future work that wants to surface the written entry should do so
  *without* leaving the Inbox (e.g. an inline confirmation), not by navigating.

## Rationale

Triage throughput is the point of the Inbox. Keeping the Founder-Operator in
place — and advancing to the next item — serves the Keyboard-First Workflow and
the Golden Path better than confirming each write by teleporting into the
ledger. The editor is always reachable for the cases that need a manual look.

## Revisit when

The Inbox gains a meaningfully different review model (e.g. batch approval, or
Split Entries) where landing on the written result is genuinely useful, or if
Founder-Operators report they cannot trust an Approval without seeing the
resulting ledger line.
