use crate::workspace::ai_adapter::{suggestion_for_row, AiSuggestion, AiSuggestionRow};
use crate::workspace::categorization_rules::matching_rule_for_row;
use crate::workspace::data_integrity::{atomic_append, create_snapshot, SnapshotReason};
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::imports::ensure_import_tables;
use crate::workspace::open::open_workspace;
use crate::workspace::types::{LedgerStatus, WorkspaceManifest, WorkspaceSummary};
use crate::workspace::validation::validate_workspace;
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestedEntryKind {
    Standard,
    Transfer,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedStatementRow {
    pub statement_row_id: String,
    pub posted_date: String,
    pub description: String,
    pub source_account: String,
    pub source_amount: String,
    pub source_file_name: String,
    pub import_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedEntry {
    pub kind: SuggestedEntryKind,
    pub statement_row_id: String,
    pub posted_date: String,
    pub description: String,
    pub source_account: String,
    pub source_amount: String,
    pub source_file_name: String,
    pub import_fingerprint: String,
    pub pending_at_import: bool,
    pub linked_statement_row: Option<LinkedStatementRow>,
    pub suggested_ledger_account: Option<String>,
    pub categorization_rule_id: Option<String>,
    pub ai_suggestion: Option<AiSuggestion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveSuggestedEntryInput {
    pub workspace_root_path: String,
    pub statement_row_id: String,
    pub ledger_account: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveTransferEntryInput {
    pub workspace_root_path: String,
    pub statement_row_id: String,
    pub linked_statement_row_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertTransferToStandardInput {
    pub workspace_root_path: String,
    pub statement_row_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokenProvenance {
    pub statement_row_id: String,
    pub diurnum_entry_id: Option<String>,
    pub reason: String,
}

pub fn get_suggested_entries(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<SuggestedEntry>, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    ensure_import_tables(&connection)?;
    ensure_provenance_columns(&connection)?;
    ensure_force_standard_column(&connection)?;
    let pending_rows = load_pending_statement_rows(&connection)?;
    let force_standard_ids = load_force_standard_ids(&connection)?;
    build_suggested_entries(root, &connection, pending_rows, &force_standard_ids)
}

pub fn revert_transfer_to_standard(
    input: RevertTransferToStandardInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let connection = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    ensure_import_tables(&connection)?;
    ensure_provenance_columns(&connection)?;
    ensure_force_standard_column(&connection)?;
    connection.execute(
        "update statement_rows set force_standard = 1 where id = ?1 and status = 'pending'",
        [&input.statement_row_id],
    )?;
    open_workspace(root)
}

pub fn get_known_ledger_accounts(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<String>, WorkspaceError> {
    let accounts_content = fs::read_to_string(workspace_root_path.as_ref().join("accounts.bean"))?;
    let accounts = accounts_content
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[1] == "open" {
                Some(parts[2].to_string())
            } else {
                None
            }
        })
        .collect();
    Ok(accounts)
}

pub fn get_broken_provenance(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<BrokenProvenance>, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    ensure_import_tables(&connection)?;
    ensure_provenance_columns(&connection)?;
    let rows = load_accounted_rows(&connection)?;
    let mut broken = Vec::new();

    for row in rows {
        let Some(diurnum_entry_id) = row.diurnum_entry_id.clone() else {
            broken.push(BrokenProvenance {
                statement_row_id: row.statement_row_id,
                diurnum_entry_id: None,
                reason: "Accounted Statement Row has no Diurnum entry id.".to_string(),
            });
            continue;
        };
        let Some(ledger_entry_file) = row.ledger_entry_file.clone() else {
            broken.push(BrokenProvenance {
                statement_row_id: row.statement_row_id,
                diurnum_entry_id: Some(diurnum_entry_id),
                reason: "Accounted Statement Row has no ledger entry file.".to_string(),
            });
            continue;
        };
        let ledger_path = root.join(&ledger_entry_file);
        let contents = match fs::read_to_string(&ledger_path) {
            Ok(contents) => contents,
            Err(_) => {
                broken.push(BrokenProvenance {
                    statement_row_id: row.statement_row_id,
                    diurnum_entry_id: Some(diurnum_entry_id),
                    reason: "Ledger entry file is missing.".to_string(),
                });
                continue;
            }
        };
        if !entry_has_matching_metadata(&contents, &diurnum_entry_id, &row) {
            broken.push(BrokenProvenance {
                statement_row_id: row.statement_row_id,
                diurnum_entry_id: Some(diurnum_entry_id),
                reason: "Diurnum Entry Metadata is missing or changed.".to_string(),
            });
        }
    }

    Ok(broken)
}

pub fn approve_suggested_entry(
    input: ApproveSuggestedEntryInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let validation = validate_workspace(root)?;
    if validation.status == LedgerStatus::Invalid {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Approval is blocked while the Workspace is in Invalid Ledger State.",
        ));
    }
    open_ledger_account_if_missing(root, &input.ledger_account)?;

    let connection = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    ensure_import_tables(&connection)?;
    ensure_provenance_columns(&connection)?;
    let suggested_entry = load_pending_suggested_entry(&connection, &input.statement_row_id)?;
    let pending_at_import = pending_at_import(&connection, &input.statement_row_id)?;
    let source_amount = parse_amount(&suggested_entry.source_amount)?;
    let balancing_amount = -source_amount;
    let diurnum_entry_id = Uuid::new_v4().to_string();

    let monthly_relative_path = monthly_transaction_file(&suggested_entry.posted_date)?;
    let monthly_path = root.join(&monthly_relative_path);
    if let Some(parent) = monthly_path.parent() {
        fs::create_dir_all(parent)?;
    }
    create_snapshot(root, SnapshotReason::Approval)?;
    ensure_main_includes(root, &monthly_relative_path)?;
    append_approved_entry(
        &monthly_path,
        &suggested_entry,
        &input.ledger_account,
        balancing_amount,
        &diurnum_entry_id,
        pending_at_import,
    )?;

    connection.execute(
        "
        update statement_rows
        set status = 'accounted',
            diurnum_entry_id = ?2,
            ledger_entry_file = ?3
        where id = ?1
        ",
        (
            input.statement_row_id,
            diurnum_entry_id,
            monthly_relative_path,
        ),
    )?;

    open_workspace(root)
}

pub fn approve_transfer_entry(
    input: ApproveTransferEntryInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let validation = validate_workspace(root)?;
    if validation.status == LedgerStatus::Invalid {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Approval is blocked while the Workspace is in Invalid Ledger State.",
        ));
    }

    let connection = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    ensure_import_tables(&connection)?;
    ensure_provenance_columns(&connection)?;
    let first = load_pending_suggested_entry(&connection, &input.statement_row_id)?;
    let second = load_pending_suggested_entry(&connection, &input.linked_statement_row_id)?;
    let first_pending_at_import = pending_at_import(&connection, &input.statement_row_id)?;
    let second_pending_at_import = pending_at_import(&connection, &input.linked_statement_row_id)?;
    ensure_transfer_match(&first, &second)?;
    let diurnum_entry_id = Uuid::new_v4().to_string();

    let monthly_relative_path = monthly_transaction_file(&first.posted_date)?;
    let monthly_path = root.join(&monthly_relative_path);
    if let Some(parent) = monthly_path.parent() {
        fs::create_dir_all(parent)?;
    }
    create_snapshot(root, SnapshotReason::Approval)?;
    ensure_main_includes(root, &monthly_relative_path)?;
    append_transfer_entry(
        &monthly_path,
        &first,
        &second,
        &diurnum_entry_id,
        first_pending_at_import || second_pending_at_import,
    )?;

    connection.execute(
        "
        update statement_rows
        set status = 'accounted',
            diurnum_entry_id = ?3,
            ledger_entry_file = ?4
        where id in (?1, ?2)
        ",
        (
            input.statement_row_id,
            input.linked_statement_row_id,
            diurnum_entry_id,
            monthly_relative_path,
        ),
    )?;

    open_workspace(root)
}

fn load_pending_statement_rows(
    connection: &Connection,
) -> Result<Vec<SuggestedEntry>, WorkspaceError> {
    let mut statement = connection.prepare(
        "
        select id, posted_date, description, source_account, source_amount, source_file_name, import_fingerprint, pending_at_import
        from statement_rows
        where status = 'pending'
        order by posted_date, description
        ",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(SuggestedEntry {
                kind: SuggestedEntryKind::Standard,
                statement_row_id: row.get(0)?,
                posted_date: row.get(1)?,
                description: row.get(2)?,
                source_account: row.get(3)?,
                source_amount: row.get(4)?,
                source_file_name: row.get(5)?,
                import_fingerprint: row.get(6)?,
                pending_at_import: row.get::<_, i64>(7)? != 0,
                linked_statement_row: None,
                suggested_ledger_account: None,
                categorization_rule_id: None,
                ai_suggestion: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn build_suggested_entries(
    root: &Path,
    connection: &Connection,
    rows: Vec<SuggestedEntry>,
    force_standard_ids: &HashSet<String>,
) -> Result<Vec<SuggestedEntry>, WorkspaceError> {
    let mut suggestions = Vec::new();
    let mut consumed = vec![false; rows.len()];

    for (index, row) in rows.iter().enumerate() {
        if consumed[index] {
            continue;
        }
        if let Some(linked_index) =
            rows.iter()
                .enumerate()
                .position(|(candidate_index, candidate)| {
                    candidate_index != index
                        && !consumed[candidate_index]
                        && is_transfer_match(row, candidate)
                })
        {
            let linked = rows[linked_index].clone();
            consumed[index] = true;
            consumed[linked_index] = true;
            let mut transfer = row.clone();
            transfer.kind = SuggestedEntryKind::Transfer;
            transfer.linked_statement_row = Some(linked_statement_row(linked));
            suggestions.push(apply_suggestion_layers(root, connection, transfer)?);
            continue;
        }

        if looks_like_one_sided_transfer(row) && !force_standard_ids.contains(&row.statement_row_id)
        {
            let mut transfer = row.clone();
            transfer.kind = SuggestedEntryKind::Transfer;
            consumed[index] = true;
            suggestions.push(apply_suggestion_layers(root, connection, transfer)?);
            continue;
        }
    }

    for (index, row) in rows.into_iter().enumerate() {
        if !consumed[index] {
            suggestions.push(apply_suggestion_layers(root, connection, row)?);
        }
    }
    Ok(suggestions)
}

fn apply_suggestion_layers(
    root: &Path,
    connection: &Connection,
    mut entry: SuggestedEntry,
) -> Result<SuggestedEntry, WorkspaceError> {
    if entry.kind == SuggestedEntryKind::Standard {
        if let Some(rule) =
            matching_rule_for_row(connection, &entry.source_account, &entry.description)?
        {
            entry.suggested_ledger_account = Some(rule.ledger_account);
            entry.categorization_rule_id = Some(rule.id);
        }
        if entry.suggested_ledger_account.is_none() {
            if let Some(ai_suggestion) = suggestion_for_row(root, connection, &entry)? {
                entry.suggested_ledger_account = ai_suggestion.ledger_account.clone();
                entry.ai_suggestion = Some(ai_suggestion);
            }
        }
    }
    Ok(entry)
}

fn linked_statement_row(row: SuggestedEntry) -> LinkedStatementRow {
    LinkedStatementRow {
        statement_row_id: row.statement_row_id,
        posted_date: row.posted_date,
        description: row.description,
        source_account: row.source_account,
        source_amount: row.source_amount,
        source_file_name: row.source_file_name,
        import_fingerprint: row.import_fingerprint,
    }
}

fn load_pending_suggested_entry(
    connection: &Connection,
    statement_row_id: &str,
) -> Result<SuggestedEntry, WorkspaceError> {
    connection
        .query_row(
            "
            select id, posted_date, description, source_account, source_amount, source_file_name, import_fingerprint, pending_at_import
            from statement_rows
            where id = ?1 and status = 'pending'
            ",
            [statement_row_id],
            |row| {
                Ok(SuggestedEntry {
                    kind: SuggestedEntryKind::Standard,
                    statement_row_id: row.get(0)?,
                    posted_date: row.get(1)?,
                    description: row.get(2)?,
                    source_account: row.get(3)?,
                    source_amount: row.get(4)?,
                    source_file_name: row.get(5)?,
                    import_fingerprint: row.get(6)?,
                    pending_at_import: row.get::<_, i64>(7)? != 0,
                    linked_statement_row: None,
                    suggested_ledger_account: None,
                    categorization_rule_id: None,
                    ai_suggestion: None,
                })
            },
        )
        .map_err(|_| {
            WorkspaceError::new(
                WorkspaceErrorCode::InvalidLedger,
                "Suggested Entry is no longer pending.",
            )
        })
}

fn open_ledger_account_if_missing(root: &Path, ledger_account: &str) -> Result<(), WorkspaceError> {
    let accounts_path = root.join("accounts.bean");
    let accounts = fs::read_to_string(&accounts_path)?;
    if accounts
        .lines()
        .any(|line| line.split_whitespace().nth(2) == Some(ledger_account))
    {
        return Ok(());
    }
    let manifest: WorkspaceManifest = serde_json::from_str(&fs::read_to_string(
        root.join(".diurnum").join("workspace.json"),
    )?)
    .map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::MissingManifest,
            "Workspace manifest is unreadable.",
        )
    })?;
    let today = Utc::now().date_naive().to_string();
    atomic_append(
        accounts_path,
        &format!(
            "{today} open {ledger_account} {}\n",
            manifest.business.base_currency
        ),
    )
}

