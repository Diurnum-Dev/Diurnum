# AI Assist Bulk Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button-triggered batch AI pass that categorizes all pending Inbox rows through the BYO adapter, reviewed in a category-at-a-time momentum flow and approved as one atomic, revertible batch.

**Architecture:** A new Rust module `ai_assist.rs` owns the chunked batch adapter protocol, SQLite persistence of passes/suggestions/proposed rules, atomic batch approval (reusing the existing single-entry approval helpers), and batch revert. The frontend adds a review mode to the Inbox (`AiAssistReview.tsx`) driven by a chunk-polling loop in `App.tsx`. Spec: `docs/superpowers/specs/2026-07-14-ai-assist-bulk-categorization-design.md`. Canonical UI mockup: `docs/html-mockups/ai-assist-review-c-flow.html`.

**Tech Stack:** Rust (Tauri 2, rusqlite, serde), React + TypeScript, vitest + @testing-library/react, Playwright.

## Global Constraints

- Batch protocol: `type: "batchSuggestionRequest"`, `version: 1`. Chunk size **40** (`AI_ASSIST_CHUNK_SIZE`). Needs-eye confidence threshold **0.6** (`NEEDS_EYE_CONFIDENCE_THRESHOLD`).
- Provenance metadata key written to approved entries: `ai_assist_batch_id`.
- SQLite tables (all in `.diurnum/diurnum.sqlite`): `ai_assist_passes`, `ai_assist_pass_rows`, `ai_assist_suggestions`, `ai_assist_proposed_rules`, `ai_assist_batches`.
- Suggestion status values (string enums, camelCase over the wire): pass status `"running" | "complete" | "dismissed" | "approved"`; suggestion status `"suggested" | "needsEye" | "failed"`.
- No confidence percentages in the UI. The only user-facing distinction is accepted vs. needs-your-eye.
- All Rust structs crossing the Tauri boundary use `#[serde(rename_all = "camelCase")]` (existing convention).
- Every new frontend api function must check `window.__DIURNUM_TEST_API__` first (existing convention; add new methods to the `WorkspaceApi` type as **optional** so existing test doubles keep compiling).
- Run `cargo fmt` (in `src-tauri/`) before every Rust commit — CI enforces formatting.
- Rust tests: `cd src-tauri && cargo test workspace::ai_assist`. Frontend tests: `npx vitest run <file>`.
- The existing **per-row** adapter contract in `ai_adapter.rs` stays intact (Ledger Editor ghost text uses it). AI Assist adds the batch envelope on the same configured command.

## File Structure

| File | Responsibility |
|---|---|
| Create `src-tauri/src/workspace/ai_assist.rs` | Batch protocol types, pass lifecycle, chunk execution, persistence, batch approve/revert |
| Modify `src-tauri/src/workspace/ai_adapter.rs` | Extract reusable raw adapter invocation; make context helpers `pub(crate)` |
| Modify `src-tauri/src/workspace/approval.rs` | Make single-entry helpers `pub(crate)`; remove per-row AI fallback from suggestion layers |
| Modify `src-tauri/src/workspace/mod.rs` | Register `ai_assist` module |
| Modify `src-tauri/src/commands/workspace.rs`, `src-tauri/src/lib.rs` | New Tauri commands + registration |
| Create `src/features/workspace/aiAssistGroups.ts` (+ test) | Pure grouping/partition logic for review UI |
| Create `src/features/workspace/AiAssistReview.tsx` (+ test) | Momentum-flow review component (rail, group card, signing summary) |
| Modify `src/features/workspace/InboxPanel.tsx` | AI Assist button, disclosure gate, review-mode swap |
| Modify `src/lib/workspace/types.ts`, `api.ts`, `session.ts` | New types, invoke wrappers, session methods |
| Modify `src/App.tsx` | Pass state, chunk-loop driver, handlers, post-import entry point |
| Create `docs/ai-assist-adapter.md` | Reference adapter contract + Claude Code CLI wrapper |
| Create `e2e/ai-assist.spec.ts` | Golden-path e2e via `__DIURNUM_TEST_API__` double |
| Modify `docs/architecture.md` | Document the new flow (repo rule in AGENTS.md) |

---

### Task 1: Batch adapter protocol types and invocation

**Files:**
- Modify: `src-tauri/src/workspace/ai_adapter.rs`
- Create: `src-tauri/src/workspace/ai_assist.rs`
- Modify: `src-tauri/src/workspace/mod.rs`

**Interfaces:**
- Consumes: `ai_adapter::split_command` (make `pub(crate)`), new `ai_adapter::invoke_adapter_raw`.
- Produces (used by Tasks 2–5 and 7):
  - `pub struct BatchSuggestionRequest { r#type: String, version: u32, shared_context: SharedContext, rows: Vec<BatchRow> }`
  - `pub struct SharedContext { chart_of_accounts: Vec<String>, categorization_rules: Vec<CategorizationRule>, business_profile: AiBusinessProfile, recent_approved_entries: Vec<SimilarApprovedEntry> }`
  - `pub struct BatchRow { id: String, posted_date: String, description: String, source_account: String, source_amount: String }`
  - `pub struct BatchSuggestionResponse { suggestions: Vec<BatchSuggestion>, proposed_rules: Vec<ProposedRule> }`
  - `pub struct BatchSuggestion { row_id: String, ledger_account: Option<String>, payee: Option<String>, narration: Option<String>, confidence: Option<f64>, explanation: Option<String>, needs_human_attention: bool }`
  - `pub struct ProposedRule { match_text: String, source_account: String, ledger_account: String, matched_row_ids: Vec<String> }`
  - `pub(crate) fn invoke_batch_adapter(command: &str, request: &BatchSuggestionRequest) -> Result<BatchSuggestionResponse, WorkspaceError>`

- [ ] **Step 1: Extract raw invocation in `ai_adapter.rs`**

In `ai_adapter.rs`, change `fn split_command` to `pub(crate) fn split_command`, and refactor `invoke_adapter` so process spawning is a reusable payload-in/bytes-out function. Replace the body of `invoke_adapter` with a call to the new function:

```rust
pub(crate) fn invoke_adapter_raw(
    command: &str,
    payload: &[u8],
) -> Result<Vec<u8>, WorkspaceError> {
    let parts = split_command(command)?;
    let Some((program, args)) = parts.split_first() else {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "BYO AI Adapter command cannot be empty.",
        ));
    };
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| WorkspaceError::io(format!("BYO AI Adapter failed to start: {error}")))?;
    {
        let stdin = child.stdin.as_mut().ok_or_else(|| {
            WorkspaceError::io("BYO AI Adapter stdin was not available.".to_string())
        })?;
        stdin.write_all(payload)?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(WorkspaceError::io(format!(
            "BYO AI Adapter exited unsuccessfully: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(output.stdout)
}

fn invoke_adapter(
    command: &str,
    context: &CuratedLedgerContext,
) -> Result<AiSuggestion, WorkspaceError> {
    let payload =
        serde_json::to_vec(context).map_err(|error| WorkspaceError::io(error.to_string()))?;
    let stdout = invoke_adapter_raw(command, &payload)?;
    serde_json::from_slice::<AiSuggestion>(&stdout).map_err(|error| {
        WorkspaceError::io(format!("BYO AI Adapter returned invalid JSON: {error}"))
    })
}
```

Also make these `pub(crate)` (Task 3 reuses them): `read_manifest`, `read_chart_of_accounts`, `load_adapter_command`, `open_connection`.

- [ ] **Step 2: Write the failing test in a new `ai_assist.rs`**

Create `src-tauri/src/workspace/ai_assist.rs` containing only the test module for now:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    pub(crate) fn write_adapter_script(dir: &std::path::Path, response_json: &str) -> String {
        let adapter_path = dir.join("batch-adapter.sh");
        fs::write(
            &adapter_path,
            format!("#!/bin/sh\ncat > \"$0.received\"\nprintf '%s' '{response_json}'\n"),
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&adapter_path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&adapter_path, permissions).unwrap();
        }
        adapter_path.to_string_lossy().to_string()
    }

    #[test]
    fn batch_adapter_round_trips_versioned_envelope() {
        let tempdir = tempfile::tempdir().unwrap();
        let command = write_adapter_script(
            tempdir.path(),
            r#"{"suggestions":[{"rowId":"row-1","ledgerAccount":"Expenses:Software","payee":"Autobooks","narration":"Monthly fee","confidence":0.93,"explanation":"Matched vendor.","needsHumanAttention":false}],"proposedRules":[{"matchText":"WEB PMTS Autobooks","sourceAccount":"Assets:Bank:Checking","ledgerAccount":"Expenses:Software","matchedRowIds":["row-1"]}]}"#,
        );
        let request = BatchSuggestionRequest {
            r#type: "batchSuggestionRequest".to_string(),
            version: 1,
            shared_context: SharedContext {
                chart_of_accounts: vec!["Expenses:Software".to_string()],
                categorization_rules: vec![],
                business_profile: crate::workspace::ai_adapter::AiBusinessProfile {
                    name: "Acme".to_string(),
                    base_currency: "USD".to_string(),
                    books_start_date: "2026-01-01".to_string(),
                },
                recent_approved_entries: vec![],
            },
            rows: vec![BatchRow {
                id: "row-1".to_string(),
                posted_date: "2026-05-07".to_string(),
                description: "WEB PMTS Autobooks, Inc. WEB".to_string(),
                source_account: "Assets:Bank:Checking".to_string(),
                source_amount: "-0.50".to_string(),
            }],
        };

        let response = invoke_batch_adapter(&command, &request).unwrap();

        assert_eq!(response.suggestions.len(), 1);
        assert_eq!(response.suggestions[0].row_id, "row-1");
        assert_eq!(
            response.suggestions[0].ledger_account.as_deref(),
            Some("Expenses:Software")
        );
        assert_eq!(response.proposed_rules.len(), 1);
        let received = fs::read_to_string(format!("{command}.received")).unwrap();
        assert!(received.contains("\"type\":\"batchSuggestionRequest\""));
        assert!(received.contains("\"version\":1"));
        assert!(received.contains("\"chartOfAccounts\""));
    }

    #[test]
    fn batch_adapter_bad_json_is_an_error() {
        let tempdir = tempfile::tempdir().unwrap();
        let command = write_adapter_script(tempdir.path(), "not json");
        let request = BatchSuggestionRequest {
            r#type: "batchSuggestionRequest".to_string(),
            version: 1,
            shared_context: SharedContext {
                chart_of_accounts: vec![],
                categorization_rules: vec![],
                business_profile: crate::workspace::ai_adapter::AiBusinessProfile {
                    name: "Acme".to_string(),
                    base_currency: "USD".to_string(),
                    books_start_date: "2026-01-01".to_string(),
                },
                recent_approved_entries: vec![],
            },
            rows: vec![],
        };
        assert!(invoke_batch_adapter(&command, &request).is_err());
    }
}
```

Register the module in `src-tauri/src/workspace/mod.rs` (add `pub mod ai_assist;` alongside the existing `pub mod ai_adapter;`).

- [ ] **Step 3: Run to verify failure**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: compile error — `BatchSuggestionRequest` / `invoke_batch_adapter` not found.

- [ ] **Step 4: Implement the protocol types**

At the top of `ai_assist.rs` (above the test module):

```rust
use crate::workspace::ai_adapter::{
    invoke_adapter_raw, AiBusinessProfile, SimilarApprovedEntry,
};
use crate::workspace::categorization_rules::CategorizationRule;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use serde::{Deserialize, Serialize};

