use crate::workspace::ai_adapter::{invoke_adapter_raw, AiBusinessProfile, SimilarApprovedEntry};
use crate::workspace::approval::{get_suggested_entries, SuggestedEntryKind};
use crate::workspace::categorization_rules::CategorizationRule;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

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
            entry.kind == SuggestedEntryKind::Standard && entry.suggested_ledger_account.is_none()
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

    pub(crate) fn insert_pending_row(
        connection: &Connection,
        id: &str,
        description: &str,
        amount: &str,
    ) {
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
        insert_pending_row(
            &connection,
            "row-1",
            "WEB PMTS Autobooks, Inc. WEB",
            "-0.50",
        );
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
}
