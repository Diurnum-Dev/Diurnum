# Plan: Rename Ledger Account updates all references

Issue: https://github.com/Diurnum-Dev/Diurnum/issues/82

## Goal

An explicit, user-invoked **Rename Ledger Account** refactor command that rewrites every
reference to an account across the Workspace — like renaming a file in Obsidian updates
all wikilinks. Never triggered by autosave or Manual Ledger Edits in the Ledger Editor.

## Current state

- `settings::rename_source_account` renames Source Accounts only (last segment of
  `Assets:Bank:*` / `Liabilities:CreditCards:*`). It rewrites `accounts.bean`,
  `opening-balances.bean`, the SQLite rows (`source_mappings`, `statement_rows`,
  `categorization_rules`), and the `documents/<slug>/` folder — but **not** postings in
  Monthly Transaction Files, other directives, or Diurnum Entry Metadata
  (`source_account: "..."` / `linked_source_account: "..."` beancount metadata lines).
- `data_integrity` provides `atomic_write`, `create_snapshot` (covers all `*.bean` files),
  and snapshot restore. `SnapshotReason` has `Approval | Daily | PreRestore`.
- `data_integrity::ledger_files` (private) walks the workspace collecting `.bean` files,
  skipping `.diurnum/` and `.ledgerly/`.
- Tauri commands live in `commands/workspace.rs`, registered in `lib.rs`, wrapped by
  `view::load_from_summary(...)` so the Workspace Session refreshes as one unit.
- Frontend: typed API in `src/lib/workspace/api.ts`, session store in
  `src/lib/workspace/session.ts`, Command Palette in
  `src/features/workspace/CommandPalette.tsx`, Source Account rename UI in
  `SettingsPanel.tsx`.

## Design

### Contract (shared backend/frontend)

New Tauri commands:

- `preview_account_rename(input: RenameAccountInput) -> AccountRenamePreview`
- `rename_account(input: RenameAccountInput) -> WorkspaceView`

```rust
RenameAccountInput {
  workspaceRootPath: String,
  oldAccount: String,        // full path, e.g. "Expenses:Spotify"
  newAccount: String,        // full path, e.g. "Expenses:Subscriptions:Spotify"
  merge: bool,               // default false
}

AccountRenamePreview {
  oldAccount: String,
  newAccount: String,
  merge: bool,
  destinationExists: bool,           // true when newAccount already has an `open` directive
  sourceAccount: bool,               // true when oldAccount is a Source Account
  changes: Vec<AccountRenameFileChange>,
}

AccountRenameFileChange {
  relativePath: String,              // .bean file, SQLite label, or documents folder
  lines: Vec<AccountRenameLineChange>, // empty for SQLite/documents entries
}

AccountRenameLineChange { lineNumber: usize, before: String, after: String }
```

Errors: `WorkspaceErrorCode::InvalidLedger` with a clear message when the destination
exists and `merge == false` ("Account already exists. Choose merge to consolidate.").

### Backend — new module `src-tauri/src/workspace/rename_account.rs`

1. **Pure rewriter** `rewrite_account_references(contents, old, new) -> (String, Vec<AccountRenameLineChange>)`:
   - Rewrites a whitespace-delimited token that is **exactly equal** to `old` (no subtree
     renames: renaming `Expenses:Food` must not touch `Expenses:Food:Restaurants`).
     This covers postings and `open`/`close`/`balance`/`pad`/`note` directives.
   - Rewrites quoted metadata values `"old"` on `source_account:` and
     `linked_source_account:` metadata lines (Diurnum Entry Metadata).
   - Otherwise preserves file contents byte-for-byte.
2. **Validation**: `oldAccount` must be a known account (has an `open` directive or at
   least one reference); `newAccount` must be valid beancount account syntax and
   different from `oldAccount`; destination `open` directive existing ⇒ block unless
   `merge == true`.
3. **Preview**: walk all `.bean` files (reuse `ledger_files`, made `pub(crate)`), run the
   pure rewriter, collect changes; add entries for SQLite rows and the documents folder
   when the account is a Source Account.
4. **Apply** (`rename_account`):
   - Create a Snapshot first (`SnapshotReason::RenameAccount` — new variant).
   - Back up `.diurnum/diurnum.sqlite` to a temp file (snapshots only cover `.bean`).
   - Compute all new file contents up front; then apply: `atomic_write` each `.bean`
     file, update the three SQLite tables, rename `documents/<slug>/` for Source Accounts.
   - On **any** failure mid-rewrite: restore original `.bean` contents, restore the
     SQLite backup, reverse the documents folder rename — Workspace left byte-identical.
   - On success: `open_workspace(root)` → Ledger Validation runs and the Workspace
     Session refreshes as one unit.
5. **Delegate**: `settings::rename_source_account` keeps its input shape (still applies
   the optional opening-balance update) but performs the rename by delegating to
   `rename_account`, so the Settings flow behaves identically to the general command.
6. Wire commands in `commands/workspace.rs` + `lib.rs`.

Rust tests cover every acceptance criterion, including a simulated mid-rewrite failure
(inject an unreadable/invalid path) leaving the Workspace byte-identical, merge
blocked/allowed, no-subtree rename, and metadata rewrite.

### Frontend

- `api.ts`: types + `previewAccountRename` / `renameAccount` (+ `__DIURNUM_TEST_API__` stubs).
- `session.ts`: session actions following the existing `renameSourceAccount` pattern.
- `CommandPalette.tsx`: "Rename Ledger Account…" action opening a dialog:
  old account picker (existing `AccountCombobox`), new account input, live preview from
  `preview_account_rename` rendered as a per-file before/after line list, confirm/cancel.
  When the destination exists, show the error and offer an explicit **Merge** checkbox.
- Editing an account name directly in the Ledger Editor does **not** trigger a rename
  (no hook into the save path — verified by absence of wiring, plus a test that
  `saveLedgerEditorSession` never calls rename APIs).
- Vitest coverage for session actions and the dialog flow.

### Docs / process

- Update `docs/architecture.md` to include the rename command in the command bridge and
  Data Integrity Layer description.
- PR body links `Closes #82`.

## Execution

1. Worker subagent A (backend) → `cargo test` green.
2. Worker subagent B (frontend) against the real commands → `npm run typecheck` + `npm test` green.
3. Reviewer subagent checks the diff against the issue acceptance criteria.
4. Update architecture docs, run full suites, open PR.

Out of scope (per issue): subtree renames, detecting External Ledger Edits, Settings UI
restructuring beyond delegation, multi-account consolidation.
