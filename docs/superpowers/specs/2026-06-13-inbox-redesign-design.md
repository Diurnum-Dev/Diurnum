# Inbox redesign — design spec

Date: 2026-06-13
Status: Approved (ready for implementation plan)

## Goal

Bring the Inbox screen in line with the reference mockup
(`docs/screenshots/Inbox.png`): a dense, grouped transaction table with a
functional filter toolbar and a richer right-hand inspector, plus keyboard
navigation and contextual status-bar hints.

Scope decision: **full fidelity** — functional filters and keyboard nav are in
scope, not just visual restyling. Two exclusions, both for "honest chrome"
reasons:

- **No fake sync.** The mockup's "Synced 2 min ago" status text is omitted;
  Diurnum has no sync feature (same ethos as `docs/adr/0002-sidebar-footer-reserved-for-sync.md`).
- **No masked account numbers** (e.g. `···4421`) — that data does not exist.

The sidebar footer is out of scope per ADR 0002.

## Current state

- `src/features/workspace/InboxPanel.tsx` is one file rendering header + a
  card-based list + an inline inspector that delegates to
  `SuggestedEntryDetail` (from `SuggestedEntryReview.tsx`).
- The Inbox only ever receives **pending** `SuggestedEntry[]`; there is no feed
  of already-posted rows.
- The shared status bar lives in `src/components/AppShell.tsx`. For non-ledger
  screens it renders `statusContext` (left) and a right cluster
  (ledger status / git). There is no per-screen shortcut-hint slot.

### Data available (`src/lib/workspace/types.ts`)

`SuggestedEntry`: `kind` (`standard` | `transfer`), `statementRowId`,
`postedDate`, `description`, `sourceAccount`, `sourceAmount`, `sourceFileName`,
`importFingerprint`, `pendingAtImport`, `linkedStatementRow`,
`suggestedLedgerAccount`, `categorizationRuleId`, `aiSuggestion`.

`AiSuggestion`: `ledgerAccount`, `sourceAccount`, `sourceAmount`, `payee`,
`narration`, `confidence`, `explanation`, `needsHumanAttention`.

## Architecture / decomposition

Split the monolithic `InboxPanel` into focused units:

- **`InboxPanel.tsx`** (orchestrator) — owns selection state, filter state
  (account, date range, active tab), and the keyboard handler. Derives the
  filtered + grouped entries and renders header → toolbar → two-column layout.
- **`InboxToolbar.tsx`** — account dropdown, date-range dropdown, and the
  segmented filter tabs with live counts. Pure presentational + callbacks.
- **`InboxInspector.tsx`** — the right panel. Replaces the inline inspector and
  this screen's use of `SuggestedEntryDetail`. Owns all approve / transfer /
  revert logic and the edit-account form.
- List + row rendering stays inside `InboxPanel` (small enough to not warrant a
  separate file).

`SuggestedEntryReview.tsx` / `SuggestedEntryDetail` stays in the repo for any
other consumers, but the Inbox no longer imports it.

## Buckets, grouping, and filtering

Three mutually exclusive buckets (so counts sum cleanly, matching the mockup's
`4 pending + 31 matched + 1 transfer = 36`):

- **pending** = `kind === "standard"` AND no `suggestedLedgerAccount`.
- **matched** = `kind === "standard"` AND has `suggestedLedgerAccount`.
- **transfers** = `kind === "transfer"`.

### List groups (visual)

- **"Pending · N transactions · needs your review"** — the *pending* bucket plus
  all *transfers* (transfers need a human to confirm the match, so they live
  here visually).
- **"Matched by rules · N transactions · auto-posted"** — the *matched* bucket.

A group header renders only when that group is non-empty after filtering.

### Toolbar filters (all functional, client-side)

- **Account** — `<select>` of "All accounts" + distinct `sourceAccount` values.
  Filters the list by `sourceAccount`.
- **Date range** — `<select>` of "All dates" + each month present in the data
  (e.g. "May 2026"), derived from `postedDate`. Filters by month. This is the
  pragmatic real-data stand-in for the mockup's month picker.
- **Tabs** — All / Pending / Matched / Transfers, each showing its bucket count.
  `All` shows both groups; `Pending` shows only the pending bucket; `Matched`
  shows only matched; `Transfers` shows only transfers.

Filters compose: account + date narrow the set first, then the active tab
selects which bucket(s) to show. Counts in the tabs reflect the
account/date-filtered set.

## List row

Replace bordered cards with hairline-separated table rows. Columns:

