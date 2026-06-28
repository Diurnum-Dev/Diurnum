use crate::workspace::data_integrity::atomic_write;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::imports::ensure_import_tables;
use crate::workspace::types::{LedgerEditorSession, LedgerEditorTabSession, WorkspaceManifest};
use crate::workspace::{ai_adapter, categorization_rules};
use chrono::{NaiveDate, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadLedgerFileInput {
    pub workspace_root_path: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLedgerEditorSessionInput {
    pub workspace_root_path: String,
    pub session: LedgerEditorSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerFileSnapshot {
    pub relative_path: String,
    pub contents: String,
    pub modified_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEditorState {
    pub files: Vec<String>,
    pub session: LedgerEditorSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictiveEntryCompletionInput {
    pub workspace_root_path: String,
    pub line_prefix: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountContextHintsInput {
    pub workspace_root_path: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictiveEntryCompletion {
    pub insert_text: String,
    pub source: PredictiveEntryCompletionSource,
    pub ledger_account: Option<String>,
    pub source_account: Option<String>,
    pub source_amount: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PredictiveEntryCompletionSource {
    Rule,
    History,
    AiAdapter,
}

pub fn get_ledger_editor_state(
    root: impl AsRef<Path>,
) -> Result<LedgerEditorState, WorkspaceError> {
    let root = root.as_ref();
    let manifest = read_manifest(root)?;
    let files = ledger_files(root)?;
    let session = sanitize_session(manifest.editor_session, &files);

    Ok(LedgerEditorState { files, session })
}

pub fn read_ledger_file(input: ReadLedgerFileInput) -> Result<LedgerFileSnapshot, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let path = ledger_file_path(root, &input.relative_path)?;
    let contents = fs::read_to_string(&path)?;

    Ok(LedgerFileSnapshot {
        relative_path: input.relative_path,
        contents,
        modified_at: file_modified_at(&path)?,
    })
}

pub fn save_ledger_editor_session(
    input: SaveLedgerEditorSessionInput,
) -> Result<LedgerEditorSession, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let mut manifest = read_manifest(root)?;
    let files = ledger_files(root)?;
    let session = sanitize_session(Some(input.session), &files);
    manifest.updated_at = Utc::now().to_rfc3339();
    manifest.editor_session = Some(session.clone());
    write_manifest(root, &manifest)?;

    Ok(session)
}

pub fn get_predictive_entry_completion(
    input: PredictiveEntryCompletionInput,
) -> Result<Option<PredictiveEntryCompletion>, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let Some(trigger) = parse_completion_trigger(&input.line_prefix) else {
        return Ok(None);
    };
    let connection = open_connection(root)?;
    let accounts = read_chart_of_accounts(root)?;
    let account_set = accounts.iter().cloned().collect::<HashSet<_>>();

    if let Some(completion) = completion_from_rule(&connection, &account_set, &trigger)? {
        return Ok(Some(completion));
    }
    if let Some(completion) = completion_from_history(root, &connection, &account_set, &trigger)? {
        return Ok(Some(completion));
    }
    completion_from_ai(root, &connection, &account_set, &trigger)
}

fn sanitize_session(session: Option<LedgerEditorSession>, files: &[String]) -> LedgerEditorSession {
    let fallback = "main.bean".to_string();
    let file_exists = |path: &String| files.iter().any(|file| file == path);
    let mut open_tabs = session
        .as_ref()
        .map(|session| session.open_tabs.clone())
        .unwrap_or_default()
        .into_iter()
        .filter(|tab| file_exists(&tab.relative_path))
        .collect::<Vec<_>>();

    if open_tabs.is_empty() {
        open_tabs.push(LedgerEditorTabSession {
            relative_path: fallback.clone(),
            cursor: 0,
            scroll_top: 0,
        });
    }

    let active_tab = session
        .as_ref()
        .map(|session| session.active_tab.clone())
        .filter(file_exists)
        .unwrap_or_else(|| open_tabs[0].relative_path.clone());

    let recently_closed_tabs = session
        .map(|session| session.recently_closed_tabs)
        .unwrap_or_default()
        .into_iter()
        .filter(|tab| file_exists(&tab.relative_path))
        .collect();

    LedgerEditorSession {
        open_tabs,
        active_tab,
        recently_closed_tabs,
    }
}

fn ledger_files(root: &Path) -> Result<Vec<String>, WorkspaceError> {
    let mut files = Vec::new();
    collect_ledger_files(root, root, &mut files)?;
    files.sort();
    Ok(files)
}

fn collect_ledger_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<String>,
) -> Result<(), WorkspaceError> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if path == root.join(".diurnum") || path == root.join(".ledgerly") {
                continue;
            }
            collect_ledger_files(root, &path, files)?;
        } else if path.extension().and_then(|extension| extension.to_str()) == Some("bean") {
            files.push(
                path.strip_prefix(root)
                    .map_err(|error| WorkspaceError::io(error.to_string()))?
                    .to_string_lossy()
                    .to_string(),
            );
        }
    }
    Ok(())
}

fn ledger_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, WorkspaceError> {
    let path = workspace_relative_path(root, relative_path)?;
    if path.extension().and_then(|extension| extension.to_str()) != Some("bean") {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Ledger Editor can only open .bean files.",
        ));
    }
    Ok(path)
}