pub const AI_ASSIST_CHUNK_SIZE: usize = 40;
pub const NEEDS_EYE_CONFIDENCE_THRESHOLD: f64 = 0.6;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSuggestionRequest {
    pub r#type: String,
    pub version: u32,
    pub shared_context: SharedContext,
    pub rows: Vec<BatchRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedContext {
    pub chart_of_accounts: Vec<String>,
    pub categorization_rules: Vec<CategorizationRule>,
    pub business_profile: AiBusinessProfile,
    pub recent_approved_entries: Vec<SimilarApprovedEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRow {
    pub id: String,
    pub posted_date: String,
    pub description: String,
    pub source_account: String,
    pub source_amount: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSuggestionResponse {
    #[serde(default)]
    pub suggestions: Vec<BatchSuggestion>,
    #[serde(default)]
    pub proposed_rules: Vec<ProposedRule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSuggestion {
    pub row_id: String,
    pub ledger_account: Option<String>,
    #[serde(default)]
    pub payee: Option<String>,
    #[serde(default)]
    pub narration: Option<String>,
    #[serde(default)]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub explanation: Option<String>,
    #[serde(default)]
    pub needs_human_attention: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedRule {
    pub match_text: String,
    pub source_account: String,
    pub ledger_account: String,
    #[serde(default)]
    pub matched_row_ids: Vec<String>,
}

pub(crate) fn invoke_batch_adapter(
    command: &str,
    request: &BatchSuggestionRequest,
) -> Result<BatchSuggestionResponse, WorkspaceError> {
    let payload =
        serde_json::to_vec(request).map_err(|error| WorkspaceError::io(error.to_string()))?;
    let stdout = invoke_adapter_raw(command, &payload)?;
    serde_json::from_slice::<BatchSuggestionResponse>(&stdout).map_err(|error| {
        WorkspaceError::io(format!(
            "BYO AI Adapter returned invalid batch JSON: {error}"
        ))
    })
}
```

(`WorkspaceErrorCode` is unused until Task 2 — keep the import; the compiler warning is fine and disappears in Task 2.)

- [ ] **Step 5: Run to verify pass**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: 2 tests PASS. Also run `cargo test workspace::ai_adapter` — existing 3 adapter tests still PASS.

- [ ] **Step 6: Commit**

```bash
cd src-tauri && cargo fmt && cd ..
git add src-tauri/src/workspace/ai_assist.rs src-tauri/src/workspace/ai_adapter.rs src-tauri/src/workspace/mod.rs
git commit -m "feat(ai-assist): add versioned batch adapter protocol"
```

---

### Task 2: Pass persistence, eligibility, start/get pass

**Files:**
- Modify: `src-tauri/src/workspace/ai_assist.rs`
- Modify: `src-tauri/src/workspace/approval.rs` (remove per-row AI fallback)

**Interfaces:**
- Consumes: `approval::get_suggested_entries`, `SuggestedEntry`, `SuggestedEntryKind`.
- Produces (used by Tasks 3–7):
  - `pub struct AiAssistPassState { pass_id: String, status: String, total_rows: i64, processed_rows: i64, suggestions: Vec<AiAssistSuggestionState>, proposed_rules: Vec<AiAssistProposedRuleState> }`
  - `pub struct AiAssistSuggestionState { statement_row_id: String, status: String, ledger_account: Option<String>, payee: Option<String>, narration: Option<String>, confidence: Option<f64>, explanation: Option<String> }`
  - `pub struct AiAssistProposedRuleState { id: String, source_account: String, match_text: String, ledger_account: String, matched_row_count: i64 }`
  - `pub fn start_ai_assist_pass(workspace_root_path: impl AsRef<Path>) -> Result<AiAssistPassState, WorkspaceError>`
  - `pub fn get_ai_assist_pass(workspace_root_path: impl AsRef<Path>) -> Result<Option<AiAssistPassState>, WorkspaceError>` (latest pass with status `running` or `complete`)
  - `pub(crate) fn ensure_ai_assist_tables(connection: &Connection) -> Result<(), WorkspaceError>`
  - `pub(crate) fn load_ai_assist_state(connection: &Connection, pass_id: &str) -> Result<AiAssistPassState, WorkspaceError>`

**Behavior change folded in:** `approval.rs::apply_suggestion_layers` currently calls the per-row adapter for every unmatched row when an adapter is configured — that is the slow retail path AI Assist replaces. Delete the AI fallback block; the `ai_suggestion` field stays on `SuggestedEntry` (always `None` from this layer now).

- [ ] **Step 1: Write failing tests**

Add to the `tests` module in `ai_assist.rs` (the fixture helpers are shared by later tasks — write them now):

```rust
    use crate::workspace::create::create_workspace;
    use crate::workspace::types::CreateWorkspaceInput;
    use rusqlite::{params, Connection};
    use std::path::Path;

    pub(crate) fn test_workspace(tempdir: &tempfile::TempDir) -> String {
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        // Boundary validation needs a chart: open the accounts our fixtures use.
        let accounts_path = Path::new(&created.root_path).join("accounts.bean");
        let mut accounts = fs::read_to_string(&accounts_path).unwrap();
        for account in [
            "Assets:Bank:Checking",
            "Expenses:Software",
            "Expenses:Payroll",
        ] {
            if !accounts.contains(account) {
                accounts.push_str(&format!("2026-01-01 open {account} USD\n"));
            }
        }
        fs::write(&accounts_path, accounts).unwrap();
        created.root_path
    }

    pub(crate) fn open_test_connection(root: &str) -> Connection {
        Connection::open(Path::new(root).join(".diurnum").join("diurnum.sqlite")).unwrap()
    }

    pub(crate) fn insert_pending_row(connection: &Connection, id: &str, description: &str, amount: &str) {
        crate::workspace::imports::ensure_import_tables(connection).unwrap();
        connection
            .execute(
                "insert into statement_rows (id, source_account, source_file_name, posted_date, description, source_amount, import_fingerprint, supporting_fields_json, raw_row_json, status, imported_at)
                 values (?1, 'Assets:Bank:Checking', 'checking.csv', '2026-05-06', ?2, ?3, ?4, '{}', '{}', 'pending', '2026-05-06T00:00:00Z')",
                params![id, description, amount, format!("fp-{id}")],
            )
            .unwrap();
    }

    #[test]
    fn start_pass_selects_pending_standard_rows_without_rule_match() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "WEB PMTS Autobooks, Inc. WEB", "-0.50");
        insert_pending_row(&connection, "row-2", "FEE 122111 GUSTO CCD", "-65.02");
        // Rule-matched rows are excluded: rules categorize them for free.
        crate::workspace::categorization_rules::create_categorization_rule(
            crate::workspace::categorization_rules::CreateCategorizationRuleInput {
                workspace_root_path: root.clone(),
                source_account: "Assets:Bank:Checking".to_string(),
                match_text: "GUSTO".to_string(),
                ledger_account: "Expenses:Payroll".to_string(),
            },
        )
        .unwrap();

        let state = start_ai_assist_pass(&root).unwrap();

        assert_eq!(state.status, "running");
        assert_eq!(state.total_rows, 1);
        assert_eq!(state.processed_rows, 0);
        assert!(state.suggestions.is_empty());
    }

    #[test]
    fn get_pass_returns_latest_active_and_none_when_absent() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        assert!(get_ai_assist_pass(&root).unwrap().is_none());

        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "Something", "-1.00");
        let started = start_ai_assist_pass(&root).unwrap();

        let fetched = get_ai_assist_pass(&root).unwrap().unwrap();
        assert_eq!(fetched.pass_id, started.pass_id);
    }

    #[test]
    fn inbox_suggestion_layers_no_longer_call_adapter_per_row() {
        // With an adapter configured but no rule match, get_suggested_entries
        // must NOT invoke the adapter (AI Assist owns AI now). The configured
        // command would fail loudly if executed.
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        crate::workspace::ai_adapter::configure_ai_adapter(
            crate::workspace::ai_adapter::ConfigureAiAdapterInput {
                workspace_root_path: root.clone(),
                command: Some("/nonexistent/adapter-should-not-run".to_string()),
            },
        )
        .unwrap();
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "Mystery vendor", "-5.00");

        let entries = crate::workspace::approval::get_suggested_entries(&root).unwrap();

        assert_eq!(entries.len(), 1);
        assert!(entries[0].ai_suggestion.is_none());
        assert!(entries[0].suggested_ledger_account.is_none());
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: compile error — `start_ai_assist_pass` not found. (The third test also fails until the fallback is removed.)

- [ ] **Step 3: Implement**

In `approval.rs`, delete the AI fallback from `apply_suggestion_layers` so it reads:

```rust
fn apply_suggestion_layers(
    root: &Path,
    connection: &Connection,
    mut entry: SuggestedEntry,
) -> Result<SuggestedEntry, WorkspaceError> {
    let _ = root;
    if entry.kind == SuggestedEntryKind::Standard {
        if let Some(rule) =
            matching_rule_for_row(connection, &entry.source_account, &entry.description)?
        {
            entry.suggested_ledger_account = Some(rule.ledger_account);
            entry.categorization_rule_id = Some(rule.id);
        }
    }
    Ok(entry)
}
```

Remove the now-unused `use crate::workspace::ai_adapter::{suggestion_for_row, ...}` import pieces (keep `AiSuggestion` and `AiSuggestionRow` — `SuggestedEntry` still has the field and the trait impl). If any existing approval test asserted the per-row AI fallback populates `ai_suggestion`, update it to assert `None`.

In `ai_assist.rs` add:

```rust
use crate::workspace::approval::{get_suggested_entries, SuggestedEntryKind};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistPassState {
    pub pass_id: String,
    pub status: String,
    pub total_rows: i64,
    pub processed_rows: i64,
    pub suggestions: Vec<AiAssistSuggestionState>,
    pub proposed_rules: Vec<AiAssistProposedRuleState>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistSuggestionState {
    pub statement_row_id: String,
    pub status: String,
    pub ledger_account: Option<String>,
    pub payee: Option<String>,
    pub narration: Option<String>,
    pub confidence: Option<f64>,
    pub explanation: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistProposedRuleState {
    pub id: String,
    pub source_account: String,
    pub match_text: String,
    pub ledger_account: String,
    pub matched_row_count: i64,
}

pub(crate) fn ensure_ai_assist_tables(connection: &Connection) -> Result<(), WorkspaceError> {
    connection.execute_batch(
        "
        create table if not exists ai_assist_passes (
          id text primary key,
          started_at text not null,
          status text not null,
          total_rows integer not null
        );
        create table if not exists ai_assist_pass_rows (
          pass_id text not null,
          statement_row_id text not null,
          processed integer not null default 0,
          primary key (pass_id, statement_row_id)
        );
        create table if not exists ai_assist_suggestions (
          pass_id text not null,
          statement_row_id text not null,
          status text not null,
          ledger_account text,
          payee text,
          narration text,
          confidence real,
          explanation text,
          primary key (pass_id, statement_row_id)
        );
        create table if not exists ai_assist_proposed_rules (
          id text primary key,
          pass_id text not null,
          source_account text not null,
          match_text text not null,
          ledger_account text not null,
          matched_row_count integer not null
        );
        create table if not exists ai_assist_batches (
          id text primary key,
          pass_id text not null,
          approved_at text not null,
          entry_count integer not null,
          entries_json text not null,
          rule_ids_json text not null
        );
        ",
    )?;
    Ok(())
}

fn open_workspace_connection(root: &Path) -> Result<Connection, WorkspaceError> {
    Ok(Connection::open(
        root.join(".diurnum").join("diurnum.sqlite"),
    )?)
}

pub fn start_ai_assist_pass(
    workspace_root_path: impl AsRef<Path>,
) -> Result<AiAssistPassState, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = open_workspace_connection(root)?;
    ensure_ai_assist_tables(&connection)?;
    // Eligible: pending standard rows with no rule match. Transfers keep the
    // existing flow; rule matches are categorized deterministically for free.
    let eligible: Vec<String> = get_suggested_entries(root)?
        .into_iter()
        .filter(|entry| {
            entry.kind == SuggestedEntryKind::Standard
                && entry.suggested_ledger_account.is_none()
        })
        .map(|entry| entry.statement_row_id)
        .collect();
    if eligible.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "AI Assist found no pending entries to categorize.",
        ));
    }
    // A new pass supersedes any previous active one.
    connection.execute(
        "update ai_assist_passes set status = 'dismissed' where status in ('running', 'complete')",
        [],
    )?;
    let pass_id = Uuid::new_v4().to_string();
    connection.execute(
        "insert into ai_assist_passes (id, started_at, status, total_rows) values (?1, ?2, 'running', ?3)",
        params![pass_id, Utc::now().to_rfc3339(), eligible.len() as i64],
    )?;
    for statement_row_id in &eligible {
        connection.execute(
            "insert into ai_assist_pass_rows (pass_id, statement_row_id, processed) values (?1, ?2, 0)",
            params![pass_id, statement_row_id],
        )?;
    }
    load_ai_assist_state(&connection, &pass_id)
}

pub fn get_ai_assist_pass(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Option<AiAssistPassState>, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = open_workspace_connection(root)?;
    ensure_ai_assist_tables(&connection)?;
    let pass_id: Option<String> = connection
        .query_row(
            "select id from ai_assist_passes where status in ('running', 'complete') order by started_at desc limit 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    match pass_id {
        Some(pass_id) => Ok(Some(load_ai_assist_state(&connection, &pass_id)?)),
        None => Ok(None),
    }
}

pub(crate) fn load_ai_assist_state(
    connection: &Connection,
    pass_id: &str,
) -> Result<AiAssistPassState, WorkspaceError> {
    let (status, total_rows): (String, i64) = connection.query_row(
        "select status, total_rows from ai_assist_passes where id = ?1",
        [pass_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let processed_rows: i64 = connection.query_row(
        "select count(*) from ai_assist_pass_rows where pass_id = ?1 and processed = 1",
        [pass_id],
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(
        "select statement_row_id, status, ledger_account, payee, narration, confidence, explanation
         from ai_assist_suggestions where pass_id = ?1",
    )?;
    let suggestions = statement
        .query_map([pass_id], |row| {
            Ok(AiAssistSuggestionState {
                statement_row_id: row.get(0)?,
                status: row.get(1)?,
                ledger_account: row.get(2)?,
                payee: row.get(3)?,
                narration: row.get(4)?,
                confidence: row.get(5)?,
                explanation: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut statement = connection.prepare(
        "select id, source_account, match_text, ledger_account, matched_row_count
         from ai_assist_proposed_rules where pass_id = ?1",
    )?;
    let proposed_rules = statement
        .query_map([pass_id], |row| {
            Ok(AiAssistProposedRuleState {
                id: row.get(0)?,
                source_account: row.get(1)?,
                match_text: row.get(2)?,
                ledger_account: row.get(3)?,
                matched_row_count: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(AiAssistPassState {
        pass_id: pass_id.to_string(),
        status,
        total_rows,
        processed_rows,
        suggestions,
        proposed_rules,
    })
}
```

Also make `imports::ensure_import_tables` visibility check: it is already `pub(crate)` — no change needed.

- [ ] **Step 4: Run to verify pass**

Run: `cd src-tauri && cargo test workspace::ai_assist && cargo test workspace::approval`
Expected: all PASS (including the updated approval tests).

- [ ] **Step 5: Commit**

```bash
cd src-tauri && cargo fmt && cd ..
git add src-tauri/src/workspace/ai_assist.rs src-tauri/src/workspace/approval.rs
git commit -m "feat(ai-assist): pass lifecycle tables, eligibility, start/get pass"
```

---

### Task 3: Chunk execution — `run_ai_assist_next_chunk`

**Files:**
- Modify: `src-tauri/src/workspace/ai_assist.rs`

**Interfaces:**
- Consumes: Task 1 protocol + Task 2 persistence; `ai_adapter::{load_adapter_command, read_chart_of_accounts, read_manifest}`; `categorization_rules::list_categorization_rules`.
- Produces: `pub fn run_ai_assist_next_chunk(workspace_root_path: impl AsRef<Path>, pass_id: &str) -> Result<AiAssistPassState, WorkspaceError>` and `fn run_next_chunk_with_size(root: &Path, pass_id: &str, chunk_size: usize) -> Result<AiAssistPassState, WorkspaceError>` (internal, tests use it to force multiple chunks).

Chunk semantics (from spec): select up to `chunk_size` unprocessed pass rows that are still `pending`; call the adapter once; per returned suggestion apply boundary validation — unknown/missing `ledgerAccount`, `needsHumanAttention: true`, or `confidence < 0.6` ⇒ status `needsEye`, otherwise `suggested`; requested rows missing from the response ⇒ `failed`; response rows with unknown ids are ignored. Adapter process failure fails only this chunk's rows. Proposed rules are persisted with duplicate suppression (same source account + match text, against both existing enabled Categorization Rules and rules already proposed in this pass). When no unprocessed rows remain, pass status becomes `complete`.

- [ ] **Step 1: Write failing tests**

```rust
    fn response_for_rows(rows: &[(&str, &str, f64)]) -> String {
        // (row_id, ledger_account, confidence)
        let suggestions = rows
            .iter()
            .map(|(id, account, confidence)| {
                format!(
                    r#"{{"rowId":"{id}","ledgerAccount":"{account}","payee":"Vendor","narration":"Cleaned","confidence":{confidence},"explanation":"Matched.","needsHumanAttention":false}}"#
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!(r#"{{"suggestions":[{suggestions}],"proposedRules":[{{"matchText":"Autobooks","sourceAccount":"Assets:Bank:Checking","ledgerAccount":"Expenses:Software","matchedRowIds":["row-1"]}}]}}"#)
    }

    fn configure_adapter(root: &str, command: &str) {
        crate::workspace::ai_adapter::configure_ai_adapter(
            crate::workspace::ai_adapter::ConfigureAiAdapterInput {
                workspace_root_path: root.to_string(),
                command: Some(command.to_string()),
            },
        )
        .unwrap();
    }

    #[test]
    fn chunk_persists_suggestions_and_boundary_validates() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "WEB PMTS Autobooks", "-0.50");
        insert_pending_row(&connection, "row-2", "Mystery", "-9.99");
        insert_pending_row(&connection, "row-3", "Low confidence thing", "-1.00");
        // row-1: good. row-2: unknown account -> needsEye. row-3: low confidence -> needsEye.
        let response = r#"{"suggestions":[
            {"rowId":"row-1","ledgerAccount":"Expenses:Software","payee":"Autobooks","narration":"Fee","confidence":0.93,"explanation":"ok","needsHumanAttention":false},
            {"rowId":"row-2","ledgerAccount":"Expenses:DoesNotExist","confidence":0.9,"needsHumanAttention":false},
            {"rowId":"row-3","ledgerAccount":"Expenses:Software","confidence":0.41,"needsHumanAttention":false},
            {"rowId":"row-unknown","ledgerAccount":"Expenses:Software","confidence":0.9,"needsHumanAttention":false}
        ],"proposedRules":[]}"#
            .replace('\n', "");
        let command = write_adapter_script(tempdir.path(), &response);
        configure_adapter(&root, &command);
        let pass = start_ai_assist_pass(&root).unwrap();

        let state = run_ai_assist_next_chunk(&root, &pass.pass_id).unwrap();

        assert_eq!(state.status, "complete");
        assert_eq!(state.processed_rows, 3);
        let by_id = |id: &str| {
            state
                .suggestions
                .iter()
                .find(|s| s.statement_row_id == id)
                .unwrap()
                .clone()
        };
        assert_eq!(by_id("row-1").status, "suggested");
        assert_eq!(by_id("row-2").status, "needsEye");
        assert_eq!(by_id("row-3").status, "needsEye");
        assert_eq!(state.suggestions.len(), 3); // row-unknown ignored
    }

    #[test]
    fn missing_rows_fail_and_adapter_error_fails_only_that_chunk() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "A", "-1.00");
        insert_pending_row(&connection, "row-2", "B", "-2.00");
        // Adapter only answers row-1; row-2 must be marked failed.
        let command = write_adapter_script(
            tempdir.path(),
            r#"{"suggestions":[{"rowId":"row-1","ledgerAccount":"Expenses:Software","confidence":0.9,"needsHumanAttention":false}],"proposedRules":[]}"#,
        );
        configure_adapter(&root, &command);
        let pass = start_ai_assist_pass(&root).unwrap();

        let state = run_ai_assist_next_chunk(&root, &pass.pass_id).unwrap();
        assert_eq!(
            state
                .suggestions
                .iter()
                .filter(|s| s.status == "failed")
                .count(),
            1
        );

        // Broken adapter: whole chunk fails but the call itself succeeds.
        let tempdir2 = tempfile::tempdir().unwrap();
        let root2 = test_workspace(&tempdir2);
        let connection2 = open_test_connection(&root2);
        insert_pending_row(&connection2, "row-1", "A", "-1.00");
        configure_adapter(&root2, "/nonexistent/broken-adapter");
        let pass2 = start_ai_assist_pass(&root2).unwrap();
        let state2 = run_ai_assist_next_chunk(&root2, &pass2.pass_id).unwrap();
        assert_eq!(state2.suggestions[0].status, "failed");
        assert_eq!(state2.status, "complete");
    }

    #[test]
    fn chunking_processes_in_slices_and_completes() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        for index in 0..3 {
            insert_pending_row(&connection, &format!("row-{index}"), "Thing", "-1.00");
        }
        let command = write_adapter_script(
            tempdir.path(),
            r#"{"suggestions":[],"proposedRules":[]}"#,
        );
        configure_adapter(&root, &command);
        let pass = start_ai_assist_pass(&root).unwrap();

        let first = run_next_chunk_with_size(Path::new(&root), &pass.pass_id, 2).unwrap();
        assert_eq!(first.status, "running");
        assert_eq!(first.processed_rows, 2);
        let second = run_next_chunk_with_size(Path::new(&root), &pass.pass_id, 2).unwrap();
        assert_eq!(second.status, "complete");
        assert_eq!(second.processed_rows, 3);
    }

    #[test]
    fn proposed_rules_deduplicate_against_existing_rules() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "SQSP* CMPGNS", "-10.66");
        crate::workspace::categorization_rules::create_categorization_rule(
            crate::workspace::categorization_rules::CreateCategorizationRuleInput {
                workspace_root_path: root.clone(),
                source_account: "Assets:Bank:Checking".to_string(),
                match_text: "Autobooks".to_string(),
                ledger_account: "Expenses:Software".to_string(),
            },
        )
        .unwrap();
        // Adapter proposes a duplicate of the existing rule plus a novel one.
        let command = write_adapter_script(
            tempdir.path(),
            r#"{"suggestions":[],"proposedRules":[
                {"matchText":"Autobooks","sourceAccount":"Assets:Bank:Checking","ledgerAccount":"Expenses:Software","matchedRowIds":[]},
                {"matchText":"SQSP*","sourceAccount":"Assets:Bank:Checking","ledgerAccount":"Expenses:Software","matchedRowIds":["row-1"]}
            ]}"#.replace('\n', "").as_str(),
        );
        configure_adapter(&root, &command);
        let pass = start_ai_assist_pass(&root).unwrap();

        let state = run_ai_assist_next_chunk(&root, &pass.pass_id).unwrap();

        assert_eq!(state.proposed_rules.len(), 1);
        assert_eq!(state.proposed_rules[0].match_text, "SQSP*");
    }
```

Note: the fixture rule `match_text: "GUSTO"` pattern in Task 2 and these tests rely on `matching_rule_for_row` doing case-aware substring matching per source account — check its behavior in `categorization_rules.rs:181` when writing assertions; adjust match text case to whatever the matcher expects.

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: compile error — `run_ai_assist_next_chunk` not found.

- [ ] **Step 3: Implement**

```rust
use crate::workspace::ai_adapter::{
    load_adapter_command, read_chart_of_accounts, read_manifest, AiBusinessProfile,
    SimilarApprovedEntry,
};
use crate::workspace::categorization_rules::list_categorization_rules;
use std::collections::{HashMap, HashSet};

pub fn run_ai_assist_next_chunk(
    workspace_root_path: impl AsRef<Path>,
    pass_id: &str,
) -> Result<AiAssistPassState, WorkspaceError> {
    run_next_chunk_with_size(workspace_root_path.as_ref(), pass_id, AI_ASSIST_CHUNK_SIZE)
}

fn run_next_chunk_with_size(
    root: &Path,
    pass_id: &str,
    chunk_size: usize,
) -> Result<AiAssistPassState, WorkspaceError> {
    let connection = open_workspace_connection(root)?;
    ensure_ai_assist_tables(&connection)?;
    let status: String = connection.query_row(
        "select status from ai_assist_passes where id = ?1",
        [pass_id],
        |row| row.get(0),
    )?;
    if status != "running" {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "AI Assist pass is not running.",
        ));
    }

    let mut statement = connection.prepare(
        "
        select rows.statement_row_id, sr.posted_date, sr.description, sr.source_account, sr.source_amount, sr.status
        from ai_assist_pass_rows rows
        join statement_rows sr on sr.id = rows.statement_row_id
        where rows.pass_id = ?1 and rows.processed = 0
        order by rows.statement_row_id
        limit ?2
        ",
    )?;
    struct ChunkRow {
        id: String,
        posted_date: String,
        description: String,
        source_account: String,
        source_amount: String,
        row_status: String,
    }
    let chunk = statement
        .query_map(params![pass_id, chunk_size as i64], |row| {
            Ok(ChunkRow {
                id: row.get(0)?,
                posted_date: row.get(1)?,
                description: row.get(2)?,
                source_account: row.get(3)?,
                source_amount: row.get(4)?,
                row_status: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if chunk.is_empty() {
        connection.execute(
            "update ai_assist_passes set status = 'complete' where id = ?1",
            [pass_id],
        )?;
        return load_ai_assist_state(&connection, pass_id);
    }

    // Rows approved/edited elsewhere since the pass started drop out silently.
    let (live, stale): (Vec<_>, Vec<_>) = chunk
        .into_iter()
        .partition(|row| row.row_status == "pending");
    for row in &stale {
        mark_processed(&connection, pass_id, &row.id)?;
    }

    if !live.is_empty() {
        match load_adapter_command(&connection)? {
            None => {
                for row in &live {
                    insert_suggestion(
                        &connection, pass_id, &row.id, "failed", None, None, None, None,
                        Some("No BYO AI Adapter is configured."),
                    )?;
                    mark_processed(&connection, pass_id, &row.id)?;
                }
            }
            Some(command) => {
                let request = BatchSuggestionRequest {
                    r#type: "batchSuggestionRequest".to_string(),
                    version: 1,
                    shared_context: build_shared_context(root, &connection)?,
                    rows: live
                        .iter()
                        .map(|row| BatchRow {
                            id: row.id.clone(),
                            posted_date: row.posted_date.clone(),
                            description: row.description.clone(),
                            source_account: row.source_account.clone(),
                            source_amount: row.source_amount.clone(),
                        })
                        .collect(),
                };
                match invoke_batch_adapter(&command, &request) {
                    Err(error) => {
                        let reason = format!("Adapter call failed: {error}");
                        for row in &live {
                            insert_suggestion(
                                &connection, pass_id, &row.id, "failed", None, None, None, None,
                                Some(&reason),
                            )?;
                            mark_processed(&connection, pass_id, &row.id)?;
                        }
                    }
                    Ok(response) => {
                        persist_chunk_response(root, &connection, pass_id, &live, response)?;
                        for row in &live {
                            mark_processed(&connection, pass_id, &row.id)?;
                        }
                    }
                }
            }
        }
    }

    let remaining: i64 = connection.query_row(
        "select count(*) from ai_assist_pass_rows where pass_id = ?1 and processed = 0",
        [pass_id],
        |row| row.get(0),
    )?;
    if remaining == 0 {
        connection.execute(
            "update ai_assist_passes set status = 'complete' where id = ?1",
            [pass_id],
        )?;
    }
    load_ai_assist_state(&connection, pass_id)
}

fn build_shared_context(
    root: &Path,
    connection: &Connection,
) -> Result<SharedContext, WorkspaceError> {
    let manifest = read_manifest(root)?;
    let mut statement = connection.prepare(
        "select description, source_account from statement_rows
         where status = 'accounted' order by posted_date desc limit 12",
    )?;
    let recent_approved_entries = statement
        .query_map([], |row| {
            Ok(SimilarApprovedEntry {
                description: row.get(0)?,
                source_account: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SharedContext {
        chart_of_accounts: read_chart_of_accounts(root)?,
        categorization_rules: list_categorization_rules(root)?,
        business_profile: AiBusinessProfile {
            name: manifest.business.name,
            base_currency: manifest.business.base_currency,
            books_start_date: manifest.business.books_start_date,
        },
        recent_approved_entries,
    })
}

#[allow(clippy::too_many_arguments)]
fn insert_suggestion(
    connection: &Connection,
    pass_id: &str,
    statement_row_id: &str,
    status: &str,
    ledger_account: Option<&str>,
    payee: Option<&str>,
    narration: Option<&str>,
    confidence: Option<f64>,
    explanation: Option<&str>,
) -> Result<(), WorkspaceError> {
    connection.execute(
        "
        insert into ai_assist_suggestions
          (pass_id, statement_row_id, status, ledger_account, payee, narration, confidence, explanation)
        values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        on conflict(pass_id, statement_row_id) do update set
          status = excluded.status,
          ledger_account = excluded.ledger_account,
          payee = excluded.payee,
          narration = excluded.narration,
          confidence = excluded.confidence,
          explanation = excluded.explanation
        ",
        params![
            pass_id,
            statement_row_id,
            status,
            ledger_account,
            payee,
            narration,
            confidence,
            explanation
        ],
    )?;
    Ok(())
}

fn mark_processed(
    connection: &Connection,
    pass_id: &str,
    statement_row_id: &str,
) -> Result<(), WorkspaceError> {
    connection.execute(
        "update ai_assist_pass_rows set processed = 1 where pass_id = ?1 and statement_row_id = ?2",
        params![pass_id, statement_row_id],
    )?;
    Ok(())
}

struct LiveRowRef {
    id: String,
}

fn persist_chunk_response(
    root: &Path,
    connection: &Connection,
    pass_id: &str,
    live: &[impl AsRef<str>],
    response: BatchSuggestionResponse,
) -> Result<(), WorkspaceError> {
    unreachable!("replaced below — see note");
}
```

**Note on `persist_chunk_response`:** implement it against the concrete `ChunkRow` type rather than generics — move `struct ChunkRow` to module scope (rename fields as defined above) and use this signature and body:

```rust
fn persist_chunk_response(
    root: &Path,
    connection: &Connection,
    pass_id: &str,
    live: &[ChunkRow],
    response: BatchSuggestionResponse,
) -> Result<(), WorkspaceError> {
    let chart: HashSet<String> = read_chart_of_accounts(root)?.into_iter().collect();
    let requested: HashSet<&str> = live.iter().map(|row| row.id.as_str()).collect();
    let mut answered: HashSet<String> = HashSet::new();

    for suggestion in response.suggestions {
        if !requested.contains(suggestion.row_id.as_str()) {
            continue; // unknown rowId: ignore
        }
        answered.insert(suggestion.row_id.clone());
        let account_known = suggestion
            .ledger_account
            .as_deref()
            .map(|account| chart.contains(account))
            .unwrap_or(false);
        let confident = suggestion
            .confidence
            .map(|value| value >= NEEDS_EYE_CONFIDENCE_THRESHOLD)
            .unwrap_or(false);
        let status = if account_known && confident && !suggestion.needs_human_attention {
            "suggested"
        } else {
            "needsEye"
        };
        let explanation = if suggestion.ledger_account.is_some() && !account_known {
            Some(format!(
                "Suggested account is not in the chart of accounts: {}",
                suggestion.ledger_account.as_deref().unwrap_or_default()
            ))
        } else {
            suggestion.explanation.clone()
        };
        insert_suggestion(
            connection,
            pass_id,
            &suggestion.row_id,
            status,
            suggestion.ledger_account.as_deref(),
            suggestion.payee.as_deref(),
            suggestion.narration.as_deref(),
            suggestion.confidence,
            explanation.as_deref(),
        )?;
    }

    for row in live {
        if !answered.contains(&row.id) {
            insert_suggestion(
                connection, pass_id, &row.id, "failed", None, None, None, None,
                Some("The adapter response did not include this row."),
            )?;
        }
    }

    let existing_rules: HashSet<(String, String)> = list_categorization_rules(root)?
        .into_iter()
        .filter(|rule| rule.enabled)
        .map(|rule| (rule.source_account, rule.match_text))
        .collect();
    for proposed in response.proposed_rules {
        let key = (proposed.source_account.clone(), proposed.match_text.clone());
        if existing_rules.contains(&key) {
            continue;
        }
        let already_proposed: i64 = connection.query_row(
            "select count(*) from ai_assist_proposed_rules where pass_id = ?1 and source_account = ?2 and match_text = ?3",
            params![pass_id, proposed.source_account, proposed.match_text],
            |row| row.get(0),
        )?;
        if already_proposed > 0 {
            continue;
        }
        connection.execute(
            "insert into ai_assist_proposed_rules (id, pass_id, source_account, match_text, ledger_account, matched_row_count) values (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                pass_id,
                proposed.source_account,
                proposed.match_text,
                proposed.ledger_account,
                proposed.matched_row_ids.len() as i64
            ],
        )?;
    }
    Ok(())
}
```

(Delete the placeholder generic version and the `LiveRowRef` struct — they exist only in this plan text to show the call site shape.)

- [ ] **Step 4: Run to verify pass**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd src-tauri && cargo fmt && cd ..
git add src-tauri/src/workspace/ai_assist.rs
git commit -m "feat(ai-assist): chunked batch execution with boundary validation"
```

---

### Task 4: Retry failed rows and dismiss pass

**Files:**
- Modify: `src-tauri/src/workspace/ai_assist.rs`

**Interfaces:**
- Produces:
  - `pub fn retry_ai_assist_failed_rows(workspace_root_path: impl AsRef<Path>, pass_id: &str) -> Result<AiAssistPassState, WorkspaceError>` — deletes `failed` suggestion rows, resets their `processed` flags, sets pass status back to `running` (the frontend chunk loop then resumes).
  - `pub fn dismiss_ai_assist_pass(workspace_root_path: impl AsRef<Path>, pass_id: &str) -> Result<(), WorkspaceError>` — sets pass status to `dismissed` (suggestions stay in SQLite).

- [ ] **Step 1: Write failing tests**

```rust
    #[test]
    fn retry_resets_failed_rows_and_resumes() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "A", "-1.00");
        configure_adapter(&root, "/nonexistent/broken-adapter");
        let pass = start_ai_assist_pass(&root).unwrap();
        let failed = run_ai_assist_next_chunk(&root, &pass.pass_id).unwrap();
        assert_eq!(failed.suggestions[0].status, "failed");
        assert_eq!(failed.status, "complete");

        // Fix the adapter, retry, resume.
        let command = write_adapter_script(
            tempdir.path(),
            r#"{"suggestions":[{"rowId":"row-1","ledgerAccount":"Expenses:Software","confidence":0.9,"needsHumanAttention":false}],"proposedRules":[]}"#,
        );
        configure_adapter(&root, &command);
        let retried = retry_ai_assist_failed_rows(&root, &pass.pass_id).unwrap();
        assert_eq!(retried.status, "running");
        assert_eq!(retried.processed_rows, 0);
        let done = run_ai_assist_next_chunk(&root, &pass.pass_id).unwrap();
        assert_eq!(done.suggestions[0].status, "suggested");
    }

    #[test]
    fn dismiss_hides_pass_from_get() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "A", "-1.00");
        let pass = start_ai_assist_pass(&root).unwrap();

        dismiss_ai_assist_pass(&root, &pass.pass_id).unwrap();

        assert!(get_ai_assist_pass(&root).unwrap().is_none());
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: compile error — functions not found.

