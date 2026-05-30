use crate::workspace::data_integrity::atomic_append;
use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::open::open_workspace;
use crate::workspace::types::{WorkspaceManifest, WorkspaceSummary};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSourceAccountInput {
    pub workspace_root_path: String,
    pub kind: SourceAccountKind,
    pub name: String,
    pub opening_balance: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceAccountKind {
    Bank,
    CreditCard,
}

pub fn add_source_account(
    input: AddSourceAccountInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = Path::new(&input.workspace_root_path);
    let manifest = read_manifest(root)?;
    let account_name = build_account_name(&input.kind, &input.name)?;
    let accounts_path = root.join(&manifest.layout.accounts_file);
    let opening_balances_path = root.join(&manifest.layout.opening_balances_file);

    let accounts = fs::read_to_string(&accounts_path)?;
    if accounts
        .lines()
        .any(|line| line.split_whitespace().nth(2) == Some(account_name.as_str()))
    {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "A Source Account with that Ledger Account name already exists.",
        ));
    }

    append_line(
        &accounts_path,
        &format!(
            "{} open {} {}",
            manifest.business.books_start_date, account_name, manifest.business.base_currency
        ),
    )?;

    if let Some(opening_balance) = normalized_opening_balance(input.opening_balance.as_deref())? {
        append_line(
            &opening_balances_path,
            &format!(
                "{} balance {} {} {}",
                manifest.business.books_start_date,
                account_name,
                opening_balance,
                manifest.business.base_currency
            ),
        )?;
    }

    open_workspace(root)
}

fn read_manifest(root: &Path) -> Result<WorkspaceManifest, WorkspaceError> {
    let manifest_path = root.join(".diurnum").join("workspace.json");
    serde_json::from_str(&fs::read_to_string(manifest_path)?).map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::NotAppCreatedWorkspace,
            "Workspace manifest is unreadable.",
        )
    })
}

fn build_account_name(kind: &SourceAccountKind, raw_name: &str) -> Result<String, WorkspaceError> {
    let segment = sanitize_account_segment(raw_name)?;
    let prefix = match kind {
        SourceAccountKind::Bank => "Assets:Bank",
        SourceAccountKind::CreditCard => "Liabilities:CreditCards",
    };
    Ok(format!("{prefix}:{segment}"))
}

fn sanitize_account_segment(raw_name: &str) -> Result<String, WorkspaceError> {
    let mut output = String::new();
    let mut previous_was_separator = true;

    for character in raw_name.trim().chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator {
            output.push('-');
            previous_was_separator = true;
        }
    }

    while output.ends_with('-') {
        output.pop();
    }

    if output.is_empty() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Source Account name must contain letters or numbers.",
        ));
    }

    Ok(output)
}

fn normalized_opening_balance(value: Option<&str>) -> Result<Option<String>, WorkspaceError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    value.parse::<f64>().map_err(|_| {
        WorkspaceError::new(
            WorkspaceErrorCode::InvalidLedger,
            "Opening Balance must be a numeric amount.",
        )
    })?;

    Ok(Some(value.to_string()))
}

fn append_line(path: &Path, line: &str) -> Result<(), WorkspaceError> {
    atomic_append(path, &format!("{line}\n"))
}

#[cfg(test)]
mod tests {
    use crate::workspace::create::create_workspace;
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::{CreateWorkspaceInput, LedgerStatus};
    use std::fs;
    use std::path::Path;

    #[test]
    fn adds_bank_source_account_and_opening_balance() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let updated = add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path.clone(),
            kind: SourceAccountKind::Bank,
            name: "Operating Checking".to_string(),
            opening_balance: Some("1250.25".to_string()),
        })
        .unwrap();

        assert_eq!(updated.ledger_status, LedgerStatus::Valid);

        let root = Path::new(&created.root_path);
        let accounts = fs::read_to_string(root.join("accounts.bean")).unwrap();
        assert!(accounts.contains("2026-01-01 open Assets:Bank:Operating-Checking USD"));

        let opening_balances = fs::read_to_string(root.join("opening-balances.bean")).unwrap();
        assert!(opening_balances
            .contains("2026-01-01 balance Assets:Bank:Operating-Checking 1250.25 USD"));
    }
}