fn read_manifest(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    let manifest_path = root.join(".diurnum").join("workspace.json");
    serde_json::from_str(&fs::read_to_string(manifest_path)?).map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::MissingManifest,
            "Workspace manifest is unreadable.",
        )
    })
}

fn write_manifest(root: &Path, manifest: &WorkspaceManifest) -> Result<(), WorkspaceError> {
    let contents = serde_json::to_string_pretty(manifest)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;
    atomic_write(root.join(".diurnum").join("workspace.json"), &contents)
}

fn workspace_relative_path(root: &Path, relative_path: &str) -> Result<PathBuf, WorkspaceError> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Workspace path escapes the Workspace root.",
        ));
    }
    Ok(root.join(path))
}

fn open_connection(root: &Path) -> Result<Connection, WorkspaceError> {
    Ok(Connection::open(
        root.join(".diurnum").join("diurnum.sqlite"),
    )?)
}

fn read_chart_of_accounts(root: &Path) -> Result<Vec<String>, WorkspaceError> {
    let accounts = fs::read_to_string(root.join("accounts.bean"))?;
    Ok(accounts
        .lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() == 4 && parts[1] == "open" {
                Some(parts[2].to_string())
            } else {
                None
            }
        })
        .collect())
}

pub fn get_account_context_hints(
    workspace_root_path: impl AsRef<Path>,
    description: &str,
) -> Result<Vec<String>, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let connection = open_connection(root)?;
    let accounts = read_chart_of_accounts(root)?;
    let account_set: HashSet<String> = accounts.into_iter().collect();
    let mut hints: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // Rule-based hints (highest priority)
    let rules = categorization_rules::list_categorization_rules_from_connection(&connection)?;
    for rule in &rules {
        if rule.enabled
            && account_set.contains(&rule.ledger_account)
            && rule_matches(&rule.match_text, description)
            && seen.insert(rule.ledger_account.clone())
        {
            hints.push(rule.ledger_account.clone());
        }
    }

    // History-based hints
    if let Ok(entries) = load_history_entries(root, &connection) {
        for entry in entries {
            if account_set.contains(&entry.ledger_account)
                && history_matches(&entry.description, description)
                && seen.insert(entry.ledger_account.clone())
            {
                hints.push(entry.ledger_account.clone());
            }
        }
    }

    Ok(hints)
}