| date | description | category chip | amount | status glyph |
|------|-------------|---------------|--------|--------------|

- **date** — mono, muted (e.g. `May 8`).
- **description** — mono.
- **category chip** — lapis wash when a real suggested account exists; ochre /
  highlight wash for `Transfer → <target>` and `Uncategorized`.
- **amount** — mono, right-aligned; negative in default ink, positive prefixed
  `+`.
- **status glyph** — small trailing icon (decorative, matches mockup).

Selected row = full lapis-bg (`accent-bg`). Hover = `bg-subtle`.

## Inspector (`InboxInspector.tsx`)

Sections, top to bottom:

1. **Head** — `PENDING · SELECTED` eyebrow; large mono amount; mono title
   (`description`); meta line `formatDate(postedDate) · sourceAccount`. No
   masked account number.
2. **Suggestion card** (rendered only when `suggestedLedgerAccount` or
   `aiSuggestion` exists) — `AI SUGGESTION` badge when `aiSuggestion` is present,
   else `RULE SUGGESTION`; `NN% confident` from `aiSuggestion.confidence` (when
   numeric); the suggested account (mono); the `aiSuggestion.explanation` text.
   Actions: **Accept** (primary — one-click `onApprove` with the suggested
   account) · **Edit** (reveals the account input form) · chevron.
3. **Posting** — Payee (`aiSuggestion.payee`), Narration
   (`aiSuggestion.narration`, else `Add a note…` placeholder, ghost/italic),
   Category (suggested-account chip), Counter Account (`sourceAccount`).
4. **Source Record** — key/value rows: Statement memo (`description`), Posted
   (`postedDate`), Import batch (`sourceFileName`), Statement ID
   (`statementRowId`).

### Edit mode

"Edit" reveals the existing ledger-account input (datalist of `knownAccounts`,
new-account hint) and an Approve button — the current standard-entry approval
flow, preserved.

### Transfer entries

A transfer entry keeps the existing match flow inside this same panel: show the
linked row / "Awaiting matching row", **Approve Transfer** (or "Needs matching
row"), and "Not a transfer — treat as expense" (revert) when unmatched.

### Empty state

When there are no pending entries, keep the existing empty-state copy.

## Keyboard navigation + status hints

- **J / ↓** — select next entry; **K / ↑** — select previous, over the current
  filtered, flat list order.
- **Enter** — accept the selected entry when it has a suggestion (standard) or a
  matched transfer; calls `onApprove` / `onApproveTransfer`.
- **E** — enter edit mode (focus the account input) for the selected entry.
- Active only when the Inbox screen is focused and focus is not inside an input
  / textarea / select. Implemented via a `keydown` listener in a `InboxPanel`
  effect.

Status bar: add a `statusHints?: ReactNode` prop to `AppShell`. On the Inbox
screen, App passes hints rendered between the left context and the right
cluster: `⏎ Accept · J / K Navigate · E Edit`. The right cluster (ledger
status / git) is unchanged. No sync text.

## Styling

Follow `DESIGN.md`: hairlines over shadows, lapis as the only interactive
accent, ochre for decorative chips only, mono for ledger data, system font for
chrome. New/updated CSS classes in `src/styles.css`:

- Toolbar: `.inbox-toolbar`, `.inbox-filter`, `.inbox-tabs`, `.inbox-tab`
  (+ active).
- List: replace `.inbox-row` card styling with a dense table treatment;
  `.inbox-group-head`; chip variants (`--rule`/lapis, `--transfer`/ochre,
  `--uncategorized`/ochre).
- Inspector: `.inbox-suggestion-card`, `.inbox-posting`, `.inbox-field`,
  `.inbox-source-record`.
- Status bar: `.status-bar-hints`.

## Testing

Update `src/features/workspace/InboxPanel.test.tsx` to cover:

- Grouping into "needs review" (pending + transfers) vs "matched by rules".
- Tab filtering (All / Pending / Matched / Transfers) and tab counts.
- Account filter and date-range filter narrowing the list.
- Inspector content: suggestion card (badge, confidence, explanation), posting
  fields, source-record key/values.
- Keyboard nav: J/K selection movement and Enter accept.

## Out of scope

- Sidebar footer (ADR 0002).
- Real remote sync / "Synced" status.
- Masked source-account numbers.
- A backend feed of already-posted ("auto-posted") rows — the "Matched by rules"
  group is derived from pending rows that carry a suggestion, not from posted
  history.