- [ ] **Step 3: Implement**

```rust
pub fn retry_ai_assist_failed_rows(
    workspace_root_path: impl AsRef<Path>,
    pass_id: &str,
) -> Result<AiAssistPassState, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = open_workspace_connection(root)?;
    ensure_ai_assist_tables(&connection)?;
    connection.execute(
        "
        update ai_assist_pass_rows set processed = 0
        where pass_id = ?1 and statement_row_id in (
          select statement_row_id from ai_assist_suggestions
          where pass_id = ?1 and status = 'failed'
        )
        ",
        [pass_id],
    )?;
    connection.execute(
        "delete from ai_assist_suggestions where pass_id = ?1 and status = 'failed'",
        [pass_id],
    )?;
    connection.execute(
        "update ai_assist_passes set status = 'running' where id = ?1",
        [pass_id],
    )?;
    load_ai_assist_state(&connection, pass_id)
}

pub fn dismiss_ai_assist_pass(
    workspace_root_path: impl AsRef<Path>,
    pass_id: &str,
) -> Result<(), WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = open_workspace_connection(root)?;
    ensure_ai_assist_tables(&connection)?;
    connection.execute(
        "update ai_assist_passes set status = 'dismissed' where id = ?1",
        [pass_id],
    )?;
    Ok(())
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd src-tauri && cargo fmt && cd ..
git add src-tauri/src/workspace/ai_assist.rs
git commit -m "feat(ai-assist): retry failed rows and dismiss pass"
```

