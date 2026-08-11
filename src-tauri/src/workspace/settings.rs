use crate::workspace::ai_adapter::{self, AiSuggestion, AiSuggestionRow};
use crate::workspace::data_integrity::atomic_write;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::imports::CsvSourceMappingInput;
use crate::workspace::open::open_workspace;
use crate::workspace::rename_account::{self, RenameAccountInput};
use crate::workspace::source_accounts::{documents_slug_for_account, sanitize_account_segment};
use crate::workspace::types::{WorkspaceBusiness, WorkspaceManifest, WorkspaceSummary};
use crate::workspace::{imports, shell};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkspaceMetadataInput {
    pub workspace_root_path: String,
    pub business_name: String,
    pub books_start_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAccountSummary {
    pub account_name: String,
    pub kind: SourceAccountKind,
    pub status: SourceAccountStatus,
    pub currency: String,
    pub opening_balance: Option<String>,
    pub source_mapping: Option<CsvSourceMappingInput>,
    pub documents_folder: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceAccountKind {
    Bank,
    CreditCard,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceAccountStatus {
    Open,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceMappingSummary {
    pub source_account: String,
    pub mapping: CsvSourceMappingInput,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSourceMappingInput {
    pub workspace_root_path: String,
    pub source_account: String,
    pub mapping: CsvSourceMappingInput,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSourceAccountInput {
    pub workspace_root_path: String,
    pub source_account: String,
    pub new_name: String,
    pub opening_balance: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseSourceAccountInput {
    pub workspace_root_path: String,
    pub source_account: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSourceAccountOpeningBalanceInput {
    pub workspace_root_path: String,
    pub source_account: String,
    pub opening_balance: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentitySummary {
    pub is_repository: bool,
    pub local_name: Option<String>,
    pub local_email: Option<String>,
    pub global_name: Option<String>,
    pub global_email: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGitIdentityInput {
    pub workspace_root_path: String,
    pub local_name: Option<String>,
    pub local_email: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAiAdapter {
    pub name: String,
    pub command: String,
    pub available: bool,
    pub command_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestAiAdapterInput {
    pub workspace_root_path: String,
}

pub fn update_workspace_metadata(
    input: UpdateWorkspaceMetadataInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let business_name = crate::workspace::paths::validate_business_name(&input.business_name)?;
    let books_start_date =
        crate::workspace::paths::validate_books_start_date(&input.books_start_date)?;
    let mut manifest = read_manifest(root)?;
    manifest.business = WorkspaceBusiness {
        name: business_name.clone(),
        base_currency: manifest.business.base_currency,
        books_start_date: books_start_date.clone(),
    };
    manifest.updated_at = Utc::now().to_rfc3339();
    write_manifest(root, &manifest)?;
    update_main_bean_title(root, &business_name)?;
    update_opening_balances_comment(root, &business_name)?;
    update_workspace_metadata_rows(root, &business_name, &books_start_date)?;
    open_workspace(root)
}

pub fn list_source_accounts(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<SourceAccountSummary>, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let manifest = read_manifest(root)?;
    let accounts = fs::read_to_string(root.join(&manifest.layout.accounts_file))?;
    let opening_balances = fs::read_to_string(root.join(&manifest.layout.opening_balances_file))?;
    let sqlite = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    imports::ensure_import_tables(&sqlite)?;
    let mappings = list_source_mappings_from_connection(&sqlite)?;

    let mut summaries = Vec::new();
    for line in accounts.lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 4 {
            continue;
        }
        let directive = parts[1];
        if directive != "open" && directive != "close" {
            continue;
        }
        let account_name = parts[2].to_string();
        if matches!(kind_for_account(&account_name), SourceAccountKind::Other) {
            continue;
        }
        let currency = parts[3].to_string();
        let status = if directive == "open" {
            SourceAccountStatus::Open
        } else {
            SourceAccountStatus::Closed
        };

        summaries.push(SourceAccountSummary {
            kind: kind_for_account(&account_name),
            status,
            account_name: account_name.clone(),
            currency,
            opening_balance: opening_balance_for_account(&opening_balances, &account_name),
            source_mapping: mappings
                .iter()
                .find(|mapping| mapping.source_account == account_name)
                .map(|mapping| mapping.mapping.clone()),
            documents_folder: documents_slug_for_account(&account_name),
        });
    }

    Ok(summaries)
}

pub fn list_source_mappings(
    workspace_root_path: impl AsRef<Path>,
) -> Result<Vec<SourceMappingSummary>, WorkspaceError> {
    let sqlite = Connection::open(
        workspace_root_path
            .as_ref()
            .join(".diurnum")
            .join("diurnum.sqlite"),
    )?;
    imports::ensure_import_tables(&sqlite)?;
    list_source_mappings_from_connection(&sqlite)
}

pub fn save_source_mapping(
    input: UpdateSourceMappingInput,
) -> Result<SourceMappingSummary, WorkspaceError> {
    let sqlite = Connection::open(
        Path::new(&input.workspace_root_path)
            .join(".diurnum")
            .join("diurnum.sqlite"),
    )?;
    imports::ensure_import_tables(&sqlite)?;
    let updated_at = Utc::now().to_rfc3339();
    let mapping_json = serde_json::to_string(&input.mapping)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;
    sqlite.execute(
        "
        insert into source_mappings (source_account, mapping_json, updated_at)
        values (?1, ?2, ?3)
        on conflict(source_account) do update set
          mapping_json = excluded.mapping_json,
          updated_at = excluded.updated_at
        ",
        params![input.source_account, mapping_json, updated_at.clone()],
    )?;
    Ok(SourceMappingSummary {
        source_account: input.source_account,
        mapping: input.mapping,
        updated_at,
    })
}

pub fn rename_source_account(
    input: RenameSourceAccountInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let new_segment = sanitize_account_segment(&input.new_name)?;
    let new_account_name = rename_account_name(&input.source_account, &new_segment)?;
    rename_account::rename_account_with_opening_balance(
        RenameAccountInput {
            workspace_root_path: input.workspace_root_path,
            old_account: input.source_account,
            new_account: new_account_name,
            merge: false,
        },
        input.opening_balance.as_deref(),
    )
}

pub fn close_source_account(
    input: CloseSourceAccountInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let manifest = read_manifest(root)?;
    close_account_in_accounts_file(root, &manifest, &input.source_account)?;
    open_workspace(root)
}

pub fn update_source_account_opening_balance(
    input: UpdateSourceAccountOpeningBalanceInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let manifest = read_manifest(root)?;
    rewrite_opening_balances_file(
        root,
        &manifest,
        &input.source_account,
        &input.source_account,
        input.opening_balance.as_deref(),
    )?;
    open_workspace(root)
}

pub fn get_git_identity(
    workspace_root_path: impl AsRef<Path>,
) -> Result<GitIdentitySummary, WorkspaceError> {
    let root = workspace_root_path.as_ref();
    let is_repository = shell::get_workspace_git_status(root)?.is_repository;
    if !is_repository {
        return Ok(GitIdentitySummary {
            is_repository: false,
            local_name: None,
            local_email: None,
            global_name: git_config_value(None, "user.name")?,
            global_email: git_config_value(None, "user.email")?,
            warning: None,
        });
    }

    let local_name = git_config_value(Some(root), "user.name")?;
    let local_email = git_config_value(Some(root), "user.email")?;
    let global_name = git_config_value(None, "user.name")?;
    let global_email = git_config_value(None, "user.email")?;
    let warning = if local_name.is_none()
        && local_email.is_none()
        && global_name.is_none()
        && global_email.is_none()
    {
        Some("No git identity is configured locally or globally.".to_string())
    } else {
        None
    };

    Ok(GitIdentitySummary {
        is_repository: true,
        local_name,
        local_email,
        global_name,
        global_email,
        warning,
    })
}

pub fn update_git_identity(
    input: UpdateGitIdentityInput,
) -> Result<GitIdentitySummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    if !shell::get_workspace_git_status(root)?.is_repository {
        return get_git_identity(root);
    }

    set_git_config_value(root, "user.name", input.local_name.as_deref())?;
    set_git_config_value(root, "user.email", input.local_email.as_deref())?;
    get_git_identity(root)
}

pub fn detect_ai_adapters() -> Result<Vec<DetectedAiAdapter>, WorkspaceError> {
    // The persisted command is invoked non-interactively: Diurnum pipes the
    // curated context on stdin and expects suggestion JSON on stdout, so each
    // adapter must use its print-and-exit mode (a bare binary name launches an
    // interactive session that never exits).
    let adapters = [
        ("Claude Code CLI", "claude", "claude --print"),
        ("OpenAI Codex CLI", "codex", "codex exec"),
        ("OpenCode", "opencode", "opencode run"),
    ];

    adapters
        .into_iter()
        .map(|(name, program, command)| {
            let command_path = which(program);
            Ok(DetectedAiAdapter {
                name: name.to_string(),
                command: command.to_string(),
                available: command_path.is_some(),
                command_path,
            })
        })
        .collect()
}

pub fn test_ai_adapter(input: TestAiAdapterInput) -> Result<Option<AiSuggestion>, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let connection = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    imports::ensure_import_tables(&connection)?;
    ai_adapter::ensure_ai_adapter_table(&connection)?;
    let row = TestAiRow;
    ai_adapter::suggestion_for_row(root, &connection, &row)
}

pub fn list_source_mappings_from_connection(
    connection: &Connection,
) -> Result<Vec<SourceMappingSummary>, WorkspaceError> {
    imports::ensure_import_tables(connection)?;
    let mut statement = connection.prepare(
        "
        select source_account, mapping_json, updated_at
        from source_mappings
        order by source_account
        ",
    )?;
    let rows = statement
        .query_map([], |row| {
            let mapping_json: String = row.get(1)?;
            let mapping =
                serde_json::from_str::<CsvSourceMappingInput>(&mapping_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
            Ok(SourceMappingSummary {
                source_account: row.get(0)?,
                mapping,
                updated_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn read_manifest(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    serde_json::from_str(&fs::read_to_string(
        root.join(".diurnum").join("workspace.json"),
    )?)
    .map_err(|error| WorkspaceError::io(error.to_string()))
}

fn write_manifest(root: &Path, manifest: &WorkspaceManifest) -> Result<(), WorkspaceError> {
    let contents = serde_json::to_string_pretty(manifest)
        .map_err(|error| WorkspaceError::io(error.to_string()))?;
    atomic_write(root.join(".diurnum").join("workspace.json"), &contents)
}

fn update_main_bean_title(root: &Path, business_name: &str) -> Result<(), WorkspaceError> {
    let path = root.join("main.bean");
    let contents = fs::read_to_string(&path)?;
    let mut output = String::new();
    for line in contents.lines() {
        if let Some(title) = line.strip_prefix("option \"title\" \"") {
            if title.ends_with('"') {
                output.push_str(&format!("option \"title\" \"{business_name}\""));
                output.push('\n');
                continue;
            }
        }
        output.push_str(line);
        output.push('\n');
    }
    atomic_write(path, &output)
}

fn update_opening_balances_comment(root: &Path, business_name: &str) -> Result<(), WorkspaceError> {
    let path = root.join("opening-balances.bean");
    let contents = fs::read_to_string(&path)?;
    let mut lines = contents.lines();
    let first = lines.next().unwrap_or("");
    let second = lines.next().unwrap_or("");
    let mut output = String::new();
    if first.starts_with("; Opening balances for ") {
        output.push_str(&format!("; Opening balances for {business_name}.\n"));
    } else {
        output.push_str(first);
        output.push('\n');
    }
    if second.starts_with("; Diurnum starts balances at zero.") {
        output.push_str(second);
        output.push('\n');
    }
    for line in lines {
        output.push_str(line);
        output.push('\n');
    }
    atomic_write(path, &output)
}

fn update_workspace_metadata_rows(
    root: &Path,
    business_name: &str,
    books_start_date: &str,
) -> Result<(), WorkspaceError> {
    let connection = Connection::open(root.join(".diurnum").join("diurnum.sqlite"))?;
    connection.execute(
        "update workspace_metadata set value = ?1 where key = 'business_name'",
        [business_name],
    )?;
    connection.execute(
        "update workspace_metadata set value = ?1 where key = 'books_start_date'",
        [books_start_date],
    )?;
    Ok(())
}

fn opening_balance_for_account(contents: &str, account_name: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() >= 5 && parts[1] == "balance" && parts[2] == account_name {
            Some(parts[3].to_string())
        } else {
            None
        }
    })
}

fn close_account_in_accounts_file(
    root: &Path,
    manifest: &WorkspaceManifest,
    source_account: &str,
) -> Result<(), WorkspaceError> {
    let path = root.join(&manifest.layout.accounts_file);
    let contents = fs::read_to_string(&path)?;
    let mut rewritten = Vec::new();
    let mut found = false;

    for line in contents.lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() >= 4 && parts[1] == "open" && parts[2] == source_account {
            rewritten.push(format!(
                "{} close {} {}",
                Utc::now().date_naive(),
                source_account,
                parts[3]
            ));
            found = true;
        } else {
            rewritten.push(line.to_string());
        }
    }

    if !found {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Source Account was not found in accounts.bean.",
        ));
    }

    atomic_write(path, &(rewritten.join("\n") + "\n"))
}

fn rewrite_opening_balances_file(
    root: &Path,
    manifest: &WorkspaceManifest,
    source_account: &str,
    new_account_name: &str,
    opening_balance: Option<&str>,
) -> Result<(), WorkspaceError> {
    let path = root.join(&manifest.layout.opening_balances_file);
    let contents = fs::read_to_string(&path)?;
    let mut rewritten = Vec::new();
    let mut changed = false;

    for line in contents.lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() >= 5 && parts[1] == "balance" && parts[2] == source_account {
            changed = true;
            if let Some(opening_balance) = opening_balance {
                rewritten.push(format!(
                    "{} balance {} {} {}",
                    parts[0], new_account_name, opening_balance, parts[4]
                ));
            } else {
                rewritten.push(format!(
                    "{} balance {} {} {}",
                    parts[0], new_account_name, parts[3], parts[4]
                ));
            }
        } else {
            rewritten.push(line.to_string());
        }
    }

    if !changed {
        if let Some(opening_balance) = opening_balance {
            rewritten.push(format!(
                "{} balance {} {} {}",
                manifest.business.books_start_date,
                new_account_name,
                opening_balance,
                manifest.business.base_currency
            ));
        }
    }

    atomic_write(path, &(rewritten.join("\n") + "\n"))
}

fn kind_for_account(account_name: &str) -> SourceAccountKind {
    if account_name.starts_with("Liabilities:CreditCards:") {
        SourceAccountKind::CreditCard
    } else if account_name.starts_with("Assets:Bank:") {
        SourceAccountKind::Bank
    } else {
        SourceAccountKind::Other
    }
}

fn rename_account_name(old: &str, new_segment: &str) -> Result<String, WorkspaceError> {
    if old.starts_with("Assets:Bank:") {
        Ok(format!("Assets:Bank:{new_segment}"))
    } else if old.starts_with("Liabilities:CreditCards:") {
        Ok(format!("Liabilities:CreditCards:{new_segment}"))
    } else {
        Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Only Source Accounts can be renamed from Settings.",
        ))
    }
}

fn which(command: &str) -> Option<String> {
    let output = Command::new("sh")
        .args(["-lc", &format!("command -v {command}")])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn git_config_value(root: Option<&Path>, key: &str) -> Result<Option<String>, WorkspaceError> {
    let mut command = Command::new("git");
    if let Some(root) = root {
        command.arg("-C").arg(root);
        command.arg("config").arg("--local").arg("--get").arg(key);
    } else {
        command.arg("config").arg("--global").arg("--get").arg(key);
    }
    let output = command.output()?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if value.is_empty() { None } else { Some(value) })
}

fn set_git_config_value(root: &Path, key: &str, value: Option<&str>) -> Result<(), WorkspaceError> {
    let mut command = Command::new("git");
    command.arg("-C").arg(root).arg("config").arg("--local");
    if let Some(value) = value {
        command.arg(key).arg(value);
    } else {
        command.arg("--unset").arg(key);
    }
    let output = command.output()?;
    if !output.status.success() && value.is_none() {
        return Ok(());
    }
    if !output.status.success() {
        return Err(WorkspaceError::io(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

struct TestAiRow;

impl AiSuggestionRow for TestAiRow {
    fn posted_date(&self) -> &str {
        "2026-05-08"
    }

    fn description(&self) -> &str {
        "Settings test adapter"
    }

    fn source_account(&self) -> &str {
        "Assets:Bank:Checking"
    }

    fn source_amount(&self) -> &str {
        "-20.00"
    }

    fn source_file_name(&self) -> &str {
        "settings-test.csv"
    }

    fn import_fingerprint(&self) -> &str {
        "settings-test-fingerprint"
    }
}

#[cfg(test)]
mod tests {
    use super::{detect_ai_adapters, rename_source_account, RenameSourceAccountInput};
    use crate::workspace::create::create_workspace;
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::CreateWorkspaceInput;
    use std::fs;
    use std::path::Path;

    #[test]
    fn detected_adapters_use_non_interactive_invocations() {
        // A bare binary name (e.g. "opencode") launches an interactive session
        // that never exits; detected commands must include the print-and-exit mode.
        let adapters = detect_ai_adapters().unwrap();

        assert_eq!(adapters.len(), 3);
        for adapter in &adapters {
            assert!(
                adapter.command.contains(' '),
                "detected command for {} must not be a bare binary name",
                adapter.name
            );
        }
        assert_eq!(adapters[0].command, "claude --print");
        assert_eq!(adapters[1].command, "codex exec");
        assert_eq!(adapters[2].command, "opencode run");
    }

    #[test]
    fn source_account_rename_rolls_back_when_opening_balance_invalidates_ledger() {
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
            name: "Old Checking".to_string(),
            opening_balance: Some("1.00".to_string()),
        })
        .unwrap();

        let error = rename_source_account(RenameSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Old-Checking".to_string(),
            new_name: "Renamed Checking".to_string(),
            opening_balance: Some("not-a-number".to_string()),
        })
        .unwrap_err();
        assert_eq!(
            error.code,
            crate::workspace::WorkspaceErrorCode::InvalidLedger
        );
        let accounts =
            fs::read_to_string(Path::new(&created.root_path).join("accounts.bean")).unwrap();
        assert!(accounts.contains("open Assets:Bank:Old-Checking"));
        assert!(!accounts.contains("Renamed-Checking"));
    }

    #[test]
    fn source_account_rename_delegates_and_updates_opening_balance_once() {
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
            name: "Old Checking".to_string(),
            opening_balance: Some("1.00".to_string()),
        })
        .unwrap();

        rename_source_account(RenameSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            source_account: "Assets:Bank:Old-Checking".to_string(),
            new_name: "Renamed Checking".to_string(),
            opening_balance: Some("42.00".to_string()),
        })
        .unwrap();

        let contents =
            fs::read_to_string(Path::new(&created.root_path).join("opening-balances.bean"))
                .unwrap();
        assert_eq!(
            contents
                .lines()
                .filter(|line| line.contains("Assets:Bank:Renamed-Checking"))
                .count(),
            1
        );
        assert!(contents.contains("balance Assets:Bank:Renamed-Checking 42.00 USD"));
    }
}