fn ensure_force_standard_column(connection: &Connection) -> Result<(), WorkspaceError> {
    let columns = connection
        .prepare("pragma table_info(statement_rows)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|col| col == "force_standard") {
        connection.execute(
            "alter table statement_rows add column force_standard integer not null default 0",
            [],
        )?;
    }
    Ok(())
}

fn load_force_standard_ids(connection: &Connection) -> Result<HashSet<String>, WorkspaceError> {
    let mut stmt = connection
        .prepare("select id from statement_rows where status = 'pending' and force_standard = 1")?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<HashSet<_>, _>>()?;
    Ok(ids)
}

impl AiSuggestionRow for SuggestedEntry {
    fn posted_date(&self) -> &str {
        &self.posted_date
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn source_account(&self) -> &str {
        &self.source_account
    }

    fn source_amount(&self) -> &str {
        &self.source_amount
    }

    fn source_file_name(&self) -> &str {
        &self.source_file_name
    }

    fn import_fingerprint(&self) -> &str {
        &self.import_fingerprint
    }
}

fn parse_amount(value: &str) -> Result<f64, WorkspaceError> {
    value.parse::<f64>().map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Suggested Entry amount must be numeric.",
        )
    })
}

fn ensure_transfer_match(
    first: &SuggestedEntry,
    second: &SuggestedEntry,
) -> Result<(), WorkspaceError> {
    if is_transfer_match(first, second) {
        return Ok(());
    }
    Err(WorkspaceError::new(
        WorkspaceErrorCode::InvalidLedger,
        "Transfer approval requires two opposite Statement Rows from different Source Accounts.",
    ))
}