---

### Task 5: Atomic batch approval

**Files:**
- Modify: `src-tauri/src/workspace/ai_assist.rs`
- Modify: `src-tauri/src/workspace/approval.rs` (visibility only)

**Interfaces:**
- Consumes (change these in `approval.rs` from private to `pub(crate)`): `load_pending_suggested_entry`, `monthly_transaction_file`, `ensure_main_includes`, `open_ledger_account_if_missing`, `parse_amount`, `ensure_provenance_columns`. Also `data_integrity::{atomic_append, create_snapshot, restore_snapshot, RestoreSnapshotInput, SnapshotReason}`, `git::{commit_workspace_changes, CommitWorkspaceChangesInput}`, `categorization_rules::{create_categorization_rule, CreateCategorizationRuleInput, list_categorization_rules}`, `validation::validate_workspace`, `open::open_workspace`.
- Produces:
  - `pub struct ApproveAiAssistBatchInput { workspace_root_path: String, pass_id: String, entries: Vec<AiAssistEntryInput>, rules: Vec<AiAssistRuleInput> }`
  - `pub struct AiAssistEntryInput { statement_row_id: String, ledger_account: String, payee: Option<String>, narration: Option<String> }`
  - `pub struct AiAssistRuleInput { source_account: String, match_text: String, ledger_account: String }`
  - `pub fn approve_ai_assist_batch(input: ApproveAiAssistBatchInput) -> Result<WorkspaceSummary, WorkspaceError>`

Semantics (from spec): validation-blocked workspaces reject the batch exactly like single approval; rows no longer pending are silently dropped; one snapshot before writing; every entry gets `ai_assist_batch_id` provenance metadata plus payee/narration formatting (`date * "Payee" "Narration"`; payee absent ⇒ existing `date * "Description"` form); post-write `validate_workspace` failure restores the snapshot and returns an error with **no** SQLite changes; checked rules are created after validation succeeds (duplicates against existing enabled rules skipped); one best-effort git commit `"AI Assist: approved N entries"`; pass status becomes `approved`.

- [ ] **Step 1: Write failing tests**

```rust
    use crate::workspace::ai_assist::{
        approve_ai_assist_batch, AiAssistEntryInput, AiAssistRuleInput, ApproveAiAssistBatchInput,
    };

    fn approve_input(root: &str, pass_id: &str, entries: Vec<AiAssistEntryInput>) -> ApproveAiAssistBatchInput {
        ApproveAiAssistBatchInput {
            workspace_root_path: root.to_string(),
            pass_id: pass_id.to_string(),
            entries,
            rules: vec![],
        }
    }

    #[test]
    fn batch_approval_writes_entries_with_provenance_and_rules() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "WEB PMTS Autobooks, Inc. WEB", "-0.50");
        insert_pending_row(&connection, "row-2", "SQSP* CMPGNS#232", "-10.66");
        let pass = start_ai_assist_pass(&root).unwrap();

        approve_ai_assist_batch(ApproveAiAssistBatchInput {
            workspace_root_path: root.clone(),
            pass_id: pass.pass_id.clone(),
            entries: vec![
                AiAssistEntryInput {
                    statement_row_id: "row-1".to_string(),
                    ledger_account: "Expenses:Software".to_string(),
                    payee: Some("Autobooks".to_string()),
                    narration: Some("Monthly fee".to_string()),
                },
                AiAssistEntryInput {
                    statement_row_id: "row-2".to_string(),
                    ledger_account: "Expenses:Software".to_string(),
                    payee: None,
                    narration: None,
                },
            ],
            rules: vec![AiAssistRuleInput {
                source_account: "Assets:Bank:Checking".to_string(),
                match_text: "Autobooks".to_string(),
                ledger_account: "Expenses:Software".to_string(),
            }],
        })
        .unwrap();

        let monthly = fs::read_to_string(Path::new(&root).join("transactions/2026-05.bean")).unwrap();
        assert!(monthly.contains(r#""Autobooks" "Monthly fee""#));
        assert!(monthly.contains("ai_assist_batch_id:"));
        assert!(monthly.contains("Expenses:Software"));
        let accounted: i64 = connection
            .query_row(
                "select count(*) from statement_rows where status = 'accounted'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(accounted, 2);
        let rules = crate::workspace::categorization_rules::list_categorization_rules(&root).unwrap();
        assert!(rules.iter().any(|rule| rule.match_text == "Autobooks"));
        let batches = list_ai_assist_batches(&root).unwrap();
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].entry_count, 2);
        // Pass is consumed.
        assert!(get_ai_assist_pass(&root).unwrap().is_none());
    }

    #[test]
    fn batch_approval_skips_rows_no_longer_pending() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "A", "-1.00");
        insert_pending_row(&connection, "row-2", "B", "-2.00");
        let pass = start_ai_assist_pass(&root).unwrap();
        connection
            .execute("update statement_rows set status = 'accounted' where id = 'row-1'", [])
            .unwrap();

        approve_ai_assist_batch(approve_input(
            &root,
            &pass.pass_id,
            vec![
                AiAssistEntryInput {
                    statement_row_id: "row-1".to_string(),
                    ledger_account: "Expenses:Software".to_string(),
                    payee: None,
                    narration: None,
                },
                AiAssistEntryInput {
                    statement_row_id: "row-2".to_string(),
                    ledger_account: "Expenses:Software".to_string(),
                    payee: None,
                    narration: None,
                },
            ],
        ))
        .unwrap();

        let batches = list_ai_assist_batches(&root).unwrap();
        assert_eq!(batches[0].entry_count, 1);
    }

    #[test]
    fn batch_approval_rolls_back_when_ledger_becomes_invalid() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "A", "-1.00");
        let pass = start_ai_assist_pass(&root).unwrap();
        let main_before = fs::read_to_string(Path::new(&root).join("main.bean")).unwrap();

        // An account name with a space produces an invalid open directive and
        // an invalid posting, so post-write validation must fail.
        let result = approve_ai_assist_batch(approve_input(
            &root,
            &pass.pass_id,
            vec![AiAssistEntryInput {
                statement_row_id: "row-1".to_string(),
                ledger_account: "Expenses:Bad Account".to_string(),
                payee: None,
                narration: None,
            }],
        ));

        assert!(result.is_err());
        // Ledger restored, sqlite untouched.
        let main_after = fs::read_to_string(Path::new(&root).join("main.bean")).unwrap();
        assert_eq!(main_before, main_after);
        let pending: i64 = connection
            .query_row(
                "select count(*) from statement_rows where status = 'pending'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 1);
        assert!(list_ai_assist_batches(&root).unwrap().is_empty());
    }
```

(`list_ai_assist_batches` is implemented in Task 6 — add a minimal version now so these tests compile: it is included in Step 3 below.)

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: compile error — `approve_ai_assist_batch` not found.

- [ ] **Step 3: Implement**

In `approval.rs`, change these `fn` to `pub(crate) fn`: `load_pending_suggested_entry`, `monthly_transaction_file`, `ensure_main_includes`, `open_ledger_account_if_missing`, `parse_amount`, `ensure_provenance_columns`.

In `ai_assist.rs`:

```rust
use crate::workspace::approval::{
    ensure_provenance_columns, load_pending_suggested_entry, monthly_transaction_file,
    ensure_main_includes, open_ledger_account_if_missing, parse_amount, SuggestedEntry,
};
use crate::workspace::data_integrity::{
    atomic_append, create_snapshot, restore_snapshot, RestoreSnapshotInput, SnapshotReason,
};
use crate::workspace::git::{commit_workspace_changes, CommitWorkspaceChangesInput};
use crate::workspace::categorization_rules::{
    create_categorization_rule, CreateCategorizationRuleInput,
};
use crate::workspace::imports::ensure_import_tables;
use crate::workspace::open::open_workspace;
use crate::workspace::types::{LedgerStatus, WorkspaceSummary};
use crate::workspace::validation::validate_workspace;
use std::fs;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveAiAssistBatchInput {
    pub workspace_root_path: String,
    pub pass_id: String,
    pub entries: Vec<AiAssistEntryInput>,
    pub rules: Vec<AiAssistRuleInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistEntryInput {
    pub statement_row_id: String,
    pub ledger_account: String,
    pub payee: Option<String>,
    pub narration: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistRuleInput {
    pub source_account: String,
    pub match_text: String,
    pub ledger_account: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchEntryRecord {
    statement_row_id: String,
    diurnum_entry_id: String,
    ledger_entry_file: String,
}

fn escape_beancount_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

pub fn approve_ai_assist_batch(
    input: ApproveAiAssistBatchInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let validation = validate_workspace(root)?;
    if validation.status == LedgerStatus::Invalid {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Approval is blocked while the Workspace is in Invalid Ledger State.",
        ));
    }
    let connection = open_workspace_connection(root)?;
    ensure_import_tables(&connection)?;
    ensure_provenance_columns(&connection)?;
    ensure_ai_assist_tables(&connection)?;

    // Rows approved or edited elsewhere since review started drop out silently.
    let mut approvals: Vec<(AiAssistEntryInput, SuggestedEntry)> = Vec::new();
    for entry in input.entries {
        match load_pending_suggested_entry(&connection, &entry.statement_row_id) {
            Ok(row) => approvals.push((entry, row)),
            Err(_) => continue,
        }
    }
    if approvals.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "AI Assist has nothing to approve: no selected entries are still pending.",
        ));
    }

    let snapshot = create_snapshot(root, SnapshotReason::Approval)?;
    let batch_id = Uuid::new_v4().to_string();
    let mut records: Vec<BatchEntryRecord> = Vec::new();
    let mut write = || -> Result<(), WorkspaceError> {
        for (entry, row) in &approvals {
            open_ledger_account_if_missing(root, &entry.ledger_account)?;
            let monthly_relative_path = monthly_transaction_file(&row.posted_date)?;
            let monthly_path = root.join(&monthly_relative_path);
            if let Some(parent) = monthly_path.parent() {
                fs::create_dir_all(parent)?;
            }
            ensure_main_includes(root, &monthly_relative_path)?;
            let diurnum_entry_id = Uuid::new_v4().to_string();
            let balancing_amount = -parse_amount(&row.source_amount)?;
            append_ai_assist_entry(
                &monthly_path,
                row,
                &entry.ledger_account,
                entry.payee.as_deref(),
                entry.narration.as_deref(),
                balancing_amount,
                &diurnum_entry_id,
                &batch_id,
            )?;
            records.push(BatchEntryRecord {
                statement_row_id: row.statement_row_id.clone(),
                diurnum_entry_id,
                ledger_entry_file: monthly_relative_path,
            });
        }
        Ok(())
    };
    if let Err(error) = write() {
        let _ = restore_snapshot(RestoreSnapshotInput {
            workspace_root_path: input.workspace_root_path.clone(),
            snapshot_id: snapshot.id.clone(),
        });
        return Err(error);
    }

    // Golden-path gate: the whole batch lands or none of it does.
    let post_validation = validate_workspace(root)?;
    if post_validation.status == LedgerStatus::Invalid {
        restore_snapshot(RestoreSnapshotInput {
            workspace_root_path: input.workspace_root_path.clone(),
            snapshot_id: snapshot.id,
        })?;
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "AI Assist batch was rolled back because the ledger became invalid.",
        ));
    }

    let mut rule_ids: Vec<String> = Vec::new();
    let existing_rules: HashSet<(String, String)> = list_categorization_rules(root)?
        .into_iter()
        .filter(|rule| rule.enabled)
        .map(|rule| (rule.source_account, rule.match_text))
        .collect();
    for rule in &input.rules {
        if existing_rules.contains(&(rule.source_account.clone(), rule.match_text.clone())) {
            continue;
        }
        let created = create_categorization_rule(CreateCategorizationRuleInput {
            workspace_root_path: input.workspace_root_path.clone(),
            source_account: rule.source_account.clone(),
            match_text: rule.match_text.clone(),
            ledger_account: rule.ledger_account.clone(),
        })?;
        rule_ids.push(created.id);
    }

    let transaction = connection.unchecked_transaction()?;
    for record in &records {
        transaction.execute(
            "update statement_rows set status = 'accounted', diurnum_entry_id = ?2, ledger_entry_file = ?3 where id = ?1",
            params![
                record.statement_row_id,
                record.diurnum_entry_id,
                record.ledger_entry_file
            ],
        )?;
    }
    transaction.execute(
        "insert into ai_assist_batches (id, pass_id, approved_at, entry_count, entries_json, rule_ids_json) values (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            batch_id,
            input.pass_id,
            Utc::now().to_rfc3339(),
            records.len() as i64,
            serde_json::to_string(&records)
                .map_err(|error| WorkspaceError::io(error.to_string()))?,
            serde_json::to_string(&rule_ids)
                .map_err(|error| WorkspaceError::io(error.to_string()))?
        ],
    )?;
    transaction.execute(
        "update ai_assist_passes set status = 'approved' where id = ?1",
        [input.pass_id.as_str()],
    )?;
    transaction.commit()?;

    let _ = commit_workspace_changes(CommitWorkspaceChangesInput {
        workspace_root_path: input.workspace_root_path.clone(),
        message: format!("AI Assist: approved {} entries", records.len()),
        paths: vec![],
    });

    open_workspace(root)
}

#[allow(clippy::too_many_arguments)]
fn append_ai_assist_entry(
    monthly_path: &Path,
    row: &SuggestedEntry,
    ledger_account: &str,
    payee: Option<&str>,
    narration: Option<&str>,
    balancing_amount: f64,
    diurnum_entry_id: &str,
    batch_id: &str,
) -> Result<(), WorkspaceError> {
    let narration_text = narration.unwrap_or(&row.description);
    let title = match payee {
        Some(payee) => format!(
            "\"{}\" \"{}\"",
            escape_beancount_string(payee),
            escape_beancount_string(narration_text)
        ),
        None => format!("\"{}\"", escape_beancount_string(narration_text)),
    };
    let pending_metadata = if row.pending_at_import {
        "  pending_at_import: TRUE\n"
    } else {
        ""
    };
    let entry = format!(
        "\n{} * {}\n  diurnum_entry_id: \"{}\"\n  ai_assist_batch_id: \"{}\"\n  import_fingerprint: \"{}\"\n  source_account: \"{}\"\n  source_file_name: \"{}\"\n{}  {}  {} USD\n  {}  {:.2} USD\n",
        row.posted_date,
        title,
        diurnum_entry_id,
        batch_id,
        row.import_fingerprint,
        row.source_account,
        row.source_file_name,
        pending_metadata,
        row.source_account,
        row.source_amount,
        ledger_account,
        balancing_amount,
    );
    atomic_append(monthly_path, &entry)
}
```

Also add the minimal `list_ai_assist_batches` (finished in Task 6):

```rust
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistBatchSummary {
    pub id: String,
    pub approved_at: String,
    pub entry_count: i64,
}

pub fn list_ai_assist_batches(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<AiAssistBatchSummary>, WorkspaceError> {
    let connection = open_workspace_connection(workspace_root_path.as_ref())?;
    ensure_ai_assist_tables(&connection)?;
    let mut statement = connection.prepare(
        "select id, approved_at, entry_count from ai_assist_batches order by approved_at desc",
    )?;
    let batches = statement
        .query_map([], |row| {
            Ok(AiAssistBatchSummary {
                id: row.get(0)?,
                approved_at: row.get(1)?,
                entry_count: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(batches)
}
```

Implementation notes:
- `rusqlite`'s `unchecked_transaction` is needed because `connection` is not `&mut`; it is the established pattern for shared-connection transactions. If the codebase's rusqlite version lacks it, take `mut connection` and use `connection.transaction()?`.
- If `validate_workspace` on the fixture workspace fails for a reason unrelated to this feature (e.g. `bean-check` unavailable on the test machine), check how existing `approval.rs` tests handle validation and mirror that setup exactly.

- [ ] **Step 4: Run to verify pass**

