use crate::workspace::categorization_rules;
use crate::workspace::data_integrity::{self, atomic_write, SnapshotReason};
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::imports;
use crate::workspace::open::open_workspace;
use crate::workspace::source_accounts::documents_slug_for_account;
use crate::workspace::types::{WorkspaceManifest, WorkspaceSummary};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameAccountInput {
    pub workspace_root_path: String,
    pub old_account: String,
    pub new_account: String,
    #[serde(default)]
    pub merge: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRenamePreview {
    pub old_account: String,
    pub new_account: String,
    pub merge: bool,
    pub destination_exists: bool,
    pub source_account: bool,
    pub changes: Vec<AccountRenameFileChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRenameFileChange {
    pub relative_path: String,
    pub lines: Vec<AccountRenameLineChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRenameLineChange {
    pub line_number: usize,
    pub before: String,
    pub after: String,
}

/// Rewrite only complete account tokens. In particular, an account is not a
/// namespace here: renaming `Expenses:Food` must not rename
/// `Expenses:Food:Restaurants`.
pub fn rewrite_account_references(
    contents: &str,
    old_account: &str,
    new_account: &str,
) -> (String, Vec<AccountRenameLineChange>) {
    let mut output = String::with_capacity(contents.len());
    let mut changes = Vec::new();

    for (line_index, raw_line) in contents.split_inclusive('\n').enumerate() {
        let (line, ending) = if let Some(without_newline) = raw_line.strip_suffix('\n') {
            if let Some(without_carriage_return) = without_newline.strip_suffix('\r') {
                (without_carriage_return, "\r\n")
            } else {
                (without_newline, "\n")
            }
        } else {
            (raw_line, "")
        };
        let rewritten = rewrite_line(line, old_account, new_account);
        if rewritten != line {
            changes.push(AccountRenameLineChange {
                line_number: line_index + 1,
                before: line.to_string(),
                after: rewritten.clone(),
            });
        }
        output.push_str(&rewritten);
        output.push_str(ending);
    }

    (output, changes)
}

fn rewrite_line(line: &str, old_account: &str, new_account: &str) -> String {
    let (code, comment) = match line.find(';') {
        Some(index) => (&line[..index], &line[index..]),
        None => (line, ""),
    };
    let rewritten = rewrite_code_line(code, old_account, new_account);
    if rewritten == code {
        line.to_string()
    } else {
        format!("{rewritten}{comment}")
    }
}

fn rewrite_code_line(line: &str, old_account: &str, new_account: &str) -> String {
    let mut tokens = Vec::new();
    let mut token_start = None;
    for (index, character) in line.char_indices() {
        if character.is_whitespace() {
            if let Some(start) = token_start.take() {
                tokens.push((start, index));
            }
        } else if token_start.is_none() {
            token_start = Some(index);
        }
    }
    if let Some(start) = token_start {
        tokens.push((start, line.len()));
    }

    let quoted_old = format!("\"{old_account}\"");
    let quoted_new = format!("\"{new_account}\"");
    let mut replacements = Vec::<(usize, usize, String)>::new();
    for (index, (start, end)) in tokens.iter().enumerate() {
        let token = &line[*start..*end];
        if token == old_account {
            replacements.push((*start, *end, new_account.to_string()));
        }
        if (token == "source_account:" || token == "linked_source_account:")
            && tokens
                .get(index + 1)
                .map(|(_, next_end)| line[tokens[index + 1].0..*next_end] == quoted_old)
                .unwrap_or(false)
        {
            let (next_start, next_end) = tokens[index + 1];
            replacements.push((next_start, next_end, quoted_new.clone()));
        }
    }

    if replacements.is_empty() {
        return line.to_string();
    }
    let mut output = line.to_string();
    for (start, end, replacement) in replacements.into_iter().rev() {
        output.replace_range(start..end, &replacement);
    }
    output
}

pub fn preview_account_rename(
    input: RenameAccountInput,
) -> Result<AccountRenamePreview, WorkspaceError> {
    let root = validate_input(&input)?;
    let manifest = read_manifest(root)?;
    let files = data_integrity::ledger_files(root)?;
    let destination_exists =
        destination_has_open_directive(root, &manifest.layout.accounts_file, &input.new_account)?;
    let source_account =
        is_source_account(root, &manifest.layout.accounts_file, &input.old_account)?;
    let mut changes = Vec::new();

    for relative_path in files {
        let contents = fs::read_to_string(root.join(&relative_path))?;
        let (_, lines) =
            rewrite_account_references(&contents, &input.old_account, &input.new_account);
        if !lines.is_empty() {
            changes.push(AccountRenameFileChange {
                relative_path,
                lines,
            });
        }
    }
    if source_account {
        changes.extend([
            AccountRenameFileChange {
                relative_path: format!("{}: source_mappings", manifest.layout.sqlite_file),
                lines: Vec::new(),
            },
            AccountRenameFileChange {
                relative_path: format!("{}: statement_rows", manifest.layout.sqlite_file),
                lines: Vec::new(),
            },
            AccountRenameFileChange {
                relative_path: format!("{}: categorization_rules", manifest.layout.sqlite_file),
                lines: Vec::new(),
            },
            AccountRenameFileChange {
                relative_path: format!(
                    "{}/{}/ -> {}/{}/",
                    manifest.layout.documents_directory,
                    documents_slug_for_account(&input.old_account),
                    manifest.layout.documents_directory,
                    documents_slug_for_account(&input.new_account)
                ),
                lines: Vec::new(),
            },
        ]);
    }

    Ok(AccountRenamePreview {
        old_account: input.old_account,
        new_account: input.new_account,
        merge: input.merge,
        destination_exists,
        source_account,
        changes,
    })
}

pub fn rename_account(input: RenameAccountInput) -> Result<WorkspaceSummary, WorkspaceError> {
    rename_account_with_opening_balance(input, None)
}

pub(crate) fn rename_account_with_opening_balance(
    input: RenameAccountInput,
    opening_balance: Option<&str>,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = validate_input(&input)?;
    let manifest = read_manifest(root)?;
    let destination_exists =
        destination_has_open_directive(root, &manifest.layout.accounts_file, &input.new_account)?;
    if destination_exists && !input.merge {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Account already exists. Choose merge to consolidate.",
        ));
    }

    let files = data_integrity::ledger_files(root)?;
    let source_account =
        is_source_account(root, &manifest.layout.accounts_file, &input.old_account)?;
    let mut original_files = Vec::with_capacity(files.len());
    let mut rewritten_files = Vec::with_capacity(files.len());
    for relative_path in files {
        let path = root.join(&relative_path);
        let original = fs::read_to_string(&path)?;
        let (mut rewritten, _) =
            rewrite_account_references(&original, &input.old_account, &input.new_account);
        if relative_path == manifest.layout.opening_balances_file {
            if let Some(opening_balance) = opening_balance {
                rewritten = rewrite_opening_balance(
                    &rewritten,
                    &manifest,
                    &input.new_account,
                    opening_balance,
                );
            }
        }
        if input.merge {
            rewritten = remove_merged_open_directive(&rewritten, &input.old_account);
        }
        if rewritten != original {
            rewritten_files.push((relative_path.clone(), rewritten));
        }
        original_files.push((relative_path, original));
    }

    let sqlite_path = root.join(&manifest.layout.sqlite_file);
    let backup_path = sqlite_path
        .parent()
        .unwrap_or(root)
        .join(format!(".rename-account-backup-{}", Uuid::new_v4()));
    fs::copy(&sqlite_path, &backup_path)?;
    if let Err(error) = data_integrity::create_snapshot(root, SnapshotReason::RenameAccount) {
        let _ = fs::remove_file(&backup_path);
        return Err(error);
    }

    let mut folder_change = FolderChange::None;
    let operation = (|| -> Result<(), WorkspaceError> {
        for (relative_path, contents) in &rewritten_files {
            atomic_write(root.join(relative_path), contents)?;
        }
        update_sqlite(
            &sqlite_path,
            &input.old_account,
            &input.new_account,
            input.merge,
        )?;
        if source_account {
            folder_change = rename_documents_folder(
                root,
                &manifest.layout.documents_directory,
                &input.old_account,
                &input.new_account,
                input.merge,
            )?;
        }
        Ok(())
    })();

    let result = match operation {
        Ok(()) => match open_workspace(root) {
            Ok(summary)
                if summary.ledger_status == crate::workspace::types::LedgerStatus::Valid =>
            {
                Ok(summary)
            }
            Ok(summary) => Err(WorkspaceError::new(
                WorkspaceErrorCode::InvalidLedger,
                summary.ledger_validation.errors.join(" "),
            )),
            Err(error) => Err(error),
        },
        Err(error) => Err(error),
    };
    match result {
        Ok(summary) => {
            if let Err(cleanup_error) = fs::remove_file(&backup_path) {
                let error = WorkspaceError::from(cleanup_error);
                return match rollback(
                    RollbackPaths {
                        root,
                        sqlite_path: &sqlite_path,
                        backup_path: &backup_path,
                        documents_directory: &manifest.layout.documents_directory,
                        old_account: &input.old_account,
                        new_account: &input.new_account,
                    },
                    &original_files,
                    &folder_change,
                ) {
                    Ok(()) => Err(error),
                    Err(rollback_error) => Err(WorkspaceError::new(
                        error.code,
                        format!(
                            "{} Rollback failed: {}",
                            error.message, rollback_error.message
                        ),
                    )),
                };
            }
            Ok(summary)
        }
        Err(error) => {
            match rollback(
                RollbackPaths {
                    root,
                    sqlite_path: &sqlite_path,
                    backup_path: &backup_path,
                    documents_directory: &manifest.layout.documents_directory,
                    old_account: &input.old_account,
                    new_account: &input.new_account,
                },
                &original_files,
                &folder_change,
            ) {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(WorkspaceError::new(
                    error.code,
                    format!(
                        "{} Rollback failed: {}",
                        error.message, rollback_error.message
                    ),
                )),
            }
        }
    }
}

fn read_manifest(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    let contents = fs::read_to_string(root.join(".diurnum").join("workspace.json"))?;
    serde_json::from_str(&contents).map_err(|error| WorkspaceError::io(error.to_string()))
}

fn rewrite_opening_balance(
    contents: &str,
    manifest: &WorkspaceManifest,
    account: &str,
    opening_balance: &str,
) -> String {
    let mut lines = Vec::new();
    let mut changed = false;
    for line in contents.lines() {
        let code = code_before_comment(line);
        let parts: Vec<_> = code.split_whitespace().collect();
        if parts.len() >= 5 && parts[1] == "balance" && parts[2] == account {
            lines.push(format!(
                "{} balance {} {} {}",
                parts[0], account, opening_balance, parts[4]
            ));
            changed = true;
        } else {
            lines.push(line.to_string());
        }
    }
    if !changed {
        lines.push(format!(
            "{} balance {} {} {}",
            manifest.business.books_start_date,
            account,
            opening_balance,
            manifest.business.base_currency
        ));
    }
    lines.join("\n") + "\n"
}

fn validate_input(input: &RenameAccountInput) -> Result<&Path, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    if account_name_error(&input.old_account).is_some() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Old account is not a valid Beancount account name.",
        ));
    }
    if let Some(reason) = account_name_error(&input.new_account) {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            format!("New account is invalid: {reason}"),
        ));
    }
    if input.old_account == input.new_account {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "New account must be different from the old account.",
        ));
    }
    if !root.join(".diurnum").join("workspace.json").exists() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::MissingManifest,
            "This folder is not an App-Created Workspace.",
        ));
    }
    let files = data_integrity::ledger_files(root)?;
    let known = files.iter().try_fold(false, |known, relative_path| {
        let contents = fs::read_to_string(root.join(relative_path))?;
        let (_, changes) =
            rewrite_account_references(&contents, &input.old_account, "Assets:DiurnumRenameProbe");
        Ok::<_, WorkspaceError>(known || !changes.is_empty())
    })?;
    if !known {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Old account was not found in the Workspace ledger.",
        ));
    }
    Ok(root)
}