fn is_transfer_match(first: &SuggestedEntry, second: &SuggestedEntry) -> bool {
    if first.source_account == second.source_account || first.posted_date != second.posted_date {
        return false;
    }
    let Ok(first_amount) = parse_amount(&first.source_amount) else {
        return false;
    };
    let Ok(second_amount) = parse_amount(&second.source_amount) else {
        return false;
    };
    (first_amount + second_amount).abs() < 0.005
}

fn looks_like_one_sided_transfer(row: &SuggestedEntry) -> bool {
    let description = row.description.to_lowercase();
    description.contains("transfer") || description.contains("payment")
}

fn monthly_transaction_file(posted_date: &str) -> Result<String, WorkspaceError> {
    if posted_date.len() < 7 {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Suggested Entry posted date must be ISO formatted.",
        ));
    }
    Ok(format!("transactions/{}.bean", &posted_date[..7]))
}

fn ensure_main_includes(root: &Path, monthly_relative_path: &str) -> Result<(), WorkspaceError> {
    let main_path = root.join("main.bean");
    let include = format!("include \"{monthly_relative_path}\"");
    let main = fs::read_to_string(&main_path)?;
    if main.contains(&include) {
        return Ok(());
    }
    atomic_append(main_path, &format!("{include}\n"))
}