Run: `cd src-tauri && cargo test workspace::ai_assist && cargo test workspace::approval`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd src-tauri && cargo fmt && cd ..
git add src-tauri/src/workspace/ai_assist.rs src-tauri/src/workspace/approval.rs
git commit -m "feat(ai-assist): atomic batch approval with snapshot rollback and rule creation"
```

---

### Task 6: Batch revert

**Files:**
- Modify: `src-tauri/src/workspace/ai_assist.rs`

**Interfaces:**
- Produces:
  - `pub struct RevertAiAssistBatchInput { workspace_root_path: String, batch_id: String }`
  - `pub fn revert_ai_assist_batch(input: RevertAiAssistBatchInput) -> Result<WorkspaceSummary, WorkspaceError>`
  - `fn remove_entry_blocks(contents: &str, diurnum_entry_ids: &HashSet<String>) -> String` (internal, unit-tested directly)

Semantics: snapshot first; remove each batch entry's transaction block from its ledger file (a block starts at a `YYYY-MM-DD `-prefixed line at column 0 and runs to the next such line or EOF; drop blocks whose metadata contains `diurnum_entry_id: "<id>"` for any batch id); return the statement rows to `pending` (clear `diurnum_entry_id`, `ledger_entry_file`); delete the rules the batch created; delete the batch record; best-effort git commit `"AI Assist: reverted batch"`.

- [ ] **Step 1: Write failing tests**

```rust
    #[test]
    fn remove_entry_blocks_drops_only_target_entries() {
        let contents = "\n2026-05-06 * \"Keep\"\n  diurnum_entry_id: \"keep-1\"\n  Assets:Bank:Checking  -1.00 USD\n  Expenses:Software  1.00 USD\n\n2026-05-07 * \"Drop\"\n  diurnum_entry_id: \"drop-1\"\n  Assets:Bank:Checking  -2.00 USD\n  Expenses:Software  2.00 USD\n";
        let targets: std::collections::HashSet<String> =
            ["drop-1".to_string()].into_iter().collect();
        let result = remove_entry_blocks(contents, &targets);
        assert!(result.contains("keep-1"));
        assert!(!result.contains("drop-1"));
    }

    #[test]
    fn revert_batch_restores_pending_rows_and_removes_rules() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "WEB PMTS Autobooks", "-0.50");
        let pass = start_ai_assist_pass(&root).unwrap();
        approve_ai_assist_batch(ApproveAiAssistBatchInput {
            workspace_root_path: root.clone(),
            pass_id: pass.pass_id.clone(),
            entries: vec![AiAssistEntryInput {
                statement_row_id: "row-1".to_string(),
                ledger_account: "Expenses:Software".to_string(),
                payee: Some("Autobooks".to_string()),
                narration: None,
            }],
            rules: vec![AiAssistRuleInput {
                source_account: "Assets:Bank:Checking".to_string(),
                match_text: "Autobooks".to_string(),
                ledger_account: "Expenses:Software".to_string(),
            }],
        })
        .unwrap();
        let batch_id = list_ai_assist_batches(&root).unwrap()[0].id.clone();

        revert_ai_assist_batch(RevertAiAssistBatchInput {
            workspace_root_path: root.clone(),
            batch_id,
        })
        .unwrap();

        let pending: i64 = connection
            .query_row(
                "select count(*) from statement_rows where status = 'pending'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 1);
        let monthly = fs::read_to_string(Path::new(&root).join("transactions/2026-05.bean")).unwrap();
        assert!(!monthly.contains("Autobooks"));
        let rules = crate::workspace::categorization_rules::list_categorization_rules(&root).unwrap();
        assert!(!rules.iter().any(|rule| rule.match_text == "Autobooks"));
        assert!(list_ai_assist_batches(&root).unwrap().is_empty());
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: compile error — `revert_ai_assist_batch` / `remove_entry_blocks` not found.

- [ ] **Step 3: Implement**

```rust
use crate::workspace::categorization_rules::delete_categorization_rule;
use crate::workspace::data_integrity::atomic_write;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertAiAssistBatchInput {
    pub workspace_root_path: String,
    pub batch_id: String,
}

pub fn revert_ai_assist_batch(
    input: RevertAiAssistBatchInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let connection = open_workspace_connection(root)?;
    ensure_ai_assist_tables(&connection)?;
    let (entries_json, rule_ids_json): (String, String) = connection.query_row(
        "select entries_json, rule_ids_json from ai_assist_batches where id = ?1",
        [&input.batch_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let records: Vec<BatchEntryRecord> = serde_json::from_str(&entries_json)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;
    let rule_ids: Vec<String> = serde_json::from_str(&rule_ids_json)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;

    create_snapshot(root, SnapshotReason::Approval)?;

    let mut by_file: HashMap<String, HashSet<String>> = HashMap::new();
    for record in &records {
        by_file
            .entry(record.ledger_entry_file.clone())
            .or_default()
            .insert(record.diurnum_entry_id.clone());
    }
    for (relative_path, entry_ids) in &by_file {
        let path = root.join(relative_path);
        let contents = fs::read_to_string(&path)?;
        atomic_write(&path, &remove_entry_blocks(&contents, entry_ids))?;
    }

    let transaction = connection.unchecked_transaction()?;
    for record in &records {
        transaction.execute(
            "update statement_rows set status = 'pending', diurnum_entry_id = null, ledger_entry_file = null where id = ?1",
            [&record.statement_row_id],
        )?;
    }
    transaction.execute(
        "delete from ai_assist_batches where id = ?1",
        [&input.batch_id],
    )?;
    transaction.commit()?;

    for rule_id in &rule_ids {
        let _ = delete_categorization_rule(&input.workspace_root_path, rule_id);
    }

    let _ = commit_workspace_changes(CommitWorkspaceChangesInput {
        workspace_root_path: input.workspace_root_path.clone(),
        message: format!("AI Assist: reverted batch of {} entries", records.len()),
        paths: vec![],
    });

    open_workspace(root)
}

fn remove_entry_blocks(contents: &str, diurnum_entry_ids: &HashSet<String>) -> String {
    fn is_entry_start(line: &str) -> bool {
        let bytes = line.as_bytes();
        bytes.len() >= 11
            && bytes[0].is_ascii_digit()
            && bytes[1].is_ascii_digit()
            && bytes[2].is_ascii_digit()
            && bytes[3].is_ascii_digit()
            && bytes[4] == b'-'
    }
    let lines: Vec<&str> = contents.lines().collect();
    let mut kept: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if is_entry_start(lines[index]) {
            let mut end = index + 1;
            while end < lines.len() && !is_entry_start(lines[end]) {
                end += 1;
            }
            let block = &lines[index..end];
            let drop = block.iter().any(|line| {
                diurnum_entry_ids.iter().any(|id| {
                    line.trim_start()
                        .starts_with(&format!("diurnum_entry_id: \"{id}\""))
                })
            });
            if !drop {
                kept.extend_from_slice(block);
            }
            index = end;
        } else {
            kept.push(lines[index]);
            index += 1;
        }
    }
    let mut result = kept.join("\n");
    if contents.ends_with('\n') && !result.ends_with('\n') {
        result.push('\n');
    }
    result
}
```

Check `delete_categorization_rule`'s exact signature at `categorization_rules.rs:140` and match it (it may take `(impl AsRef<Path>, &str)` or an input struct — call it the way `commands/workspace.rs` does).

- [ ] **Step 4: Run to verify pass**

Run: `cd src-tauri && cargo test workspace::ai_assist`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd src-tauri && cargo fmt && cd ..
git add src-tauri/src/workspace/ai_assist.rs
git commit -m "feat(ai-assist): batch revert restores rows and removes batch rules"
```

---

### Task 7: Tauri commands, TypeScript API, session methods

**Files:**
- Modify: `src-tauri/src/commands/workspace.rs`, `src-tauri/src/lib.rs`
- Modify: `src/lib/workspace/types.ts`, `src/lib/workspace/api.ts`, `src/lib/workspace/session.ts`
- Test: `src/lib/workspace/session.test.ts` (extend)

**Interfaces:**
- Produces Tauri commands: `start_ai_assist_pass`, `run_ai_assist_next_chunk`, `get_ai_assist_pass`, `retry_ai_assist_failed_rows`, `dismiss_ai_assist_pass`, `approve_ai_assist_batch`, `list_ai_assist_batches`, `revert_ai_assist_batch`.
- Produces TS types (mirroring Rust camelCase): `AiAssistSuggestion`, `AiAssistProposedRule`, `AiAssistPassState`, `ApproveAiAssistBatchInput`, `AiAssistBatchSummary`, `RevertAiAssistBatchInput`.
- Produces api functions of the same names as the commands (camelCase), and session methods `approveAiAssistBatch` / `revertAiAssistBatch` that `applyView` the returned `WorkspaceView`.

- [ ] **Step 1: Add Rust commands**

In `src-tauri/src/commands/workspace.rs` add (following the file's existing style; commands that mutate the workspace return a refreshed `WorkspaceView` like `approve_suggested_entry` does):

```rust
use crate::workspace::ai_assist::{
    self, AiAssistBatchSummary, AiAssistPassState, ApproveAiAssistBatchInput,
    RevertAiAssistBatchInput,
};

#[tauri::command]
pub fn start_ai_assist_pass(path: String) -> Result<AiAssistPassState, WorkspaceError> {
    ai_assist::start_ai_assist_pass(path)
}

#[tauri::command]
pub fn run_ai_assist_next_chunk(
    path: String,
    pass_id: String,
) -> Result<AiAssistPassState, WorkspaceError> {
    ai_assist::run_ai_assist_next_chunk(path, &pass_id)
}

#[tauri::command]
pub fn get_ai_assist_pass(path: String) -> Result<Option<AiAssistPassState>, WorkspaceError> {
    ai_assist::get_ai_assist_pass(path)
}

#[tauri::command]
pub fn retry_ai_assist_failed_rows(
    path: String,
    pass_id: String,
) -> Result<AiAssistPassState, WorkspaceError> {
    ai_assist::retry_ai_assist_failed_rows(path, &pass_id)
}

#[tauri::command]
pub fn dismiss_ai_assist_pass(path: String, pass_id: String) -> Result<(), WorkspaceError> {
    ai_assist::dismiss_ai_assist_pass(path, &pass_id)
}

#[tauri::command]
pub fn approve_ai_assist_batch(
    input: ApproveAiAssistBatchInput,
) -> Result<WorkspaceView, WorkspaceError> {
    let path = input.workspace_root_path.clone();
    ai_assist::approve_ai_assist_batch(input)?;
    view::load(path)
}

#[tauri::command]
pub fn list_ai_assist_batches(path: String) -> Result<Vec<AiAssistBatchSummary>, WorkspaceError> {
    ai_assist::list_ai_assist_batches(path)
}

#[tauri::command]
pub fn revert_ai_assist_batch(
    input: RevertAiAssistBatchInput,
) -> Result<WorkspaceView, WorkspaceError> {
    let path = input.workspace_root_path.clone();
    ai_assist::revert_ai_assist_batch(input)?;
    view::load(path)
}
```

Register all eight in `src-tauri/src/lib.rs`'s `generate_handler![]` list (after `commands::workspace::get_ai_context_disclosure`).

Run: `cd src-tauri && cargo build` — Expected: compiles clean.

- [ ] **Step 2: Add TS types**

In `src/lib/workspace/types.ts` (near `AiSuggestion`):

```ts
export type AiAssistSuggestionStatus = "suggested" | "needsEye" | "failed";

export type AiAssistSuggestion = {
  statementRowId: string;
  status: AiAssistSuggestionStatus;
  ledgerAccount?: string | null;
  payee?: string | null;
  narration?: string | null;
  confidence?: number | null;
  explanation?: string | null;
};

export type AiAssistProposedRule = {
  id: string;
  sourceAccount: string;
  matchText: string;
  ledgerAccount: string;
  matchedRowCount: number;
};

export type AiAssistPassState = {
  passId: string;
  status: "running" | "complete" | "dismissed" | "approved";
  totalRows: number;
  processedRows: number;
  suggestions: AiAssistSuggestion[];
  proposedRules: AiAssistProposedRule[];
};

export type ApproveAiAssistBatchInput = {
  workspaceRootPath: string;
  passId: string;
  entries: Array<{
    statementRowId: string;
    ledgerAccount: string;
    payee?: string | null;
    narration?: string | null;
  }>;
  rules: Array<{ sourceAccount: string; matchText: string; ledgerAccount: string }>;
};

export type AiAssistBatchSummary = {
  id: string;
  approvedAt: string;
  entryCount: number;
};

export type RevertAiAssistBatchInput = {
  workspaceRootPath: string;
  batchId: string;
};
```

- [ ] **Step 3: Add api wrappers**

In `src/lib/workspace/api.ts`, add to the `WorkspaceApi` type (all **optional**, so existing doubles keep compiling):

```ts
  startAiAssistPass?: (path: string) => Promise<AiAssistPassState>;
  runAiAssistNextChunk?: (path: string, passId: string) => Promise<AiAssistPassState>;
  getAiAssistPass?: (path: string) => Promise<AiAssistPassState | null>;
  retryAiAssistFailedRows?: (path: string, passId: string) => Promise<AiAssistPassState>;
  dismissAiAssistPass?: (path: string, passId: string) => Promise<void>;
  approveAiAssistBatch?: (input: ApproveAiAssistBatchInput) => Promise<WorkspaceView>;
  listAiAssistBatches?: (path: string) => Promise<AiAssistBatchSummary[]>;
  revertAiAssistBatch?: (input: RevertAiAssistBatchInput) => Promise<WorkspaceView>;
```

And the exported functions (same test-API-first pattern as every neighbor; optional chaining with a thrown error keeps doubles honest):

```ts
export async function startAiAssistPass(path: string): Promise<AiAssistPassState> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.startAiAssistPass!(path);
  }
  return invoke<AiAssistPassState>("start_ai_assist_pass", { path });
}

export async function runAiAssistNextChunk(
  path: string,
  passId: string,
): Promise<AiAssistPassState> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.runAiAssistNextChunk!(path, passId);
  }
  return invoke<AiAssistPassState>("run_ai_assist_next_chunk", { path, passId });
}

export async function getAiAssistPass(path: string): Promise<AiAssistPassState | null> {
  if (window.__DIURNUM_TEST_API__) {
    return (await window.__DIURNUM_TEST_API__.getAiAssistPass?.(path)) ?? null;
  }
  return invoke<AiAssistPassState | null>("get_ai_assist_pass", { path });
}

export async function retryAiAssistFailedRows(
  path: string,
  passId: string,
): Promise<AiAssistPassState> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.retryAiAssistFailedRows!(path, passId);
  }
  return invoke<AiAssistPassState>("retry_ai_assist_failed_rows", { path, passId });
}

export async function dismissAiAssistPass(path: string, passId: string): Promise<void> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.dismissAiAssistPass?.(path, passId);
  }
  await invoke("dismiss_ai_assist_pass", { path, passId });
}

export async function approveAiAssistBatch(
  input: ApproveAiAssistBatchInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.approveAiAssistBatch!(input);
  }
  return invoke<WorkspaceView>("approve_ai_assist_batch", { input });
}

export async function listAiAssistBatches(path: string): Promise<AiAssistBatchSummary[]> {
  if (window.__DIURNUM_TEST_API__) {
    return (await window.__DIURNUM_TEST_API__.listAiAssistBatches?.(path)) ?? [];
  }
  return invoke<AiAssistBatchSummary[]>("list_ai_assist_batches", { path });
}

export async function revertAiAssistBatch(
  input: RevertAiAssistBatchInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.revertAiAssistBatch!(input);
  }
  return invoke<WorkspaceView>("revert_ai_assist_batch", { input });
}
```

Add the new type names to the `import type { ... } from "./types"` list.

- [ ] **Step 4: Write failing session test**

In `src/lib/workspace/session.test.ts`, find how the existing `approve` session method is tested (fake api object + assertion that `applyView` state updated) and add, in the same style:

```ts
test("approveAiAssistBatch applies the returned view", async () => {
  // Mirror the setup of the existing "approve" test in this file exactly,
  // adding approveAiAssistBatch to the fake api:
  // approveAiAssistBatch: async () => fakeView,
  // then:
  // await session.approveAiAssistBatch({ workspaceRootPath: "/w", passId: "p", entries: [], rules: [] });
  // expect(stateAfter.workspace).toEqual(fakeView.summary);
});
```

(Write it as a real test against the file's actual helpers — the file already has a fixture pattern for `approve`; reuse it verbatim with the new method name.)

Run: `npx vitest run src/lib/workspace/session.test.ts`
Expected: FAIL — `approveAiAssistBatch` is not a function.

- [ ] **Step 5: Add session methods**

In `src/lib/workspace/session.ts`: add `"approveAiAssistBatch" | "revertAiAssistBatch"` to the `WorkspaceSessionApi` `Pick<...>` union, add both to the `WorkspaceSession` type, and implement next to the existing `approve`:

```ts
    approveAiAssistBatch: (input: ApproveAiAssistBatchInput) =>
      withErrorReset(async () => {
        applyView(await api.approveAiAssistBatch(input));
      }),
    revertAiAssistBatch: (input: RevertAiAssistBatchInput) =>
      withErrorReset(async () => {
        applyView(await api.revertAiAssistBatch(input));
      }),
```

(Since `WorkspaceSessionApi` picks from the api module's real exports — which are non-optional functions — the `!` assertions live only in `api.ts`'s test-API branch.)

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/lib/workspace/session.test.ts && cd src-tauri && cargo build`
Expected: PASS / clean build. Also run `npx tsc --noEmit` — Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
cd src-tauri && cargo fmt && cd ..
git add src-tauri/src/commands/workspace.rs src-tauri/src/lib.rs src/lib/workspace/types.ts src/lib/workspace/api.ts src/lib/workspace/session.ts src/lib/workspace/session.test.ts
git commit -m "feat(ai-assist): tauri commands, ts api, session methods"
```

---

### Task 8: Review grouping logic (`aiAssistGroups.ts`)

**Files:**
- Create: `src/features/workspace/aiAssistGroups.ts`
- Test: `src/features/workspace/aiAssistGroups.test.ts`

**Interfaces:**
- Consumes: `SuggestedEntry`, `AiAssistPassState` from `../../lib/workspace/types`.
- Produces (used by Task 9):

```ts
export type AiAssistReviewRow = {
  statementRowId: string;
  postedDate: string;
  payee: string;            // cleaned payee, falls back to raw description
  narration: string | null;
  rawDescription: string;
  sourceAccount: string;
  sourceAmount: string;
  amount: number;
  explanation: string | null;
  failed: boolean;
};

export type AiAssistGroup = {
  ledgerAccount: string;
  rows: AiAssistReviewRow[];
  net: number;
  rules: AiAssistProposedRule[];
};

export function buildAiAssistGroups(
  entries: SuggestedEntry[],
  pass: AiAssistPassState,
): { groups: AiAssistGroup[]; needsEye: AiAssistReviewRow[] };
```

Rules: only entries that are still present in `entries` (i.e. still pending) and have a suggestion in the pass participate. `status === "suggested"` rows group by `ledgerAccount` (groups sorted by row count descending, then name); `needsEye`/`failed` rows go to `needsEye`. Proposed rules attach to the group matching their `ledgerAccount` (rules whose group doesn't exist attach nowhere and are dropped). `net` is the sum of parsed `sourceAmount`s; unparseable amounts count as 0.

- [ ] **Step 1: Write failing test**

```ts
// src/features/workspace/aiAssistGroups.test.ts
import { describe, expect, test } from "vitest";
import { buildAiAssistGroups } from "./aiAssistGroups";
import type { AiAssistPassState, SuggestedEntry } from "../../lib/workspace/types";

function entry(id: string, description: string, amount: string): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: id,
    postedDate: "2026-05-06",
    description,
    sourceAccount: "Assets:Bank:Checking",
    sourceAmount: amount,
    sourceFileName: "checking.csv",
    importFingerprint: `fp-${id}`,
    pendingAtImport: false,
  };
}

function pass(overrides: Partial<AiAssistPassState> = {}): AiAssistPassState {
  return {
    passId: "pass-1",
    status: "complete",
    totalRows: 3,
    processedRows: 3,
    suggestions: [],
    proposedRules: [],
    ...overrides,
  };
}