fn account_name_error(value: &str) -> Option<String> {
    const ROOTS: &[&str] = &["Assets", "Liabilities", "Equity", "Income", "Expenses"];
    let mut parts = value.split(':');
    if !ROOTS.contains(&parts.next().unwrap_or("")) {
        return Some("account must start with a valid Beancount root".to_string());
    }
    let segments: Vec<_> = parts.collect();
    if segments.is_empty() {
        return Some("account must have a sub-account".to_string());
    }
    if segments.iter().any(|segment| {
        segment.is_empty()
            || segment
                .chars()
                .any(|c| !c.is_ascii_alphanumeric() && c != '-')
    }) {
        return Some("account segments may contain only letters, digits, and hyphens".to_string());
    }
    None
}

fn destination_has_open_directive(
    root: &Path,
    accounts_file: &str,
    account: &str,
) -> Result<bool, WorkspaceError> {
    let contents = fs::read_to_string(root.join(accounts_file))?;
    Ok(contents.lines().any(|line| {
        let parts: Vec<_> = code_before_comment(line).split_whitespace().collect();
        parts.len() >= 3 && parts[1] == "open" && parts[2] == account
    }))
}

fn is_source_account(
    root: &Path,
    accounts_file: &str,
    account: &str,
) -> Result<bool, WorkspaceError> {
    if !(account.starts_with("Assets:Bank:") || account.starts_with("Liabilities:CreditCards:")) {
        return Ok(false);
    }
    let contents = fs::read_to_string(root.join(accounts_file))?;
    Ok(contents.lines().any(|line| {
        let parts: Vec<_> = code_before_comment(line).split_whitespace().collect();
        parts.len() >= 3 && (parts[1] == "open" || parts[1] == "close") && parts[2] == account
    }))
}