fn append_approved_entry(
    monthly_path: &Path,
    suggested_entry: &SuggestedEntry,
    ledger_account: &str,
    balancing_amount: f64,
    diurnum_entry_id: &str,
    pending_at_import: bool,
) -> Result<(), WorkspaceError> {
    let pending_metadata = if pending_at_import {
        "  pending_at_import: TRUE\n"
    } else {
        ""
    };
    let mut entry = format!(
        "\n{} * \"{}\"\n  diurnum_entry_id: \"{}\"\n  import_fingerprint: \"{}\"\n  source_account: \"{}\"\n  source_file_name: \"{}\"\n",
        suggested_entry.posted_date,
        suggested_entry.description,
        diurnum_entry_id,
        suggested_entry.import_fingerprint,
        suggested_entry.source_account,
        suggested_entry.source_file_name,
    );
    entry.push_str(pending_metadata);
    entry.push_str(&format!(
        "  {}  {} USD\n",
        suggested_entry.source_account, suggested_entry.source_amount
    ));
    entry.push_str(&format!(
        "  {}  {:.2} USD\n",
        ledger_account, balancing_amount
    ));
    atomic_append(monthly_path, &entry)
}

fn append_transfer_entry(
    monthly_path: &Path,
    first: &SuggestedEntry,
    second: &SuggestedEntry,
    diurnum_entry_id: &str,
    pending_at_import: bool,
) -> Result<(), WorkspaceError> {
    let pending_metadata = if pending_at_import {
        "  pending_at_import: TRUE\n"
    } else {
        ""
    };
    let mut entry = format!(
        "\n{} * \"Transfer: {} / {}\"\n  diurnum_entry_id: \"{}\"\n  import_fingerprint: \"{}\"\n  source_account: \"{}\"\n  source_file_name: \"{}\"\n  linked_import_fingerprint: \"{}\"\n  linked_source_account: \"{}\"\n  linked_source_file_name: \"{}\"\n",
        first.posted_date,
        first.description,
        second.description,
        diurnum_entry_id,
        first.import_fingerprint,
        first.source_account,
        first.source_file_name,
        second.import_fingerprint,
        second.source_account,
        second.source_file_name,
    );
    entry.push_str(pending_metadata);
    entry.push_str(&format!(
        "  {}  {} USD\n",
        first.source_account, first.source_amount
    ));
    entry.push_str(&format!(
        "  {}  {} USD\n",
        second.source_account, second.source_amount
    ));
    atomic_append(monthly_path, &entry)
}

