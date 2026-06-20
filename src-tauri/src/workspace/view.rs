use crate::workspace::approval::{self, BrokenProvenance, SuggestedEntry};
use crate::workspace::categorization_rules::{self, CategorizationRule};
use crate::workspace::data_integrity::{self, SnapshotSummary};
use crate::workspace::errors::WorkspaceError;
use crate::workspace::git::{self, GitPanelState};
use crate::workspace::open;
use crate::workspace::settings::{self, SourceAccountSummary};
use crate::workspace::shell::{self, WorkspaceGitStatus};
use crate::workspace::types::WorkspaceSummary;
use serde::Serialize;
use std::path::Path;

/// The whole derived view of an open Workspace that the UI needs after any
/// change. One assembler owns "what a refreshed view contains" so the frontend
/// no longer fans out a read per slice. Reports and the AI adapter PATH scan are
/// deliberately *not* here: reports are on-demand and adapter detection is an
/// open-time concern.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceView {
    pub summary: WorkspaceSummary,
    pub suggested_entries: Vec<SuggestedEntry>,
    pub known_accounts: Vec<String>,
    pub broken_provenance: Vec<BrokenProvenance>,
    pub categorization_rules: Vec<CategorizationRule>,
    pub source_accounts: Vec<SourceAccountSummary>,
    pub snapshots: Vec<SnapshotSummary>,
    pub git_status: WorkspaceGitStatus,
    pub git_panel: Option<GitPanelState>,
}

/// Open the Workspace and assemble its full view in one call.
pub fn load(root: impl AsRef<Path>) -> Result<WorkspaceView, WorkspaceError> {
    let summary = open::open_workspace(root.as_ref())?;
    load_from_summary(summary)
}

/// Assemble the view around an already-loaded summary (a mutation just produced
/// it), avoiding a second open.
pub fn load_from_summary(summary: WorkspaceSummary) -> Result<WorkspaceView, WorkspaceError> {
    let root_path = summary.root_path.clone();
    let root = Path::new(&root_path);
    Ok(WorkspaceView {
        suggested_entries: approval::get_suggested_entries(root)?,
        known_accounts: approval::get_known_ledger_accounts(root)?,
        broken_provenance: approval::get_broken_provenance(root)?,
        categorization_rules: categorization_rules::list_categorization_rules(root_path.clone())?,
        source_accounts: settings::list_source_accounts(root_path.clone())?,
        snapshots: data_integrity::list_snapshots(root)?,
        git_status: shell::get_workspace_git_status(root).unwrap_or(WorkspaceGitStatus {
            is_repository: false,
            branch_name: None,
            uncommitted_changes_count: 0,
        }),
        git_panel: git::get_git_panel_state(root).ok(),
        summary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::approval::{approve_suggested_entry, ApproveSuggestedEntryInput};
    use crate::workspace::create::create_workspace;
    use crate::workspace::imports::{import_statement_rows, CsvImportInput, CsvSourceMappingInput};
    use crate::workspace::source_accounts::{
        add_source_account, AddSourceAccountInput, SourceAccountKind,
    };
    use crate::workspace::types::{CreateWorkspaceInput, LedgerStatus};

    fn amount_mapping() -> Option<CsvSourceMappingInput> {
        Some(CsvSourceMappingInput {
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
        })
    }

    #[test]
    fn loads_full_view_after_import() {
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
            mapping: amount_mapping(),
        })
        .unwrap();

        let view = load(&created.root_path).unwrap();
        assert_eq!(view.summary.ledger_status, LedgerStatus::Valid);
        assert_eq!(view.suggested_entries.len(), 1);
        assert!(!view.source_accounts.is_empty());
        assert!(view.broken_provenance.is_empty());
    }

    #[test]
    fn view_reflects_approval_in_one_call() {
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
            mapping: amount_mapping(),
        })
        .unwrap();
        let before = load(&created.root_path).unwrap();
        let row_id = before.suggested_entries[0].statement_row_id.clone();

        let summary = approve_suggested_entry(ApproveSuggestedEntryInput {
            workspace_root_path: created.root_path.clone(),
            statement_row_id: row_id,
            ledger_account: "Expenses:Software".to_string(),
        })
        .unwrap();
        let view = load_from_summary(summary).unwrap();

        assert!(view.suggested_entries.is_empty());
        assert!(view
            .known_accounts
            .iter()
            .any(|account| account == "Expenses:Software"));
        assert!(view.broken_provenance.is_empty());
    }
}
