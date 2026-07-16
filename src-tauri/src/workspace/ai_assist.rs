use crate::workspace::ai_adapter::{
    invoke_adapter_raw, load_adapter_command, read_chart_of_accounts, read_manifest,
    AiBusinessProfile, SimilarApprovedEntry,
};
use crate::workspace::approval::{
    ensure_main_includes, ensure_provenance_columns, get_suggested_entries,
    load_pending_suggested_entry, monthly_transaction_file, open_ledger_account_if_missing,
    parse_amount, SuggestedEntry, SuggestedEntryKind,
};
use crate::workspace::categorization_rules::{
    create_categorization_rule_from_connection, list_categorization_rules,
    list_categorization_rules_from_connection, CategorizationRule, CreateCategorizationRuleInput,
};
use crate::workspace::data_integrity::{
    atomic_append, create_snapshot, restore_snapshot, RestoreSnapshotInput, SnapshotReason,
};
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::git::{commit_workspace_changes, CommitWorkspaceChangesInput};
use crate::workspace::imports::ensure_import_tables;
use crate::workspace::open::open_workspace;
use crate::workspace::types::{LedgerStatus, WorkspaceSummary};
use crate::workspace::validation::validate_workspace;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
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

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistBatchSummary {
    pub id: String,
    pub approved_at: String,
    pub entry_count: i64,
}

fn escape_beancount_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
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
    let existing_rules: HashSet<(String, String)> =
        list_categorization_rules_from_connection(&connection)?
            .into_iter()
            .filter(|rule| rule.enabled)
            .map(|rule| (rule.source_account, rule.match_text))
            .collect();

    let snapshot = create_snapshot(root, SnapshotReason::Approval)?;
    let batch_id = Uuid::new_v4().to_string();
    let mut records: Vec<BatchEntryRecord> = Vec::new();
    // The snapshot only covers files that existed when it was taken. Monthly
    // files this batch creates must be deleted on rollback, or a later
    // approval for the same month would re-include the rolled-back entries.
    let mut created_monthly_files: Vec<std::path::PathBuf> = Vec::new();
    let mut write = || -> Result<(), WorkspaceError> {
        for (entry, row) in &approvals {
            open_ledger_account_if_missing(root, &entry.ledger_account)?;
            let monthly_relative_path = monthly_transaction_file(&row.posted_date)?;
            let monthly_path = root.join(&monthly_relative_path);
            if let Some(parent) = monthly_path.parent() {
                fs::create_dir_all(parent)?;
            }
            if !monthly_path.exists() {
                created_monthly_files.push(monthly_path.clone());
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
        remove_batch_created_files(&created_monthly_files);
        return Err(error);
    }

    // Golden-path gate: the whole batch lands or none of it does.
    let post_validation = match validate_workspace(root) {
        Ok(validation) => validation,
        Err(error) => {
            return rollback_ai_assist_batch(
                &input.workspace_root_path,
                &snapshot.id,
                &created_monthly_files,
                error,
            );
        }
    };
    if post_validation.status == LedgerStatus::Invalid {
        return rollback_ai_assist_batch(
            &input.workspace_root_path,
            &snapshot.id,
            &created_monthly_files,
            WorkspaceError::new(
                WorkspaceErrorCode::InvalidLedger,
                "AI Assist batch was rolled back because the ledger became invalid.",
            ),
        );
    }

    let sqlite_result = (|| -> Result<(), WorkspaceError> {
        let transaction = connection.unchecked_transaction()?;
        let mut rule_ids: Vec<String> = Vec::new();
        for rule in &input.rules {
            if existing_rules.contains(&(rule.source_account.clone(), rule.match_text.clone())) {
                continue;
            }
            let rule_input = CreateCategorizationRuleInput {
                workspace_root_path: input.workspace_root_path.clone(),
                source_account: rule.source_account.clone(),
                match_text: rule.match_text.clone(),
                ledger_account: rule.ledger_account.clone(),
            };
            let created = create_categorization_rule_from_connection(&transaction, &rule_input)?;
            rule_ids.push(created.id);
        }

        let entries_json = serde_json::to_string(&records)
            .map_err(|error| WorkspaceError::io(error.to_string()))?;
        let rule_ids_json = serde_json::to_string(&rule_ids)
            .map_err(|error| WorkspaceError::io(error.to_string()))?;
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
                entries_json,
                rule_ids_json
            ],
        )?;
        transaction.execute(
            "update ai_assist_passes set status = 'approved' where id = ?1",
            [input.pass_id.as_str()],
        )?;
        transaction.commit()?;
        Ok(())
    })();
    if let Err(error) = sqlite_result {
        return rollback_ai_assist_batch(
            &input.workspace_root_path,
            &snapshot.id,
            &created_monthly_files,
            error,
        );
    }

    let _ = commit_workspace_changes(CommitWorkspaceChangesInput {
        workspace_root_path: input.workspace_root_path.clone(),
        message: format!("AI Assist: approved {} entries", records.len()),
        paths: vec![],
    });

    open_workspace(root)
}