fn ensure_provenance_columns(connection: &Connection) -> Result<(), WorkspaceError> {
    let columns = connection
        .prepare("pragma table_info(statement_rows)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|column| column == "diurnum_entry_id") {
        connection.execute(
            "alter table statement_rows add column diurnum_entry_id text",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "ledger_entry_file") {
        connection.execute(
            "alter table statement_rows add column ledger_entry_file text",
            [],
        )?;
    }
    if !columns.iter().any(|column| column == "pending_at_import") {
        connection.execute(
            "alter table statement_rows add column pending_at_import integer not null default 0",
            [],
        )?;
    }
    Ok(())
}

fn pending_at_import(
    connection: &Connection,
    statement_row_id: &str,
) -> Result<bool, WorkspaceError> {
    let value: i64 = connection
        .query_row(
            "select pending_at_import from statement_rows where id = ?1",
            [statement_row_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(value != 0)
}

#[derive(Debug)]
struct AccountedStatementRow {
    statement_row_id: String,
    source_account: String,
    source_file_name: String,
    import_fingerprint: String,
    diurnum_entry_id: Option<String>,
    ledger_entry_file: Option<String>,
}

fn load_accounted_rows(
    connection: &Connection,
) -> Result<Vec<AccountedStatementRow>, WorkspaceError> {
    let mut statement = connection.prepare(
        "
        select id, source_account, source_file_name, import_fingerprint, diurnum_entry_id, ledger_entry_file
        from statement_rows
        where status = 'accounted'
        order by posted_date, description
        ",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok(AccountedStatementRow {
                statement_row_id: row.get(0)?,
                source_account: row.get(1)?,
                source_file_name: row.get(2)?,
                import_fingerprint: row.get(3)?,
                diurnum_entry_id: row.get(4)?,
                ledger_entry_file: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn entry_has_matching_metadata(
    contents: &str,
    diurnum_entry_id: &str,
    row: &AccountedStatementRow,
) -> bool {
    let Some(entry) = ledger_entry_block(contents, diurnum_entry_id) else {
        return false;
    };

    entry.contains(&format!("  diurnum_entry_id: \"{diurnum_entry_id}\""))
        && (entry.contains(&format!(
            "  import_fingerprint: \"{}\"",
            row.import_fingerprint
        )) || entry.contains(&format!(
            "  linked_import_fingerprint: \"{}\"",
            row.import_fingerprint
        )))
        && (entry.contains(&format!("  source_account: \"{}\"", row.source_account))
            || entry.contains(&format!(
                "  linked_source_account: \"{}\"",
                row.source_account
            )))
        && (entry.contains(&format!("  source_file_name: \"{}\"", row.source_file_name))
            || entry.contains(&format!(
                "  linked_source_file_name: \"{}\"",
                row.source_file_name
            )))
}

fn ledger_entry_block<'a>(contents: &'a str, diurnum_entry_id: &str) -> Option<&'a str> {
    let needle = format!("diurnum_entry_id: \"{diurnum_entry_id}\"");
    let match_index = contents.find(&needle)?;
    let before = &contents[..match_index];
    let start = before.rfind("\n\n").map(|index| index + 2).unwrap_or(0);
    let after = &contents[match_index..];
    let end = after
        .find("\n\n")
        .map(|index| match_index + index)
        .unwrap_or(contents.len());
    Some(&contents[start..end])
}

#[cfg(test)]
mod tests {
    use crate::workspace::ai_adapter::{configure_ai_adapter, ConfigureAiAdapterInput};
    use crate::workspace::approval::{
        approve_suggested_entry, approve_transfer_entry, get_broken_provenance,
        get_suggested_entries, ApproveSuggestedEntryInput, ApproveTransferEntryInput,
        SuggestedEntryKind,
    };
    use crate::workspace::categorization_rules::{
        create_categorization_rule, CreateCategorizationRuleInput,
    };
    use crate::workspace::create::create_workspace;
    use crate::workspace::data_integrity::{list_snapshots, SnapshotReason};
    use crate::workspace::imports::{import_statement_rows, CsvImportInput, CsvSourceMappingInput};
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::{CreateWorkspaceInput, LedgerStatus};
    use rusqlite::Connection;
    use std::fs;
    use std::path::Path;

    #[test]
    fn approves_non_transfer_suggested_entry_into_monthly_transaction_file() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-04,Software,-29.99\n".to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();

        let suggested_entries = get_suggested_entries(&created.root_path).unwrap();
        assert_eq!(suggested_entries.len(), 1);
        assert_eq!(suggested_entries[0].kind, SuggestedEntryKind::Standard);
        assert_eq!(
            suggested_entries[0].source_account,
            "Assets:Bank:Operating-Checking"
        );
        assert_eq!(suggested_entries[0].source_amount, "-29.99");

        let summary = approve_suggested_entry(ApproveSuggestedEntryInput {
            workspace_root_path: created.root_path.clone(),
            statement_row_id: suggested_entries[0].statement_row_id.clone(),
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap();

        assert_eq!(summary.ledger_status, LedgerStatus::Valid);

        let monthly_file = Path::new(&created.root_path).join("transactions/2026-01.bean");
        let contents = fs::read_to_string(monthly_file).unwrap();
        assert!(contents.contains("2026-01-04 * \"Software\""));
        assert!(contents.contains("  diurnum_entry_id: \""));
        assert!(contents.contains("  import_fingerprint: \""));
        assert!(contents.contains("  source_account: \"Assets:Bank:Operating-Checking\""));
        assert!(contents.contains("  source_file_name: \"checking.csv\""));
        assert!(contents.contains("Assets:Bank:Operating-Checking  -29.99 USD"));
        assert!(contents.contains("Expenses:Software  29.99 USD"));

        let connection = Connection::open(
            Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();
        let status: String = connection
            .query_row("select status from statement_rows", [], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "accounted");
        let diurnum_entry_id: String = connection
            .query_row("select diurnum_entry_id from statement_rows", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(!diurnum_entry_id.is_empty());
        let ledger_entry_file: String = connection
            .query_row("select ledger_entry_file from statement_rows", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(ledger_entry_file, "transactions/2026-01.bean");
        assert!(get_broken_provenance(&created.root_path)
            .unwrap()
            .is_empty());

        let approval_snapshot = list_snapshots(&created.root_path)
            .unwrap()
            .into_iter()
            .find(|snapshot| snapshot.reason == SnapshotReason::Approval)
            .expect("Approval should create a Snapshot");
        assert!(approval_snapshot
            .affected_files
            .iter()
            .any(|file| file == "main.bean"));
        assert!(approval_snapshot
            .affected_files
            .iter()
            .any(|file| file == "accounts.bean"));
    }

    #[test]
    fn suggests_and_approves_transfer_match_between_source_accounts() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::CreditCard,
            name: "Business Card".to_string(),
            opening_balance: None,
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-07,Credit card payment,-100.00\n"
                .to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Liabilities:CreditCards:Business-Card".to_string(),
            source_file_name: "card.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-07,Payment received,100.00\n"
                .to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();

        let suggested_entries = get_suggested_entries(&created.root_path).unwrap();
        assert_eq!(suggested_entries.len(), 1);
        assert_eq!(suggested_entries[0].kind, SuggestedEntryKind::Transfer);
        let linked = suggested_entries[0].linked_statement_row.as_ref().unwrap();
        assert_eq!(
            linked.source_account,
            "Liabilities:CreditCards:Business-Card"
        );

        let summary = approve_transfer_entry(ApproveTransferEntryInput {
            workspace_root_path: created.root_path.clone(),
            statement_row_id: suggested_entries[0].statement_row_id.clone(),
            linked_statement_row_id: linked.statement_row_id.clone(),
        })
        .unwrap();

        assert_eq!(summary.ledger_status, LedgerStatus::Valid);
        let contents =
            fs::read_to_string(Path::new(&created.root_path).join("transactions/2026-01.bean"))
                .unwrap();
        assert!(contents.contains("Transfer: Credit card payment / Payment received"));
        assert!(contents.contains("Assets:Bank:Operating-Checking  -100.00 USD"));
        assert!(contents.contains("Liabilities:CreditCards:Business-Card  100.00 USD"));
        assert!(contents.contains("linked_import_fingerprint"));
        assert!(contents.contains("linked_source_account"));

        let connection = Connection::open(
            Path::new(&created.root_path)
                .join(".diurnum")
                .join("diurnum.sqlite"),
        )
        .unwrap();
        let accounted_count: i64 = connection
            .query_row(
                "select count(*) from statement_rows where status = 'accounted'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(accounted_count, 2);
        assert!(get_broken_provenance(&created.root_path)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn shows_one_sided_transfer_without_claiming_another_row() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-07,Transfer to savings,-100.00\n"
                .to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();

        let suggested_entries = get_suggested_entries(&created.root_path).unwrap();
        assert_eq!(suggested_entries.len(), 1);
        assert_eq!(suggested_entries[0].kind, SuggestedEntryKind::Transfer);
        assert!(suggested_entries[0].linked_statement_row.is_none());
    }

    #[test]
    fn applies_confirmed_categorization_rules_to_future_suggested_entries() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        let rule = create_categorization_rule(CreateCategorizationRuleInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            match_text: "Software".to_string(),
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-04,Software renewal,-29.99\n"
                .to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();

        let suggested_entries = get_suggested_entries(&created.root_path).unwrap();
        assert_eq!(suggested_entries.len(), 1);
        assert_eq!(
            suggested_entries[0].suggested_ledger_account.as_deref(),
            Some("Expenses:Software")
        );
        assert_eq!(
            suggested_entries[0].categorization_rule_id.as_deref(),
            Some(rule.id.as_str())
        );
    }

    #[test]
    fn applies_configured_ai_adapter_suggestions_to_future_suggested_entries() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        let adapter_path = tempdir.path().join("adapter.sh");
        fs::write(
            &adapter_path,
            "#!/bin/sh\ncat >/dev/null\nprintf '%s' '{\"ledgerAccount\":\"Expenses:Software\",\"payee\":\"Vendor\",\"narration\":\"Software\",\"confidence\":0.91,\"explanation\":\"Matched software vendor.\",\"needsHumanAttention\":false}'\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&adapter_path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&adapter_path, permissions).unwrap();
        }
        configure_ai_adapter(ConfigureAiAdapterInput {
            workspace_root_path: created.root_path.clone(),
            command: Some(adapter_path.to_string_lossy().to_string()),
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-04,Software renewal,-29.99\n"
                .to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();

        let suggested_entries = get_suggested_entries(&created.root_path).unwrap();

        assert_eq!(
            suggested_entries[0].suggested_ledger_account.as_deref(),
            Some("Expenses:Software")
        );
        assert_eq!(
            suggested_entries[0]
                .ai_suggestion
                .as_ref()
                .and_then(|suggestion| suggestion.explanation.as_deref()),
            Some("Matched software vendor.")
        );
    }

    #[test]
    fn opens_empty_review_and_provenance_views_before_first_import() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        assert!(get_suggested_entries(&created.root_path)
            .unwrap()
            .is_empty());
        assert!(get_broken_provenance(&created.root_path)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn surfaces_broken_provenance_without_invalidating_the_ledger() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-04,Software,-29.99\n".to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();
        let suggested_entries = get_suggested_entries(&created.root_path).unwrap();
        approve_suggested_entry(ApproveSuggestedEntryInput {
            workspace_root_path: created.root_path.clone(),
            statement_row_id: suggested_entries[0].statement_row_id.clone(),
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap();

        let monthly_file = Path::new(&created.root_path).join("transactions/2026-01.bean");
        let contents = fs::read_to_string(&monthly_file).unwrap();
        fs::write(
            &monthly_file,
            contents.replace(
                "  import_fingerprint: \"",
                "  changed_import_fingerprint: \"",
            ),
        )
        .unwrap();

        let reopened = crate::workspace::open::open_workspace(&created.root_path).unwrap();
        assert_eq!(reopened.ledger_status, LedgerStatus::Valid);
        let broken = get_broken_provenance(&created.root_path).unwrap();
        assert_eq!(broken.len(), 1);
        assert_eq!(
            broken[0].statement_row_id,
            suggested_entries[0].statement_row_id
        );
        assert!(broken[0].reason.contains("missing or changed"));
    }

    #[test]
    fn blocks_approval_during_invalid_ledger_state() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        import_statement_rows(CsvImportInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: "Date,Description,Amount\n2026-01-04,Software,-29.99\n".to_string(),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
                transaction_type_column: None,
                debit_type_value: None,
            }),
        })
        .unwrap();
        let suggested_entries = get_suggested_entries(&created.root_path).unwrap();
        fs::write(
            Path::new(&created.root_path).join("accounts.bean"),
            "not valid ledger content\n",
        )
        .unwrap();

        let error = approve_suggested_entry(ApproveSuggestedEntryInput {
            workspace_root_path: created.root_path,
            statement_row_id: suggested_entries[0].statement_row_id.clone(),
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap_err();

        assert_eq!(
            error.code,
            crate::workspace::WorkspaceErrorCode::InvalidLedger
        );
    }
}