fn file_modified_at(path: &Path) -> Result<u64, WorkspaceError> {
    let modified = fs::metadata(path)?.modified()?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;
    Ok(duration.as_millis() as u64)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CompletionTrigger {
    date: String,
    line_prefix: String,
    description_prefix: String,
}

fn parse_completion_trigger(line_prefix: &str) -> Option<CompletionTrigger> {
    if !line_prefix.starts_with(|character: char| character.is_ascii_digit()) {
        return None;
    }
    let (date, rest) = line_prefix.split_once(' ')?;
    if date.len() != 10 || NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
        return None;
    }
    let description_prefix = description_prefix(rest)?;
    Some(CompletionTrigger {
        date: date.to_string(),
        line_prefix: line_prefix.to_string(),
        description_prefix,
    })
}

fn description_prefix(rest: &str) -> Option<String> {
    if rest.is_empty() {
        return Some(String::new());
    }
    let rest = rest.strip_prefix('*')?.trim_start();
    let rest = rest.strip_prefix('"').unwrap_or(rest);
    Some(rest.to_string())
}

fn completion_from_rule(
    connection: &Connection,
    account_set: &HashSet<String>,
    trigger: &CompletionTrigger,
) -> Result<Option<PredictiveEntryCompletion>, WorkspaceError> {
    if trigger.description_prefix.trim().is_empty() {
        return Ok(None);
    }
    let rules = categorization_rules::list_categorization_rules_from_connection(connection)?;
    let Some(rule) = rules.into_iter().find(|rule| {
        account_set.contains(&rule.source_account)
            && account_set.contains(&rule.ledger_account)
            && rule_matches(&rule.match_text, &trigger.description_prefix)
    }) else {
        return Ok(None);
    };
    let full_text = render_entry_without_amounts(
        &trigger.date,
        &rule.match_text,
        &rule.source_account,
        &rule.ledger_account,
    );
    let Some(insert_text) = suffix_for_prefix(&trigger.line_prefix, &full_text) else {
        return Ok(None);
    };
    if insert_text.is_empty() {
        return Ok(None);
    }
    Ok(Some(PredictiveEntryCompletion {
        insert_text,
        source: PredictiveEntryCompletionSource::Rule,
        ledger_account: Some(rule.ledger_account),
        source_account: Some(rule.source_account),
        source_amount: None,
    }))
}

fn rule_matches(match_text: &str, description_prefix: &str) -> bool {
    let match_text = match_text.to_lowercase();
    let description_prefix = description_prefix.to_lowercase();
    match_text.starts_with(&description_prefix) || description_prefix.contains(&match_text)
}

#[derive(Debug)]
struct HistoryEntry {
    description: String,
    source_account: String,
    source_amount: String,
    ledger_account: String,
    ledger_amount: String,
}

fn completion_from_history(
    root: &Path,
    connection: &Connection,
    account_set: &HashSet<String>,
    trigger: &CompletionTrigger,
) -> Result<Option<PredictiveEntryCompletion>, WorkspaceError> {
    let Some(history) = load_history_entries(root, connection)?
        .into_iter()
        .find(|entry| {
            account_set.contains(&entry.source_account)
                && account_set.contains(&entry.ledger_account)
                && history_matches(&entry.description, &trigger.description_prefix)
        })
    else {
        return Ok(None);
    };
    let full_text = render_entry_with_amounts(
        &trigger.date,
        &history.description,
        &history.source_account,
        &history.source_amount,
        &history.ledger_account,
        &history.ledger_amount,
    );
    let Some(insert_text) = suffix_for_prefix(&trigger.line_prefix, &full_text) else {
        return Ok(None);
    };
    if insert_text.is_empty() {
        return Ok(None);
    }
    Ok(Some(PredictiveEntryCompletion {
        insert_text,
        source: PredictiveEntryCompletionSource::History,
        ledger_account: Some(history.ledger_account),
        source_account: Some(history.source_account),
        source_amount: Some(history.source_amount),
    }))
}

fn history_matches(description: &str, description_prefix: &str) -> bool {
    if description_prefix.trim().is_empty() {
        return true;
    }
    description
        .to_lowercase()
        .contains(&description_prefix.to_lowercase())
}