fn code_before_comment(line: &str) -> &str {
    line.split_once(';').map(|(code, _)| code).unwrap_or(line)
}

fn remove_merged_open_directive(contents: &str, old_account: &str) -> String {
    contents
        .split_inclusive('\n')
        .filter(|raw| {
            let line = code_before_comment(raw).trim();
            let parts: Vec<_> = line.split_whitespace().collect();
            !(parts.len() >= 3
                && (parts[1] == "open" || parts[1] == "close")
                && parts[2] == old_account)
        })
        .collect()
}

fn update_sqlite(
    sqlite_path: &Path,
    old_account: &str,
    new_account: &str,
    merge: bool,
) -> Result<(), WorkspaceError> {
    let mut connection = Connection::open(sqlite_path)?;
    imports::ensure_import_tables(&connection)?;
    categorization_rules::ensure_categorization_rules_table(&connection)?;
    let transaction = connection.transaction()?;
    if merge {
        transaction.execute(
            "delete from source_mappings where source_account = ?1 and exists (select 1 from source_mappings where source_account = ?2)",
            params![old_account, new_account],
        )?;
        transaction.execute(
            "delete from statement_rows where source_account = ?1 and exists (select 1 from statement_rows destination where destination.source_account = ?2 and destination.import_fingerprint = statement_rows.import_fingerprint)",
            params![old_account, new_account],
        )?;
    }
    transaction.execute(
        "update source_mappings set source_account = ?1 where source_account = ?2",
        params![new_account, old_account],
    )?;
    transaction.execute(
        "update statement_rows set source_account = ?1 where source_account = ?2",
        params![new_account, old_account],
    )?;
    transaction.execute(
        "update categorization_rules set source_account = ?1 where source_account = ?2",
        params![new_account, old_account],
    )?;
    transaction.commit()?;
    Ok(())
}