fn rollback_ai_assist_batch<T>(
    workspace_root_path: &str,
    snapshot_id: &str,
    created_monthly_files: &[std::path::PathBuf],
    error: WorkspaceError,
) -> Result<T, WorkspaceError> {
    let restore_result = restore_snapshot(RestoreSnapshotInput {
        workspace_root_path: workspace_root_path.to_string(),
        snapshot_id: snapshot_id.to_string(),
    });
    remove_batch_created_files(created_monthly_files);
    restore_result?;
    Err(error)
}

/// Best-effort cleanup of monthly files this batch created: `restore_snapshot`
/// cannot remove them (it only rewrites files captured in the snapshot), and a
/// leftover file would resurrect rolled-back entries the next time an approval
/// re-includes that month.
fn remove_batch_created_files(paths: &[std::path::PathBuf]) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
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

struct ChunkRow {
    id: String,
    posted_date: String,
    description: String,
    source_account: String,
    source_amount: String,
    row_status: String,
}

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
                        &connection,
                        pass_id,
                        &row.id,
                        "failed",
                        None,
                        None,
                        None,
                        None,
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
                                &connection,
                                pass_id,
                                &row.id,
                                "failed",
                                None,
                                None,
                                None,
                                None,
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
                connection,
                pass_id,
                &row.id,
                "failed",
                None,
                None,
                None,
                None,
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

    #[allow(dead_code)]
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
        format!(
            r#"{{"suggestions":[{suggestions}],"proposedRules":[{{"matchText":"Autobooks","sourceAccount":"Assets:Bank:Checking","ledgerAccount":"Expenses:Software","matchedRowIds":["row-1"]}}]}}"#
        )
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
        let command =
            write_adapter_script(tempdir.path(), r#"{"suggestions":[],"proposedRules":[]}"#);
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

    use crate::workspace::ai_assist::{
        approve_ai_assist_batch, AiAssistEntryInput, AiAssistRuleInput, ApproveAiAssistBatchInput,
    };

    fn approve_input(
        root: &str,
        pass_id: &str,
        entries: Vec<AiAssistEntryInput>,
    ) -> ApproveAiAssistBatchInput {
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
        insert_pending_row(
            &connection,
            "row-1",
            "WEB PMTS Autobooks, Inc. WEB",
            "-0.50",
        );
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

        let monthly =
            fs::read_to_string(Path::new(&root).join("transactions/2026-05.bean")).unwrap();
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
        let rules =
            crate::workspace::categorization_rules::list_categorization_rules(&root).unwrap();
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
            .execute(
                "update statement_rows set status = 'accounted' where id = 'row-1'",
                [],
            )
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

    #[test]
    fn rollback_removes_monthly_file_created_by_the_batch() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "A", "-1.00");
        let pass = start_ai_assist_pass(&root).unwrap();
        // The batch's posted date lands in a month with no monthly file yet,
        // so the snapshot taken before writing cannot cover it.
        let monthly_path = Path::new(&root).join("transactions/2026-05.bean");
        assert!(!monthly_path.exists());

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
        // If the file survived, a later legitimate approval for this month
        // would re-include it and resurrect the rolled-back entry.
        assert!(!monthly_path.exists());
    }

    #[test]
    fn batch_approval_rolls_back_when_post_write_validation_errors() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        let mut entries = Vec::new();
        for index in 0..32 {
            let row_id = format!("row-{index}");
            insert_pending_row(&connection, &row_id, "A", "-1.00");
            entries.push(AiAssistEntryInput {
                statement_row_id: row_id,
                ledger_account: "Expenses:Software".to_string(),
                payee: None,
                narration: None,
            });
        }
        let pass = start_ai_assist_pass(&root).unwrap();
        let main_path = Path::new(&root).join("main.bean");
        let main_before = fs::read_to_string(&main_path).unwrap();
        let monthly_path = Path::new(&root).join("transactions/2026-05.bean");

        // Once the first append proves the post-snapshot write phase started,
        // introduce a real filesystem read error for the later validation.
        // Remaining fsync-backed appends keep the write loop active until the
        // injected path is present.
        let transactions_path = Path::new(&root).join("transactions");
        let watched_monthly_path = monthly_path.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let injector = std::thread::spawn(move || {
            ready_tx.send(()).unwrap();
            while !watched_monthly_path.exists() {
                std::thread::yield_now();
            }
            fs::create_dir(transactions_path.join("validation-error.bean")).unwrap();
        });
        ready_rx.recv().unwrap();

        let result = approve_ai_assist_batch(approve_input(&root, &pass.pass_id, entries));
        injector.join().unwrap();

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(main_path).unwrap(), main_before);
        assert!(!monthly_path.exists());
        let pending: i64 = connection
            .query_row(
                "select count(*) from statement_rows where status = 'pending'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 32);
        assert!(list_ai_assist_batches(&root).unwrap().is_empty());
    }

    #[test]
    fn batch_approval_rolls_back_ledger_and_rules_when_sqlite_update_fails() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = test_workspace(&tempdir);
        let connection = open_test_connection(&root);
        insert_pending_row(&connection, "row-1", "A", "-1.00");
        let pass = start_ai_assist_pass(&root).unwrap();
        let main_path = Path::new(&root).join("main.bean");
        let main_before = fs::read_to_string(&main_path).unwrap();
        let monthly_path = Path::new(&root).join("transactions/2026-05.bean");
        crate::workspace::categorization_rules::list_categorization_rules(&root).unwrap();
        connection
            .execute_batch(
                "create trigger fail_ai_assist_status_update
                 before update of status on statement_rows
                 when new.status = 'accounted'
                 begin
                   select raise(abort, 'forced status update failure');
                 end;",
            )
            .unwrap();

        let result = approve_ai_assist_batch(ApproveAiAssistBatchInput {
            workspace_root_path: root.clone(),
            pass_id: pass.pass_id,
            entries: vec![AiAssistEntryInput {
                statement_row_id: "row-1".to_string(),
                ledger_account: "Expenses:Software".to_string(),
                payee: None,
                narration: None,
            }],
            rules: vec![AiAssistRuleInput {
                source_account: "Assets:Bank:Checking".to_string(),
                match_text: "A".to_string(),
                ledger_account: "Expenses:Software".to_string(),
            }],
        });

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(main_path).unwrap(), main_before);
        assert!(!monthly_path.exists());
        let pending: i64 = connection
            .query_row(
                "select count(*) from statement_rows where status = 'pending'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending, 1);
        assert!(
            crate::workspace::categorization_rules::list_categorization_rules(&root)
                .unwrap()
                .is_empty()
        );
        assert!(list_ai_assist_batches(&root).unwrap().is_empty());
    }
}
