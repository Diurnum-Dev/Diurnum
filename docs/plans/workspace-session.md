# Plan: Workspace Session module

Deepen the open Workspace into a single module. Today `src/App.tsx` (~1,524
lines) holds ~25 `useState` slices that together *are* the open Workspace, plus
~12 mutation handlers that each hand-copy the same "mutate → refetch derived
data → refresh git → queue backup" sequence. The invariant earns its keep but
has no home and is already drifting (Approval refetches `knownAccounts`; import
does not).

See: **Workspace Session** in `CONTEXT.md`; navigation reversal in
`docs/adr/0003-post-approval-inbox-triage-flow.md`.

## Locked design

- **Shape** — a plain object store (`createWorkspaceSession(api)`) owning state +
  `subscribe`/`getState` + intent methods. React subscribes via
  `useSyncExternalStore`. The store is testable with **zero React** — the store
  interface is the test surface.
- **Refresh** — backend returns one `WorkspaceView` per mutation; the store
  calls `setView(view)`. No frontend fan-out.
- **WorkspaceView contents** — `summary, suggestedEntries, knownAccounts,
  brokenProvenance, categorizationRules, sourceAccounts, snapshots, gitStatus,
  gitPanel`. **Off the view:** `reports` (on-demand, auto-nulled when ledger
  invalid), `detectedAdapters` (open-time PATH scan), `aiAdapterConfig` /
  `aiContextDisclosure` / `gitIdentity` (refreshed on open + their own settings
  actions).
- **Side-effects** — session owns domain data + git (backup timer + semantic
  commits). App owns navigation/UI. After Approval, App advances Inbox
  selection; it does **not** navigate to the editor (ADR 0003).
- **Errors** — session sets `state.error` (via `userFacingError`, moved into the
  session) **and** rejects, so Settings forms can still `await`/`catch` for
  inline errors.

## Build sequence

Each slice is independently shippable and verifiable. Land them in order.

### Slice 1 — Backend `WorkspaceView` (candidate 2 prerequisite)

Files: `src-tauri/src/workspace/types.rs`, `.../approval.rs`, `.../imports.rs`,
`.../source_accounts.rs`, `.../settings.rs`, `.../data_integrity.rs`,
`src-tauri/src/commands/workspace.rs`.

- Add `WorkspaceView` struct = `WorkspaceSummary` + the volatile derived set
  above. Add one assembler `workspace::view::load(root) -> WorkspaceView` that
  composes the existing `approval::get_suggested_entries`,
  `get_known_ledger_accounts`, `get_broken_provenance`,
  `categorization_rules::list`, `settings::list_source_accounts`,
  `data_integrity::list_snapshots`, `shell::get_workspace_git_status`,
  `git::get_git_panel_state`. This is the **deep** module: one call, the whole
  view; it owns the "what's in a refreshed view" knowledge.
- Add `#[tauri::command] get_workspace_view(path)`.
- Change the mutation commands that currently return `WorkspaceSummary` to
  return `WorkspaceView`: `approve_suggested_entry`, `approve_transfer_entry`,
  `revert_transfer_to_standard`, `import_statement_rows` (wrap its
  `CsvImportResult` alongside the view), `add_source_account`,
  `rename_source_account`, `close_source_account`,
  `update_source_account_opening_balance`, `restore_snapshot`,
  `update_workspace_metadata`.
- Tests: assembler returns a coherent view after each mutation; invalid-ledger
  view still parses. Existing command tests in `commands/workspace.rs` updated
  to assert on `view.summary`.

Verify: `cargo test` in `src-tauri`.

### Slice 2 — The session store (no React)

Files: new `src/lib/workspace/session.ts`,
`src/lib/workspace/session.test.ts`. Move `userFacingError` out of `App.tsx`
into here (or a shared util).

- `createWorkspaceSession(api: WorkspaceApi): WorkspaceSession`.
- State: the view fields + `reports`, `detectedAdapters`, `aiAdapterConfig`,
  `aiContextDisclosure`, `gitIdentity`, `gitWarning`, `gitHookOutput`,
  `ruleOffer`-data?, `error`. (Keep `ruleOffer` in App — it is UI offer state;
  the session only supplies the data Approval produced.)
- `subscribe(cb) => unsubscribe`, `getState()` returning a stable snapshot.
- Internal `setView(view)` updates the volatile set in one shot, applies the
  reports/invalid-ledger invariant (`if view.summary.ledgerStatus === 'invalid'
  → reports = null`), notifies subscribers.
