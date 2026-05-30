use crate::workspace::ai_adapter::{
    self, AiAdapterConfig, AiContextDisclosure, ConfigureAiAdapterInput,
};
use crate::workspace::approval::{
    self, ApproveSuggestedEntryInput, ApproveTransferEntryInput, BrokenProvenance, SuggestedEntry,
};
use crate::workspace::categorization_rules::{
    self, CategorizationRule, CreateCategorizationRuleInput, UpdateCategorizationRuleInput,
};
use crate::workspace::create;
use crate::workspace::data_integrity::{
    self, RestoreSnapshotInput, SaveLedgerFileInput, SnapshotSummary,
};
use crate::workspace::imports::{self, CsvImportInput, CsvImportResult};
use crate::workspace::open;
use crate::workspace::reports::{self, MvpReports, ReportsInput};
use crate::workspace::shell::{self, WorkspaceGitStatus, WorkspacePathStatus};
use crate::workspace::source_accounts::{self, AddSourceAccountInput};
use crate::workspace::types::{CreateWorkspaceInput, LedgerValidationSummary, WorkspaceSummary};
use crate::workspace::validation;
use crate::workspace::WorkspaceError;

#[tauri::command]
pub fn create_workspace(input: CreateWorkspaceInput) -> Result<WorkspaceSummary, WorkspaceError> {
    create::create_workspace(input)
}

#[tauri::command]
pub fn open_workspace(path: String) -> Result<WorkspaceSummary, WorkspaceError> {
    open::open_workspace(path)
}

#[tauri::command]
pub fn validate_workspace(path: String) -> Result<LedgerValidationSummary, WorkspaceError> {
    validation::validate_workspace(path)
}

#[tauri::command]
pub fn list_snapshots(path: String) -> Result<Vec<SnapshotSummary>, WorkspaceError> {
    data_integrity::list_snapshots(path)
}

#[tauri::command]
pub fn restore_snapshot(input: RestoreSnapshotInput) -> Result<WorkspaceSummary, WorkspaceError> {
    data_integrity::restore_snapshot(input)
}

#[tauri::command]
pub fn save_ledger_file(
    input: SaveLedgerFileInput,
) -> Result<LedgerValidationSummary, WorkspaceError> {
    data_integrity::save_ledger_file(input)
}

#[tauri::command]
pub fn inspect_workspace_paths(
    paths: Vec<String>,
) -> Result<Vec<WorkspacePathStatus>, WorkspaceError> {
    Ok(shell::inspect_workspace_paths(paths))
}

#[tauri::command]
pub fn get_workspace_git_status(path: String) -> Result<WorkspaceGitStatus, WorkspaceError> {
    shell::get_workspace_git_status(path)
}

#[tauri::command]
pub fn add_source_account(
    input: AddSourceAccountInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    source_accounts::add_source_account(input)
}

#[tauri::command]
pub fn import_statement_rows(input: CsvImportInput) -> Result<CsvImportResult, WorkspaceError> {
    imports::import_statement_rows(input)
}

#[tauri::command]
pub fn get_suggested_entries(path: String) -> Result<Vec<SuggestedEntry>, WorkspaceError> {
    approval::get_suggested_entries(path)
}

#[tauri::command]
pub fn get_broken_provenance(path: String) -> Result<Vec<BrokenProvenance>, WorkspaceError> {
    approval::get_broken_provenance(path)
}

#[tauri::command]
pub fn approve_suggested_entry(
    input: ApproveSuggestedEntryInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    approval::approve_suggested_entry(input)
}

#[tauri::command]
pub fn approve_transfer_entry(
    input: ApproveTransferEntryInput,
) -> Result<WorkspaceSummary, WorkspaceError> {
    approval::approve_transfer_entry(input)
}

#[tauri::command]
pub fn list_categorization_rules(path: String) -> Result<Vec<CategorizationRule>, WorkspaceError> {
    categorization_rules::list_categorization_rules(path)
}

#[tauri::command]
pub fn create_categorization_rule(
    input: CreateCategorizationRuleInput,
) -> Result<CategorizationRule, WorkspaceError> {
    categorization_rules::create_categorization_rule(input)
}

#[tauri::command]
pub fn update_categorization_rule(
    input: UpdateCategorizationRuleInput,
) -> Result<CategorizationRule, WorkspaceError> {
    categorization_rules::update_categorization_rule(input)
}

#[tauri::command]
pub fn get_ai_adapter_config(path: String) -> Result<AiAdapterConfig, WorkspaceError> {
    ai_adapter::get_ai_adapter_config(path)
}

#[tauri::command]
pub fn configure_ai_adapter(
    input: ConfigureAiAdapterInput,
) -> Result<AiAdapterConfig, WorkspaceError> {
    ai_adapter::configure_ai_adapter(input)
}

#[tauri::command]
pub fn get_ai_context_disclosure(path: String) -> Result<AiContextDisclosure, WorkspaceError> {
    ai_adapter::get_ai_context_disclosure(path)
}

#[tauri::command]
pub fn get_mvp_reports(input: ReportsInput) -> Result<MvpReports, WorkspaceError> {
    reports::get_mvp_reports(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::WorkspaceErrorCode;

    #[test]
    fn create_workspace_command_returns_structured_errors() {
        let error = create_workspace(CreateWorkspaceInput {
            business_name: "".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: ".".to_string(),
        })
        .unwrap_err();

        assert_eq!(error.code, WorkspaceErrorCode::InvalidBusinessName);
    }

    #[test]
    fn create_and_open_workspace_through_commands() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let opened = open_workspace(created.root_path).unwrap();
        assert_eq!(opened.business_name, "Acme Studio");
    }

    #[test]
    fn add_source_account_command_updates_workspace() {
        let tempdir = tempfile::tempdir().unwrap();
        let created = create_workspace(CreateWorkspaceInput {
            business_name: "Acme Studio".to_string(),
            base_currency: "USD".to_string(),
            books_start_date: "2026-01-01".to_string(),
            parent_directory: tempdir.path().to_string_lossy().to_string(),
        })
        .unwrap();

        let updated = add_source_account(AddSourceAccountInput {
            workspace_root_path: created.root_path,
            kind: crate::workspace::source_accounts::SourceAccountKind::CreditCard,
            name: "Business Card".to_string(),
            opening_balance: None,
        })
        .unwrap();

        assert_eq!(updated.ledger_status, crate::workspace::LedgerStatus::Valid);
    }
}