describe("buildAiAssistGroups", () => {
  test("groups suggested rows by account and partitions needs-eye", () => {
    const entries = [
      entry("row-1", "WEB PMTS Autobooks, Inc. WEB", "-0.50"),
      entry("row-2", "SQSP* CMPGNS#232", "-10.66"),
      entry("row-3", "Mobile Deposit", "2500.00"),
    ];
    const state = pass({
      suggestions: [
        { statementRowId: "row-1", status: "suggested", ledgerAccount: "Expenses:Software", payee: "Autobooks", narration: "Fee", confidence: 0.93, explanation: "ok" },
        { statementRowId: "row-2", status: "suggested", ledgerAccount: "Expenses:Software", payee: "Squarespace", narration: null, confidence: 0.9, explanation: null },
        { statementRowId: "row-3", status: "needsEye", ledgerAccount: null, payee: null, narration: null, confidence: null, explanation: "AI unsure — deposit source?" },
      ],
      proposedRules: [
        { id: "rule-1", sourceAccount: "Assets:Bank:Checking", matchText: "Autobooks", ledgerAccount: "Expenses:Software", matchedRowCount: 1 },
      ],
    });

    const { groups, needsEye } = buildAiAssistGroups(entries, state);

    expect(groups).toHaveLength(1);
    expect(groups[0].ledgerAccount).toBe("Expenses:Software");
    expect(groups[0].rows.map((row) => row.payee)).toEqual(["Autobooks", "Squarespace"]);
    expect(groups[0].net).toBeCloseTo(-11.16);
    expect(groups[0].rules).toHaveLength(1);
    expect(needsEye).toHaveLength(1);
    expect(needsEye[0].payee).toBe("Mobile Deposit");
    expect(needsEye[0].failed).toBe(false);
  });

  test("failed suggestions land in needs-eye flagged as failed", () => {
    const entries = [entry("row-1", "A", "-1.00")];
    const state = pass({
      suggestions: [
        { statementRowId: "row-1", status: "failed", ledgerAccount: null, payee: null, narration: null, confidence: null, explanation: "Adapter call failed" },
      ],
    });
    const { groups, needsEye } = buildAiAssistGroups(entries, state);
    expect(groups).toHaveLength(0);
    expect(needsEye[0].failed).toBe(true);
  });

  test("suggestions for rows no longer pending are ignored", () => {
    const state = pass({
      suggestions: [
        { statementRowId: "gone", status: "suggested", ledgerAccount: "Expenses:Software", payee: null, narration: null, confidence: 0.9, explanation: null },
      ],
    });
    const { groups, needsEye } = buildAiAssistGroups([], state);
    expect(groups).toHaveLength(0);
    expect(needsEye).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/workspace/aiAssistGroups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/features/workspace/aiAssistGroups.ts
import type {
  AiAssistPassState,
  AiAssistProposedRule,
  SuggestedEntry,
} from "../../lib/workspace/types";

export type AiAssistReviewRow = {
  statementRowId: string;
  postedDate: string;
  payee: string;
  narration: string | null;
  rawDescription: string;
  sourceAccount: string;
  sourceAmount: string;
  amount: number;
  explanation: string | null;
  failed: boolean;
};

export type AiAssistGroup = {
  ledgerAccount: string;
  rows: AiAssistReviewRow[];
  net: number;
  rules: AiAssistProposedRule[];
};

export function buildAiAssistGroups(
  entries: SuggestedEntry[],
  pass: AiAssistPassState,
): { groups: AiAssistGroup[]; needsEye: AiAssistReviewRow[] } {
  const entriesById = new Map(entries.map((entry) => [entry.statementRowId, entry]));
  const grouped = new Map<string, AiAssistReviewRow[]>();
  const needsEye: AiAssistReviewRow[] = [];

  for (const suggestion of pass.suggestions) {
    const entry = entriesById.get(suggestion.statementRowId);
    if (!entry) continue; // row approved/edited elsewhere
    const amount = Number.parseFloat(entry.sourceAmount);
    const row: AiAssistReviewRow = {
      statementRowId: entry.statementRowId,
      postedDate: entry.postedDate,
      payee: suggestion.payee ?? entry.description,
      narration: suggestion.narration ?? null,
      rawDescription: entry.description,
      sourceAccount: entry.sourceAccount,
      sourceAmount: entry.sourceAmount,
      amount: Number.isFinite(amount) ? amount : 0,
      explanation: suggestion.explanation ?? null,
      failed: suggestion.status === "failed",
    };
    if (suggestion.status === "suggested" && suggestion.ledgerAccount) {
      const rows = grouped.get(suggestion.ledgerAccount) ?? [];
      rows.push(row);
      grouped.set(suggestion.ledgerAccount, rows);
    } else {
      needsEye.push(row);
    }
  }

  const groups: AiAssistGroup[] = [...grouped.entries()]
    .map(([ledgerAccount, rows]) => ({
      ledgerAccount,
      rows,
      net: rows.reduce((sum, row) => sum + row.amount, 0),
      rules: pass.proposedRules.filter((rule) => rule.ledgerAccount === ledgerAccount),
    }))
    .sort(
      (a, b) =>
        b.rows.length - a.rows.length || a.ledgerAccount.localeCompare(b.ledgerAccount),
    );

  return { groups, needsEye };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/features/workspace/aiAssistGroups.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/aiAssistGroups.ts src/features/workspace/aiAssistGroups.test.ts
git commit -m "feat(ai-assist): review grouping and needs-eye partition logic"
```

---

### Task 9: `AiAssistReview` component (momentum flow)

**Files:**
- Create: `src/features/workspace/AiAssistReview.tsx`
- Test: `src/features/workspace/AiAssistReview.test.tsx`
- Modify: `src/styles.css` (component styles)

**Interfaces:**
- Consumes: `buildAiAssistGroups` (Task 8), types (Task 7).
- Produces:

```ts
type AiAssistReviewProps = {
  pass: AiAssistPassState;
  entries: SuggestedEntry[];
  onApprove: (selection: {
    entries: ApproveAiAssistBatchInput["entries"];
    rules: ApproveAiAssistBatchInput["rules"];
  }) => Promise<void> | void;
  onDismiss: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
  onEditRow: (statementRowId: string) => void;
};
export function AiAssistReview(props: AiAssistReviewProps): JSX.Element;
```

Behavior (mirror `docs/html-mockups/ai-assist-review-c-flow.html`; consult it for structure and copy):
- **Steps** = one per group, then "Needs your eye" (only if non-empty), then "Sign & approve". A left progress rail lists all steps with state (done ✓ + accepted tally, current, upcoming), heading "N of M groups reviewed". Rail items are buttons — jump-ahead is allowed, including straight to signing.
- **Group card**: display heading = ledger account, count + net; rows with checkbox (checked by default), payee, `was: <rawDescription>` in mono, date, amount; the group's proposed rules as checked-by-default rule lines ("⚡ New rule: …" with matched count); primary button "Looks right — next group" (advances), secondary "Skip for now" (advances without marking reviewed). Clicking a row's payee calls `onEditRow(statementRowId)`.
- **Rule auto-uncheck**: a rule's checkbox is disabled+unchecked whenever every row of its group is unchecked.
- **Needs your eye step**: rows unchecked by default; failed rows show "Retry" (calls `onRetry`); explanation text renders as an italic aside. Checking a needs-eye row includes it **only if** it has a `ledgerAccount` (rows without one can only be edited via `onEditRow`; render their checkbox disabled).
- **Signing step**: total accepted entries and rules across all steps, snapshot notice copy: "A snapshot is taken before anything is written. You can revert this batch at any time.", primary button `Approve N entries` (calls `onApprove` with the checked selection), link-style "Dismiss results" (calls `onDismiss`).
- **While `pass.status === "running"`**: show a progress header "X of Y categorized…" above the rail; steps render from partial results.
- Keyboard: `Enter` = primary action of current step; `e` = edit selected row; `j`/`k` move row selection; `Space` toggles selected row. Attach via a `onKeyDown` handler on the root (root has `tabIndex={-1}` and autofocus), not a global listener.

State model (internal `useState`): `stepIndex: number`, `excludedRows: Set<string>` (checked-by-default rows the user unchecked), `includedNeedsEye: Set<string>`, `excludedRules: Set<string>`, `reviewedSteps: Set<number>`, `selectedRowId: string | null`.

Selection math for `onApprove`:

```ts
const entriesSelection = [
  ...groups.flatMap((group) =>
    group.rows
      .filter((row) => !excludedRows.has(row.statementRowId))
      .map((row) => ({
        statementRowId: row.statementRowId,
        ledgerAccount: group.ledgerAccount,
        payee: suggestionFor(row.statementRowId)?.payee ?? null,
        narration: suggestionFor(row.statementRowId)?.narration ?? null,
      })),
  ),
  ...needsEye
    .filter((row) => includedNeedsEye.has(row.statementRowId))
    .map((row) => ({
      statementRowId: row.statementRowId,
      ledgerAccount: suggestionFor(row.statementRowId)!.ledgerAccount!,
      payee: suggestionFor(row.statementRowId)?.payee ?? null,
      narration: suggestionFor(row.statementRowId)?.narration ?? null,
    })),
];
const rulesSelection = groups
  .flatMap((group) => group.rules)
  .filter((rule) => !excludedRules.has(rule.id) && ruleGroupHasCheckedRows(rule))
  .map((rule) => ({
    sourceAccount: rule.sourceAccount,
    matchText: rule.matchText,
    ledgerAccount: rule.ledgerAccount,
  }));
```

- [ ] **Step 1: Write failing tests**

```tsx
// src/features/workspace/AiAssistReview.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AiAssistReview } from "./AiAssistReview";
import type { AiAssistPassState, SuggestedEntry } from "../../lib/workspace/types";

function entry(id: string, description: string, amount: string): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: id,
    postedDate: "2026-05-06",
    description,
    sourceAccount: "Assets:Bank:Checking",
    sourceAmount: amount,
    sourceFileName: "checking.csv",
    importFingerprint: `fp-${id}`,
    pendingAtImport: false,
  };
}

const entries = [
  entry("row-1", "WEB PMTS Autobooks, Inc. WEB", "-0.50"),
  entry("row-2", "SQSP* CMPGNS#232", "-10.66"),
  entry("row-3", "FEE 122111 GUSTO CCD", "-65.02"),
  entry("row-4", "Mobile Deposit", "2500.00"),
];

const pass: AiAssistPassState = {
  passId: "pass-1",
  status: "complete",
  totalRows: 4,
  processedRows: 4,
  suggestions: [
    { statementRowId: "row-1", status: "suggested", ledgerAccount: "Expenses:Software", payee: "Autobooks", narration: "Fee", confidence: 0.93, explanation: null },
    { statementRowId: "row-2", status: "suggested", ledgerAccount: "Expenses:Software", payee: "Squarespace", narration: null, confidence: 0.9, explanation: null },
    { statementRowId: "row-3", status: "suggested", ledgerAccount: "Expenses:Payroll", payee: "Gusto", narration: null, confidence: 0.88, explanation: null },
    { statementRowId: "row-4", status: "needsEye", ledgerAccount: null, payee: null, narration: null, confidence: null, explanation: "AI unsure — deposit source?" },
  ],
  proposedRules: [
    { id: "rule-1", sourceAccount: "Assets:Bank:Checking", matchText: "Autobooks", ledgerAccount: "Expenses:Software", matchedRowCount: 1 },
  ],
};

function renderReview(overrides: Partial<Parameters<typeof AiAssistReview>[0]> = {}) {
  const onApprove = vi.fn();
  render(
    <AiAssistReview
      pass={pass}
      entries={entries}
      onApprove={onApprove}
      onDismiss={() => undefined}
      onRetry={() => undefined}
      onEditRow={() => undefined}
      {...overrides}
    />,
  );
  return { onApprove };
}

describe("AiAssistReview", () => {
  test("shows the first group card with rows checked and a rail", () => {
    renderReview();
    expect(screen.getByRole("heading", { name: "Expenses:Software" })).toBeTruthy();
    expect(screen.getByText(/was: WEB PMTS Autobooks/)).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.some((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/0 of 2 groups reviewed/)).toBeTruthy();
  });

  test("accepting a group advances and updates the rail", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Looks right/ }));
    expect(screen.getByRole("heading", { name: "Expenses:Payroll" })).toBeTruthy();
    expect(screen.getByText(/1 of 2 groups reviewed/)).toBeTruthy();
  });

  test("rail allows jumping straight to signing; approve reports checked selection", () => {
    const { onApprove } = renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve 3 entries/ }));
    expect(onApprove).toHaveBeenCalledWith({
      entries: [
        { statementRowId: "row-1", ledgerAccount: "Expenses:Software", payee: "Autobooks", narration: "Fee" },
        { statementRowId: "row-2", ledgerAccount: "Expenses:Software", payee: "Squarespace", narration: null },
        { statementRowId: "row-3", ledgerAccount: "Expenses:Payroll", payee: "Gusto", narration: null },
      ],
      rules: [
        { sourceAccount: "Assets:Bank:Checking", matchText: "Autobooks", ledgerAccount: "Expenses:Software" },
      ],
    });
  });

  test("unchecking a row excludes it and its lone-match rule", () => {
    const { onApprove } = renderReview();
    // Uncheck both software rows: the Autobooks rule must drop out too.
    fireEvent.click(screen.getByRole("checkbox", { name: /Autobooks/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Squarespace/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve 1 entr/ }));
    const selection = onApprove.mock.calls[0][0];
    expect(selection.entries).toHaveLength(1);
    expect(selection.rules).toHaveLength(0);
  });

  test("needs-eye rows start unchecked and rows without an account cannot be checked", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Needs your eye/ }));
    const checkbox = screen.getByRole("checkbox", { name: /Mobile Deposit/ }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByText(/AI unsure — deposit source\?/)).toBeTruthy();
  });

  test("running pass shows progress", () => {
    renderReview({ pass: { ...pass, status: "running", processedRows: 2 } });
    expect(screen.getByText(/2 of 4 categorized/)).toBeTruthy();
  });
});
```

Give every row checkbox an accessible name via `aria-label={row.payee}` and rail buttons `aria-label`s matching their step names so the queries above resolve.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/workspace/AiAssistReview.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Write `AiAssistReview.tsx` implementing the behavior spec above. Skeleton (fill in rendering with the class names below; consult the mockup for structure):

```tsx
import { useMemo, useState } from "react";
import type {
  AiAssistPassState,
  ApproveAiAssistBatchInput,
  SuggestedEntry,
} from "../../lib/workspace/types";
import { buildAiAssistGroups } from "./aiAssistGroups";