- Lifecycle: `open(path)` / `create(input)` load `get_workspace_view` + the
  open-time extras (`detectedAdapters`, `gitIdentity`, `aiAdapterConfig`,
  `aiContextDisclosure`); `close()` resets + clears the git backup timer +
  fires the final backup commit.
- Mutations: `approve`, `approveTransfer`, `revertTransfer`, `importRows`,
  `addSourceAccount`, `renameSourceAccount`, `closeSourceAccount`,
  `updateOpeningBalance`, `restoreSnapshot`, `updateMetadata`, rule CRUD,
  `configureAiAdapter`, `loadReports`, `validate`, `saveSourceMapping`,
  `commit`/git. Each: `await api.x()` → `setView` (or targeted set for non-view
  mutations like rules) → `queueGitBackup()`; on error set `state.error` and
  rethrow. `approve`/`approveTransfer` resolve with `{ statementRowId }`.
- Git timer + `commitWorkspaceChanges(message, paths)` move here verbatim from
  `App.tsx`.

Tests (the payoff): inject the existing `__DIURNUM_TEST_API__` fake as `api`.
Assert the refresh invariant directly — e.g. after `approve`, `suggestedEntries`
shrinks and `knownAccounts` is refreshed; after going invalid, `reports` is
null. No React render.

Verify: `npm test src/lib/workspace/session.test.ts`.

### Slice 3 — Wire `App.tsx` to the store

Files: `src/App.tsx`.

- Instantiate the session once (`useRef`/module singleton). Read state with
  `const state = useSyncExternalStore(session.subscribe, session.getState)`.
- Replace each `handleX` body with `session.x(...)`. Delete the ~25 `useState`
  slices the session now owns and the per-handler refetch blocks.
- Keep in App: pure UI/nav state — `view`, `activeScreen`, `ledgerRequested*`,
  `switcherOpen`, command palette, `recentWorkspaces`/`recentCommands`,
  `updatePrefs`, `ruleOffer` (offer UI), `createTemplate`.
- The `focus`-revalidate, menu sync, badge-count, and recent-paths effects stay
  in App but call `session.validate()` / read `state`.

Verify: existing `src/components/AppShell.test.tsx` and feature tests pass;
manual smoke via `npm run tauri dev` — create, import, approve, restore.

### Slice 4 — Inbox triage flow (ADR 0003)

Files: `src/App.tsx`, `src/features/workspace/InboxPanel.tsx`.

- Remove the post-Approval `setActiveScreen("ledger")` + requested-file jumps.
- InboxPanel selection keyed by `statementRowId`; on `suggestedEntries` change,
  if the selected id is gone, advance to the next-nearest row (clear if empty).
- App's approve handler: `const { statementRowId } = await session.approve(...)`
  then set the `ruleOffer` from the approved entry (no navigation).

Tests: `InboxPanel.test.tsx` — approving the selected row advances selection to
the next; approving the last row clears selection; no navigation occurs.

### Slice 5 — Cleanup

- Delete now-dead helpers in `App.tsx` (`refreshGitStatus`, `refreshGitPanel`,
  `queueGitBackupCommit`, `clearGitBackupTimer`, `commitGitWorkspaceChanges`,
  `emptyGitStatus` — all moved into the session).
- Confirm `App.tsx` is render + UI/nav only (target: well under ~600 lines).
- Update `docs/architecture.md` (Data Ownership Map) to show the Workspace
  Session as the single owner of derived Workspace data feeding the screens.

## Tests that survive / improve

- The `__DIURNUM_TEST_API__` fake is reused as the session's injected `api` — the
  same backend seam, now consumed by a unit-testable store.
- The refresh invariant gains direct tests for the first time (Slice 2).
- Component tests shrink: screens render from `state`, they no longer drive
  orchestration.

## Risks / watch-outs

- **Snapshot/restore + git ordering** — `restoreSnapshot` refreshes the most
  (11 fetches today). Make sure `setView` + open-time extras cover everything it
  touched.
- **Settings inline errors** — preserve the dual "set `state.error` *and*
  reject" behaviour or Settings forms lose their inline error UX.
- **Badge count / menu sync** read `state` derived values; verify they still
  fire when the session notifies.
- Land Slice 1 fully (backend returning `WorkspaceView`) before Slice 2, or the
  store has nothing coherent to `setView`.
