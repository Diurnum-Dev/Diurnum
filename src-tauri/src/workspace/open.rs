use crate::workspace::errors::{WorkspaceError, WorkspaceErrorCode};
use crate::workspace::types::{LedgerStatus, WorkspaceManifest, WorkspaceSummary};
use crate::workspace::validation::validate_workspace;
use std::fs;
use std::path::Path;

pub fn open_workspace(path: impl AsRef<Path>) -> Result<WorkspaceSummary, WorkspaceError> {
    let root = path.as_ref();
    let manifest_path = root.join(".diurnum").join("workspace.json");
    if !manifest_path.exists() {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::MissingManifest,
            "This folder is not an App-Created Workspace.",
        ));
    }

    let manifest: WorkspaceManifest =
        serde_json::from_str(&fs::read_to_string(&manifest_path)?).map_err(|_| {
            WorkspaceError::new(
                WorkspaceErrorCode::NotAppCreatedWorkspace,
                "Workspace manifest is unreadable.",
            )
        })?;

    if !manifest.app_created {
        return Err(WorkspaceError::new(
            WorkspaceErrorCode::NotAppCreatedWorkspace,
            "Only App-Created Workspaces are supported in the MVP.",
        ));
    }

    let required_paths = [
        &manifest.layout.main_file,
        &manifest.layout.accounts_file,
        &manifest.layout.opening_balances_file,
        &manifest.layout.transactions_directory,
        &manifest.layout.documents_directory,
        &manifest.layout.imports_directory,
        &manifest.layout.app_directory,
        &manifest.layout.sqlite_file,
    ];

    for relative_path in required_paths {
        if !root.join(relative_path).exists() {
            return Err(WorkspaceError::new(
                WorkspaceErrorCode::MissingLedgerFile,
                format!("Workspace is missing {relative_path}."),
            ));
        }
    }

    let validation = validate_workspace(root)?;

    Ok(WorkspaceSummary {
        root_path: root.to_string_lossy().to_string(),
        business_name: manifest.business.name,
        base_currency: manifest.business.base_currency,
        books_start_date: manifest.business.books_start_date,
        ledger_status: if validation.status == LedgerStatus::Valid {
            LedgerStatus::Valid
        } else {
            LedgerStatus::Invalid
        },
        ledger_validation: validation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::create::create_workspace;
    use crate::workspace::types::CreateWorkspaceInput;

    #[test]
    fn opens_freshly_created_workspace() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let opened = open_workspace(&created.root_path).unwrap();
        assert_eq!(opened.business_name, "Acme Studio");
        assert_eq!(opened.base_currency, "USD");
        assert_eq!(opened.books_start_date, "2026-01-01");
        assert_eq!(opened.ledger_validation.status, LedgerStatus::Valid);
        assert!(opened.ledger_validation.errors.is_empty());
    }

    #[test]
    fn opens_app_created_workspace_with_invalid_ledger_state() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        fs::write(
            Path::new(&created.root_path).join("accounts.bean"),
            "2026-01-01 open Assets:Bank:Checking EUR\n",
        )
        .unwrap();

        let opened = open_workspace(&created.root_path).unwrap();
        assert_eq!(opened.ledger_status, LedgerStatus::Invalid);
        assert_eq!(opened.ledger_validation.status, LedgerStatus::Invalid);
        assert!(opened
            .ledger_validation
            .errors
            .iter()
            .any(|error| error.contains("accounts.bean:1")));
    }

    #[test]
    fn rejects_arbitrary_folder() {
        let tempdir = tempfile::tempdir().unwrap();
        let error = open_workspace(tempdir.path()).unwrap_err();
        assert_eq!(error.code, WorkspaceErrorCode::MissingManifest);
    }

    #[test]
    fn rejects_workspace_missing_required_ledger_file() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();
        fs::remove_file(Path::new(&created.root_path).join("main.bean")).unwrap();

        let error = open_workspace(&created.root_path).unwrap_err();
        assert_eq!(error.code, WorkspaceErrorCode::MissingLedgerFile);
    }

    #[test]
    fn rejects_malformed_manifest() {
        let tempdir = tempfile::tempdir().unwrap();
        let root = tempdir.path().join("Bad Workspace");
        fs::create_dir_all(root.join(".diurnum")).unwrap();
        fs::write(root.join(".diurnum/workspace.json"), "{not-json").unwrap();

        let error = open_workspace(root).unwrap_err();
        assert_eq!(error.code, WorkspaceErrorCode::NotAppCreatedWorkspace);
    }
}