fn load_history_entries(
    root: &Path,
    connection: &Connection,
) -> Result<Vec<HistoryEntry>, WorkspaceError> {
    ensure_import_tables(connection)?;
    let columns = connection
        .prepare("pragma table_info(statement_rows)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|column| column == "diurnum_entry_id")
        || !columns.iter().any(|column| column == "ledger_entry_file")
    {
        return Ok(vec![]);
    }
    let mut statement = connection.prepare(
        "
        select description, source_account, source_amount, diurnum_entry_id, ledger_entry_file
        from statement_rows
        where status = 'accounted'
          and diurnum_entry_id is not null
          and ledger_entry_file is not null
        order by posted_date desc, description
        limit 20
        ",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut entries = Vec::new();
    for (description, source_account, source_amount, entry_id, relative_path) in rows {
        let contents = fs::read_to_string(root.join(relative_path))?;
        let Some(block) = ledger_entry_block(&contents, &entry_id) else {
            continue;
        };
        let Some((ledger_account, ledger_amount)) = ledger_posting(block, &source_account) else {
            continue;
        };
        entries.push(HistoryEntry {
            description,
            source_account,
            source_amount,
            ledger_account,
            ledger_amount,
        });
    }
    Ok(entries)
}

fn completion_from_ai(
    root: &Path,
    connection: &Connection,
    account_set: &HashSet<String>,
    trigger: &CompletionTrigger,
) -> Result<Option<PredictiveEntryCompletion>, WorkspaceError> {
    let row = CompletionAiRow {
        posted_date: trigger.date.clone(),
        description: trigger.description_prefix.clone(),
    };
    let Some(suggestion) = ai_adapter::suggestion_for_row(root, connection, &row)? else {
        return Ok(None);
    };
    let Some(ledger_account) = suggestion.ledger_account else {
        return Ok(None);
    };
    let Some(source_account) = suggestion.source_account else {
        return Ok(None);
    };
    let Some(source_amount) = suggestion.source_amount else {
        return Ok(None);
    };
    if !account_set.contains(&ledger_account) || !account_set.contains(&source_account) {
        return Ok(None);
    }
    let Some(ledger_amount) = opposite_amount(&source_amount) else {
        return Ok(None);
    };
    let description = suggestion
        .narration
        .or(suggestion.payee)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| trigger.description_prefix.clone());
    if description.trim().is_empty() {
        return Ok(None);
    }
    let full_text = render_entry_with_amounts(
        &trigger.date,
        &description,
        &source_account,
        &source_amount,
        &ledger_account,
        &ledger_amount,
    );
    let Some(insert_text) = suffix_for_prefix(&trigger.line_prefix, &full_text) else {
        return Ok(None);
    };
    if insert_text.is_empty() {
        return Ok(None);
    }
    Ok(Some(PredictiveEntryCompletion {
        insert_text,
        source: PredictiveEntryCompletionSource::AiAdapter,
        ledger_account: Some(ledger_account),
        source_account: Some(source_account),
        source_amount: Some(source_amount),
    }))
}

struct CompletionAiRow {
    posted_date: String,
    description: String,
}

impl ai_adapter::AiSuggestionRow for CompletionAiRow {
    fn posted_date(&self) -> &str {
        &self.posted_date
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn source_account(&self) -> &str {
        ""
    }

    fn source_amount(&self) -> &str {
        ""
    }

    fn source_file_name(&self) -> &str {
        "ledger-editor"
    }

    fn import_fingerprint(&self) -> &str {
        "ledger-editor-completion"
    }
}

fn suffix_for_prefix(line_prefix: &str, full_text: &str) -> Option<String> {
    full_text
        .strip_prefix(line_prefix)
        .map(|suffix| suffix.to_string())
}

fn render_entry_without_amounts(
    date: &str,
    description: &str,
    source_account: &str,
    ledger_account: &str,
) -> String {
    format!(
        "{} * \"{}\"\n  {}\n  {}",
        date,
        sanitize_description(description),
        source_account,
        ledger_account
    )
}

fn render_entry_with_amounts(
    date: &str,
    description: &str,
    source_account: &str,
    source_amount: &str,
    ledger_account: &str,
    ledger_amount: &str,
) -> String {
    format!(
        "{} * \"{}\"\n  {}  {} USD\n  {}  {} USD",
        date,
        sanitize_description(description),
        source_account,
        source_amount,
        ledger_account,
        ledger_amount
    )
}

fn sanitize_description(description: &str) -> String {
    description.replace('"', "'").trim().to_string()
}

fn opposite_amount(amount: &str) -> Option<String> {
    let parsed = amount.parse::<f64>().ok()?;
    Some(format!("{:.2}", -parsed))
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

fn ledger_posting(block: &str, source_account: &str) -> Option<(String, String)> {
    block.lines().find_map(|line| {
        let trimmed = line.trim();
        let account = trimmed.split_whitespace().next()?;
        if !is_account_name(account) || account == source_account {
            return None;
        }
        let amount = trimmed[account.len()..]
            .trim()
            .strip_suffix(" USD")
            .unwrap_or(trimmed[account.len()..].trim())
            .to_string();
        Some((account.to_string(), amount))
    })
}

fn is_account_name(value: &str) -> bool {
    matches!(
        value.split(':').next(),
        Some("Assets" | "Liabilities" | "Equity" | "Income" | "Expenses")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::approval::{
        approve_suggested_entry, get_suggested_entries, ApproveSuggestedEntryInput,
    };
    use crate::workspace::categorization_rules::CreateCategorizationRuleInput;
    use crate::workspace::create::create_workspace;
    use crate::workspace::imports::{import_statement_rows, CsvImportInput, CsvSourceMappingInput};
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::CreateWorkspaceInput;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn editor_state_defaults_to_main_bean() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let state = get_ledger_editor_state(created.root_path).unwrap();

        assert!(state.files.contains(&"main.bean".to_string()));
        assert_eq!(state.session.active_tab, "main.bean");
        assert_eq!(state.session.open_tabs[0].relative_path, "main.bean");
    }

    #[test]
    fn saves_editor_session_in_workspace_manifest() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let session = save_ledger_editor_session(SaveLedgerEditorSessionInput {
            workspace_root_path: created.root_path.clone(),
            session: LedgerEditorSession {
                active_tab: "accounts.bean".to_string(),
                open_tabs: vec![LedgerEditorTabSession {
                    relative_path: "accounts.bean".to_string(),
                    cursor: 12,
                    scroll_top: 4,
                }],
                recently_closed_tabs: vec![],
            },
        })
        .unwrap();

        assert_eq!(session.active_tab, "accounts.bean");

        let restored = get_ledger_editor_state(created.root_path).unwrap();
        assert_eq!(restored.session.active_tab, "accounts.bean");
        assert_eq!(restored.session.open_tabs[0].cursor, 12);
    }

    #[test]
    fn predictive_completion_uses_rules_before_history() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = workspace(&tempdir);
        add_checking_account(&created.root_path);
        categorization_rules::create_categorization_rule(CreateCategorizationRuleInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            match_text: "Software".to_string(),
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap();
        approve_history_entry(&created.root_path, "Software", "-29.99", "Expenses:Meals");

        let completion = get_predictive_entry_completion(PredictiveEntryCompletionInput {
            workspace_root_path: created.root_path,
            line_prefix: "2026-05-08 * \"Soft".to_string(),
        })
        .unwrap()
        .unwrap();

        assert_eq!(completion.source, PredictiveEntryCompletionSource::Rule);
        assert_eq!(
            completion.ledger_account.as_deref(),
            Some("Expenses:Software")
        );
        assert!(completion.insert_text.contains("Expenses:Software"));
        assert!(!completion.insert_text.contains("-29.99"));
    }

    #[test]
    fn predictive_completion_uses_approved_history_amounts() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = workspace(&tempdir);
        add_checking_account(&created.root_path);
        approve_history_entry(
            &created.root_path,
            "Software subscription",
            "-29.99",
            "Expenses:Software",
        );

        let completion = get_predictive_entry_completion(PredictiveEntryCompletionInput {
            workspace_root_path: created.root_path,
            line_prefix: "2026-05-08 ".to_string(),
        })
        .unwrap()
        .unwrap();

        assert_eq!(completion.source, PredictiveEntryCompletionSource::History);
        assert_eq!(completion.source_amount.as_deref(), Some("-29.99"));
        assert!(completion.insert_text.contains("Software subscription"));
        assert!(completion
            .insert_text
            .contains("Assets:Bank:Operating-Checking  -29.99 USD"));
        assert!(completion
            .insert_text
            .contains("Expenses:Software  29.99 USD"));
    }

    #[test]
    fn predictive_completion_falls_back_to_adapter() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = workspace(&tempdir);
        add_checking_account(&created.root_path);
        let adapter_path = tempdir.path().join("adapter.sh");
        fs::write(
            &adapter_path,
            "#!/bin/sh\ncat >/dev/null\nprintf '%s' '{\"ledgerAccount\":\"Expenses:Software\",\"sourceAccount\":\"Assets:Bank:Operating-Checking\",\"sourceAmount\":\"-42.00\",\"narration\":\"Adapter SaaS\",\"needsHumanAttention\":false}'\n",
        )
        .unwrap();
        fs::set_permissions(&adapter_path, fs::Permissions::from_mode(0o755)).unwrap();
        ai_adapter::configure_ai_adapter(ai_adapter::ConfigureAiAdapterInput {
            workspace_root_path: created.root_path.clone(),
            command: Some(adapter_path.to_string_lossy().to_string()),
        })
        .unwrap();

        let completion = get_predictive_entry_completion(PredictiveEntryCompletionInput {
            workspace_root_path: created.root_path,
            line_prefix: "2026-05-08 ".to_string(),
        })
        .unwrap()
        .unwrap();

        assert_eq!(
            completion.source,
            PredictiveEntryCompletionSource::AiAdapter
        );
        assert_eq!(completion.source_amount.as_deref(), Some("-42.00"));
        assert!(completion.insert_text.contains("Adapter SaaS"));
        assert!(completion
            .insert_text
            .contains("Expenses:Software  42.00 USD"));
    }

    #[test]
    fn predictive_completion_returns_none_without_a_source() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = workspace(&tempdir);

        let completion = get_predictive_entry_completion(PredictiveEntryCompletionInput {
            workspace_root_path: created.root_path,
            line_prefix: "2026-05-08 ".to_string(),
        })
        .unwrap();

        assert!(completion.is_none());
    }

    fn workspace(tempdir: &tempfile::TempDir) -> crate::workspace::types::WorkspaceSummary {
        create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap()
    }

    fn add_checking_account(root: &str) {
        add_source_account(AddSourceAccountInput {
            workspace_root_path: root.to_string(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
    }

    fn approve_history_entry(root: &str, description: &str, amount: &str, ledger_account: &str) {
        import_statement_rows(CsvImportInput {
            workspace_root_path: root.to_string(),
            source_account: "Assets:Bank:Operating-Checking".to_string(),
            source_file_name: "checking.csv".to_string(),
            csv_contents: format!("Date,Description,Amount\n2026-01-04,{description},{amount}\n"),
            mapping: Some(CsvSourceMappingInput {
                posted_date_column: "Date".to_string(),
                description_column: "Description".to_string(),
                amount_column: Some("Amount".to_string()),
                debit_column: None,
                credit_column: None,
                transaction_type_column: None,
                debit_type_value: None,
                status_column: None,
                check_number_column: None,
                date_format: None,
                memo_column: None,
                reference_id_column: None,
                payee_column: None,
                category_column: None,
            }),
        })
        .unwrap();
        let entry = get_suggested_entries(root).unwrap().remove(0);
        approve_suggested_entry(ApproveSuggestedEntryInput {
            workspace_root_path: root.to_string(),
            statement_row_id: entry.statement_row_id,
            ledger_account: ledger_account.to_string(),
        })
        .unwrap();
    }
}