#[derive(Debug, Default)]
enum FolderChange {
    #[default]
    None,
    Renamed,
    Merged {
        moved: Vec<String>,
        gitkeep: Option<Vec<u8>>,
    },
}

fn rename_documents_folder(
    root: &Path,
    documents_directory: &str,
    old_account: &str,
    new_account: &str,
    merge: bool,
) -> Result<FolderChange, WorkspaceError> {
    let documents = root.join(documents_directory);
    let old_folder = documents.join(documents_slug_for_account(old_account));
    let new_folder = documents.join(documents_slug_for_account(new_account));
    if old_folder == new_folder || !old_folder.exists() {
        return Ok(FolderChange::None);
    }
    if !new_folder.exists() {
        fs::rename(old_folder, new_folder)?;
        return Ok(FolderChange::Renamed);
    }
    if !merge {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "The destination documents folder already exists.",
        ));
    }

    let gitkeep = {
        let path = old_folder.join(".gitkeep");
        if path.exists() {
            Some(fs::read(path)?)
        } else {
            None
        }
    };
    let mut moved = Vec::new();
    for entry in fs::read_dir(&old_folder)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".gitkeep" {
            continue;
        }
        if new_folder.join(&name).exists() {
            return Err(WorkspaceError::new(
                WorkspaceErrorCode::InvalidLedger,
                format!("The destination documents folder already contains '{name}'."),
            ));
        }
        if let Err(error) = fs::rename(entry.path(), new_folder.join(&name)) {
            for moved_name in moved.iter().rev() {
                let _ = fs::rename(new_folder.join(moved_name), old_folder.join(moved_name));
            }
            return Err(error.into());
        }
        moved.push(name);
    }
    if let Err(error) = fs::remove_dir_all(&old_folder) {
        for moved_name in moved.iter().rev() {
            let _ = fs::rename(new_folder.join(moved_name), old_folder.join(moved_name));
        }
        return Err(error.into());
    }
    Ok(FolderChange::Merged { moved, gitkeep })
}