type AiAssistReviewProps = {
  pass: AiAssistPassState;
  entries: SuggestedEntry[];
  onApprove: (selection: {
    entries: ApproveAiAssistBatchInput["entries"];
    rules: ApproveAiAssistBatchInput["rules"];
  }) => Promise<void> | void;
  onDismiss: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
  onEditRow: (statementRowId: string) => void;
};

export function AiAssistReview({
  pass,
  entries,
  onApprove,
  onDismiss,
  onRetry,
  onEditRow,
}: AiAssistReviewProps) {
  const { groups, needsEye } = useMemo(
    () => buildAiAssistGroups(entries, pass),
    [entries, pass],
  );
  const suggestionById = useMemo(
    () => new Map(pass.suggestions.map((suggestion) => [suggestion.statementRowId, suggestion])),
    [pass],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [reviewedSteps, setReviewedSteps] = useState<Set<number>>(new Set());
  const [excludedRows, setExcludedRows] = useState<Set<string>>(new Set());
  const [includedNeedsEye, setIncludedNeedsEye] = useState<Set<string>>(new Set());
  const [excludedRules, setExcludedRules] = useState<Set<string>>(new Set());

  const steps = [
    ...groups.map((group) => ({ kind: "group" as const, group })),
    ...(needsEye.length > 0 ? [{ kind: "needsEye" as const }] : []),
    { kind: "signing" as const },
  ];
  // ... selection math (as specified in the task interface), rail, current
  // step card, signing summary. Toggle helpers flip membership in the Sets
  // via new Set(previous).
}
```

Styling: add an `ai-assist-*` class family to `src/styles.css` following the mockup's layout (rail `ai-assist-rail`, card `ai-assist-card`, rows `ai-assist-row`, rule line `ai-assist-rule`, signing `ai-assist-signing`), reusing the app's existing CSS variables (`--bg`, `--accent`, `--border`, etc. — match whatever variable names `styles.css` already defines for the Inbox).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/features/workspace/AiAssistReview.test.tsx && npx tsc --noEmit`
Expected: 6 tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/AiAssistReview.tsx src/features/workspace/AiAssistReview.test.tsx src/styles.css
git commit -m "feat(ai-assist): momentum-flow review component"
```

---

### Task 10: Inbox integration and App wiring

**Files:**
- Modify: `src/features/workspace/InboxPanel.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/workspace/InboxPanel.test.tsx` (extend)

**Interfaces:**
- `InboxPanel` gains optional props:

```ts
  aiAssist?: {
    pass: AiAssistPassState | null;
    adapterConfigured: boolean;
    running: boolean;
    disclosure: AiContextDisclosure | null;
    onStart: () => void;
    onApprove: (selection: { entries: ApproveAiAssistBatchInput["entries"]; rules: ApproveAiAssistBatchInput["rules"] }) => Promise<void>;
    onDismiss: () => Promise<void>;
    onRetry: () => Promise<void>;
    onOpenSettings: () => void;
  };
```

- Consumes: `AiAssistReview` (Task 9), api functions (Task 7).

Behavior:
- Toolbar gains an **AI Assist** button (right side of `inbox-toolbar`): label `AI Assist` with pending-count subtitle when idle; `Categorizing…` disabled while `running`. If `!adapterConfigured`, the button reads `Set up AI Assist` and calls `onOpenSettings`.
- **Disclosure gate**: first click (when `localStorage.getItem("diurnum.aiAssist.disclosureAcknowledged") !== "true"`) renders an inline confirm panel listing `disclosure.fieldsSent` with "Run AI Assist" / "Cancel"; confirming sets the localStorage key and calls `onStart`.
- When `aiAssist.pass` is non-null with status `running` or `complete`, `InboxPanel` renders `AiAssistReview` **instead of** the list + inspector (the review's `onEditRow` selects that row and exits to the normal Inbox view with it selected — set the panel's `selectedStatementRowId`).
- `App.tsx` wiring:

```tsx
const [aiAssistPass, setAiAssistPass] = useState<AiAssistPassState | null>(null);
const [aiAssistRunning, setAiAssistRunning] = useState(false);

async function driveAiAssistChunks(passId: string) {
  setAiAssistRunning(true);
  try {
    let state = await api.getAiAssistPass(workspace!.rootPath);
    while (state && state.status === "running") {
      state = await api.runAiAssistNextChunk(workspace!.rootPath, state.passId);
      setAiAssistPass(state);
    }
    if (state) setAiAssistPass(state);
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
  } finally {
    setAiAssistRunning(false);
  }
}

async function handleStartAiAssist() {
  if (!workspace) return;
  try {
    const state = await api.startAiAssistPass(workspace.rootPath);
    setAiAssistPass(state);
    void driveAiAssistChunks(state.passId);
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
  }
}

async function handleApproveAiAssistBatch(selection: {
  entries: ApproveAiAssistBatchInput["entries"];
  rules: ApproveAiAssistBatchInput["rules"];
}) {
  if (!workspace || !aiAssistPass) return;
  await session
    .approveAiAssistBatch({
      workspaceRootPath: workspace.rootPath,
      passId: aiAssistPass.passId,
      ...selection,
    })
    .catch(() => undefined);
  setAiAssistPass(null);
}

async function handleDismissAiAssist() {
  if (!workspace || !aiAssistPass) return;
  await api.dismissAiAssistPass(workspace.rootPath, aiAssistPass.passId).catch(() => undefined);
  setAiAssistPass(null);
}

async function handleRetryAiAssist() {
  if (!workspace || !aiAssistPass) return;
  const state = await api.retryAiAssistFailedRows(workspace.rootPath, aiAssistPass.passId);
  setAiAssistPass(state);
  void driveAiAssistChunks(state.passId);
}
```

Rehydration: where App loads the workspace view after open (find the effect that runs on `workspace?.rootPath` change), also call `api.getAiAssistPass(workspace.rootPath).then(setAiAssistPass).catch(() => undefined)`.
Post-import entry point: locate the App handler passed to `CsvImportSetup` as `onImportStatementRows`; after a successful import add `setActiveScreen("inbox")` (match the actual screen-state setter name used elsewhere in App.tsx) so the user lands next to the AI Assist button.
`adapterConfigured` comes from the existing `aiAdapterConfig` state (`aiAdapterConfig?.command != null`); `disclosure` from existing `aiContextDisclosure`; `onOpenSettings` sets the active screen to settings.

- [ ] **Step 1: Write failing tests** (extend `InboxPanel.test.tsx`, following its existing render-helper pattern)

```tsx
test("AI Assist button starts a pass after disclosure acknowledgment", () => {
  localStorage.removeItem("diurnum.aiAssist.disclosureAcknowledged");
  const onStart = vi.fn();
  // render InboxPanel with the file's existing fixture props plus:
  // aiAssist={{ pass: null, adapterConfigured: true, running: false,
  //   disclosure: { adapterConfigured: true, fieldsSent: ["Chart of Accounts"] },
  //   onStart, onApprove: async () => {}, onDismiss: async () => {},
  //   onRetry: async () => {}, onOpenSettings: () => {} }}
  fireEvent.click(screen.getByRole("button", { name: /AI Assist/ }));
  expect(onStart).not.toHaveBeenCalled();
  expect(screen.getByText(/Chart of Accounts/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Run AI Assist/ }));
  expect(onStart).toHaveBeenCalled();
  expect(localStorage.getItem("diurnum.aiAssist.disclosureAcknowledged")).toBe("true");
});

test("renders review mode when a pass is active", () => {
  // aiAssist.pass = a complete AiAssistPassState fixture (reuse the shape from
  // AiAssistReview.test.tsx) → expect the review heading instead of the list.
  expect(screen.getByText(/Sign & approve/)).toBeTruthy();
});

test("unconfigured adapter shows setup state", () => {
  const onOpenSettings = vi.fn();
  // aiAssist.adapterConfigured = false
  fireEvent.click(screen.getByRole("button", { name: /Set up AI Assist/ }));
  expect(onOpenSettings).toHaveBeenCalled();
});
```

(Write these as real tests against the file's actual fixtures — `InboxPanel.test.tsx` already has a props builder; extend it with the `aiAssist` prop.)

Run: `npx vitest run src/features/workspace/InboxPanel.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 2: Implement** `InboxPanel` changes and `App.tsx` wiring as specified above.

- [ ] **Step 3: Run to verify pass**

Run: `npx vitest run src/features/workspace && npx tsc --noEmit`
Expected: all workspace feature tests PASS, no type errors.

- [ ] **Step 4: Manual smoke check**

Run: `npm run tauri dev` (or `make dev` if the Makefile defines it), open a workspace with pending Inbox rows and a configured adapter, click AI Assist, watch the disclosure → progress → review flow. Verify approve writes entries and the ledger stays valid.

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/InboxPanel.tsx src/features/workspace/InboxPanel.test.tsx src/App.tsx
git commit -m "feat(ai-assist): inbox integration, disclosure gate, chunk-loop driver"
```

---

### Task 11: Reference adapter doc and architecture doc

**Files:**
- Create: `docs/ai-assist-adapter.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Write the reference adapter doc**

`docs/ai-assist-adapter.md` must contain: the batch request/response JSON schema (copy the envelope from the spec verbatim), the per-row legacy contract note, and a working Claude Code CLI wrapper example:

````markdown
# AI Assist BYO Adapter Reference

Diurnum's AI Assist sends a batch categorization request to your configured
adapter command's stdin and reads suggestions from stdout.

[document request/response JSON with field tables — copy from
docs/superpowers/specs/2026-07-14-ai-assist-bulk-categorization-design.md]

## Claude Code CLI wrapper

Save as `~/bin/diurnum-adapter` (chmod +x), configure Diurnum's AI Adapter
command as `diurnum-adapter`:

```sh
#!/bin/sh
# Reads a Diurnum batchSuggestionRequest on stdin, returns suggestions JSON.
exec claude -p --output-format text "You are a bookkeeping assistant. Read the
JSON batchSuggestionRequest below. For every row, choose the best ledgerAccount
from sharedContext.chartOfAccounts, a short cleaned payee, and a one-line
narration. Respond with ONLY the JSON batchSuggestionResponse object — no prose,
no code fences. Set needsHumanAttention true when unsure. Also propose
proposedRules for recurring vendor substrings.

$(cat)"
```
````

- [ ] **Step 2: Update `docs/architecture.md`**

Add an "AI Assist" section describing: the batch protocol module (`ai_assist.rs`), pass/suggestion/batch tables, the chunk-loop driver in `App.tsx`, the review mode in `InboxPanel`, and the batch provenance key. Follow the doc's existing diagram/section conventions.

- [ ] **Step 3: Commit**

```bash
git add docs/ai-assist-adapter.md docs/architecture.md
git commit -m "docs(ai-assist): reference adapter and architecture updates"
```

---

### Task 12: End-to-end golden path

**Files:**
- Create: `e2e/ai-assist.spec.ts`

**Interfaces:** Consumes the `__DIURNUM_TEST_API__` injection pattern from `e2e/workspace-lifecycle.spec.ts` (copy its `addInitScript` structure and workspace fixture).

- [ ] **Step 1: Write the spec**

Following `e2e/workspace-lifecycle.spec.ts`'s structure, inject a test API whose double implements: `getSuggestedEntries` (4 pending standard entries), `getAiAssistPass` (null initially), `startAiAssistPass` (returns a running pass), `runAiAssistNextChunk` (returns the complete pass with 3 suggested + 1 needsEye and one proposed rule), `approveAiAssistBatch` (records its input on `window.__APPROVE_CALLS__` and returns the view with those entries removed), `getAiAssistConfig`-equivalents used by App (`getAiAdapterConfig` → `{ command: "adapter" }`, `getAiContextDisclosure` → `{ adapterConfigured: true, fieldsSent: ["Chart of Accounts"] }`), plus whatever the lifecycle spec's view double already stubs.

Test flow:

```ts
test("AI Assist golden path: start → review → sign → approve", async ({ page }) => {
  // 1. open workspace (copy lifecycle spec setup), go to Inbox
  await page.getByRole("button", { name: /AI Assist/ }).click();
  await page.getByRole("button", { name: /Run AI Assist/ }).click(); // disclosure
  await expect(page.getByRole("heading", { name: "Expenses:Software" })).toBeVisible();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.getByRole("button", { name: /Sign & approve/ }).click();
  await page.getByRole("button", { name: /Approve 3 entries/ }).click();
  const calls = await page.evaluate(() => (window as any).__APPROVE_CALLS__);
  expect(calls[0].entries).toHaveLength(3);
  expect(calls[0].rules).toHaveLength(1);
});
```

- [ ] **Step 2: Run**

Run: `npx playwright test e2e/ai-assist.spec.ts`
Expected: PASS (fix selector drift against the real component markup as needed).

- [ ] **Step 3: Full suite + commit**

Run: `npx vitest run && cd src-tauri && cargo test && cargo fmt --check && cd .. && npx playwright test`
Expected: everything green.

```bash
git add e2e/ai-assist.spec.ts
git commit -m "test(ai-assist): end-to-end golden path"
```

---

## Plan Self-Review Notes (already applied)

- **Spec coverage:** trigger + disclosure gate (Task 10), eligibility excluding rules/transfers (Task 2), chunked protocol + shared context + boundary validation + failure isolation (Tasks 1, 3), persistence/rehydration (Tasks 2, 10), retry/dismiss (Task 4), momentum-flow UI incl. rail jump-ahead, rule auto-uncheck, no confidence percentages (Tasks 8, 9), atomic batch write + provenance + snapshot + git + validation gate + drop-stale-rows (Task 5), batch revert incl. rules (Task 6), reference adapter (Task 11), e2e (Task 12).
- **Deliberate deferrals (documented, not gaps):** "re-run all" escape hatch and a "Recent AI Assist batches" management UI are backend-complete (`start_ai_assist_pass` supersedes old passes; `list/revert_ai_assist_batches` commands exist) but get no dedicated screen in this plan — surface revert via a follow-up once the core loop ships. The spec's ~120s adapter timeout is not implemented (`invoke_adapter_raw` blocks on the child; the existing per-row path has the same behavior) — acceptable for a local CLI adapter, revisit if hangs are observed in practice.
- **Type consistency:** checked — `AiAssistPassState`/`AiAssistSuggestionState` field names match across Rust (camelCase serde), TS types, and component code; command names match `generate_handler` registrations and api invocations.