struct RollbackPaths<'a> {
    root: &'a Path,
    sqlite_path: &'a Path,
    backup_path: &'a Path,
    documents_directory: &'a str,
    old_account: &'a str,
    new_account: &'a str,
}

fn rollback(
    paths: RollbackPaths<'_>,
    original_files: &[(String, String)],
    folder_change: &FolderChange,
) -> Result<(), WorkspaceError> {
    let mut failures = Vec::new();
    for (relative_path, contents) in original_files {
        if let Err(error) = atomic_write(paths.root.join(relative_path), contents) {
            failures.push(format!("{relative_path}: {error}"));
        }
    }
    if let Err(error) = fs::copy(paths.backup_path, paths.sqlite_path) {
        failures.push(format!("SQLite backup: {error}"));
    }
    let documents = paths.root.join(paths.documents_directory);
    let old_folder = documents.join(documents_slug_for_account(paths.old_account));
    let new_folder = documents.join(documents_slug_for_account(paths.new_account));
    match folder_change {
        FolderChange::Renamed => {
            if new_folder.exists() && !old_folder.exists() {
                if let Err(error) = fs::rename(&new_folder, &old_folder) {
                    failures.push(format!("documents folder: {error}"));
                }
            }
        }
        FolderChange::Merged { moved, gitkeep } => {
            if let Err(error) = fs::create_dir_all(&old_folder) {
                failures.push(format!("documents rollback directory: {error}"));
            }
            for name in moved {
                if let Err(error) = fs::rename(new_folder.join(name), old_folder.join(name)) {
                    failures.push(format!("documents/{name}: {error}"));
                }
            }
            match gitkeep {
                Some(contents) => {
                    if let Err(error) = fs::write(old_folder.join(".gitkeep"), contents) {
                        failures.push(format!("documents/.gitkeep: {error}"));
                    }
                }
                None => match fs::remove_file(old_folder.join(".gitkeep")) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => failures.push(format!("documents/.gitkeep: {error}")),
                },
            }
        }
        FolderChange::None => {}
    }
    match fs::remove_file(paths.backup_path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => failures.push(format!("SQLite backup cleanup: {error}")),
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(WorkspaceError::io(failures.join("; ")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::create::create_workspace;
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::CreateWorkspaceInput;
    use rusqlite::{params, Connection};
    use std::io::Write;

    fn workspace() -> (tempfile::TempDir, String) {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        (tempdir, created.root_path)
    }

    #[test]
    fn rewrites_tokens_and_metadata_without_subtrees() {
        let contents = "2026-01-01 open Expenses:Food USD\n  Expenses:Food  1 USD\n  Expenses:Food:Restaurants  2 USD\n  source_account: \"Expenses:Food\"\n";
        let (rewritten, changes) =
            rewrite_account_references(contents, "Expenses:Food", "Expenses:Meals");
        assert!(rewritten.contains("open Expenses:Meals"));
        assert!(rewritten.contains("Expenses:Food:Restaurants"));
        assert!(rewritten.contains("source_account: \"Expenses:Meals\""));
        assert_eq!(changes.len(), 3);
    }

    #[test]
    fn preserves_unrelated_whitespace() {
        let contents = "x  Expenses:Food\t y\r\n";
        let (rewritten, _) =
            rewrite_account_references(contents, "Expenses:Food", "Expenses:Meals");
        assert_eq!(rewritten, "x  Expenses:Meals\t y\r\n");
        let (lf_rewritten, _) =
            rewrite_account_references("Expenses:Food\n", "Expenses:Food", "Expenses:Meals");
        assert_eq!(lf_rewritten, "Expenses:Meals\n");
        let comment = "; Expenses:Food source_account: \"Expenses:Food\"\n";
        let (comment_rewritten, comment_changes) =
            rewrite_account_references(comment, "Expenses:Food", "Expenses:Meals");
        assert_eq!(comment_rewritten, comment);
        assert!(comment_changes.is_empty());
    }

    #[test]
    fn rewrites_account_directives_postings_and_metadata_in_workspace_files() {
        let (_tempdir, root) = workspace();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: root.clone(),
            kind: SourceAccountKind::Bank,
            name: "Old Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: root.clone(),
            kind: SourceAccountKind::Bank,
            name: "Other Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        let transaction_path = Path::new(&root).join("transactions/2026-01.bean");
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&transaction_path)
            .unwrap()
            .write_all(
                b"2026-01-02 * \"Transfer\"\n  source_account: \"Assets:Bank:Old-Checking\"\n  linked_source_account: \"Assets:Bank:Old-Checking\"\n  Assets:Bank:Old-Checking  -10.00 USD\n  Assets:Bank:Other-Checking  10.00 USD\n",
            )
            .unwrap();

        rename_account(RenameAccountInput {
            workspace_root_path: root.clone(),
            old_account: "Assets:Bank:Old-Checking".to_string(),
            new_account: "Assets:Bank:Renamed".to_string(),
            merge: false,
        })
        .unwrap();
        let contents = fs::read_to_string(transaction_path).unwrap();
        assert!(contents.contains("Assets:Bank:Renamed  -10.00 USD"));
        assert!(contents.contains("source_account: \"Assets:Bank:Renamed\""));
        assert!(contents.contains("linked_source_account: \"Assets:Bank:Renamed\""));
        assert!(!contents.contains("Assets:Bank:Old-Checking  -10.00 USD"));
    }

    #[test]
    fn blocks_existing_destination_unless_merge_is_explicit() {
        let (_tempdir, root) = workspace();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: root.clone(),
            kind: SourceAccountKind::Bank,
            name: "Old Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(Path::new(&root).join("accounts.bean"))
            .unwrap()
            .write_all(b"2026-01-01 open Assets:Bank:New-Checking USD\n")
            .unwrap();

        let error = rename_account(RenameAccountInput {
            workspace_root_path: root,
            old_account: "Assets:Bank:Old-Checking".to_string(),
            new_account: "Assets:Bank:New-Checking".to_string(),
            merge: false,
        })
        .unwrap_err();
        assert_eq!(error.code, WorkspaceErrorCode::InvalidLedger);
        assert!(error.message.contains("Choose merge"));
    }

    #[test]
    fn merge_consolidates_existing_destination_account_and_documents() {
        let (_tempdir, root) = workspace();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: root.clone(),
            kind: SourceAccountKind::Bank,
            name: "Old Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: root.clone(),
            kind: SourceAccountKind::Bank,
            name: "New Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        let old_folder = Path::new(&root).join("documents/old-checking");
        fs::write(old_folder.join("statement.csv"), "statement").unwrap();
        let connection =
            Connection::open(Path::new(&root).join(".diurnum/diurnum.sqlite")).unwrap();
        imports::ensure_import_tables(&connection).unwrap();
        for (id, account) in [
            ("old-row", "Assets:Bank:Old-Checking"),
            ("new-row", "Assets:Bank:New-Checking"),
        ] {
            connection
                .execute(
                    "insert into statement_rows (id, source_account, source_file_name, posted_date, description, source_amount, import_fingerprint, supporting_fields_json, raw_row_json, status, imported_at) values (?1, ?2, 'bank.csv', '2026-01-02', 'Duplicate', '-1.00', 'same-fingerprint', '{}', '{}', 'pending', '2026-01-02T00:00:00Z')",
                    params![id, account],
                )
                .unwrap();
        }

        rename_account(RenameAccountInput {
            workspace_root_path: root.clone(),
            old_account: "Assets:Bank:Old-Checking".to_string(),
            new_account: "Assets:Bank:New-Checking".to_string(),
            merge: true,
        })
        .unwrap();
        assert!(!old_folder.exists());
        assert_eq!(
            fs::read_to_string(Path::new(&root).join("documents/new-checking/statement.csv"))
                .unwrap(),
            "statement"
        );
        let accounts = fs::read_to_string(Path::new(&root).join("accounts.bean")).unwrap();
        assert!(!accounts.contains("Old-Checking"));
        assert!(accounts.contains("open Assets:Bank:New-Checking"));
        let remaining: i64 = connection
            .query_row(
                "select count(*) from statement_rows where source_account = 'Assets:Bank:New-Checking' and import_fingerprint = 'same-fingerprint'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 1);
    }

    #[test]
    fn folder_collision_rolls_back_ledger_and_sqlite_bytes() {
        let (_tempdir, root) = workspace();
        add_source_account(AddSourceAccountInput {
            workspace_root_path: root.clone(),
            kind: SourceAccountKind::Bank,
            name: "Old Checking".to_string(),
            opening_balance: None,
        })
        .unwrap();
        let root_path = Path::new(&root);
        let ledger_before = data_integrity::ledger_files(root_path)
            .unwrap()
            .into_iter()
            .map(|relative| {
                let bytes = fs::read(root_path.join(&relative)).unwrap();
                (relative, bytes)
            })
            .collect::<Vec<_>>();
        let sqlite_path = root_path.join(".diurnum/diurnum.sqlite");
        let sqlite_before = fs::read(&sqlite_path).unwrap();
        fs::create_dir_all(root_path.join("documents/new-checking")).unwrap();

        let error = rename_account(RenameAccountInput {
            workspace_root_path: root.clone(),
            old_account: "Assets:Bank:Old-Checking".to_string(),
            new_account: "Expenses:New-Checking".to_string(),
            merge: false,
        })
        .unwrap_err();
        assert_eq!(error.code, WorkspaceErrorCode::InvalidLedger);
        for (relative, bytes) in ledger_before {
            assert_eq!(fs::read(root_path.join(relative)).unwrap(), bytes);
        }
        assert_eq!(fs::read(sqlite_path).unwrap(), sqlite_before);
        assert!(root_path.join("documents/old-checking").exists());
    }
}
