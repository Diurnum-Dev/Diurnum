use crate::workspace::ai_adapter::{
    self, AiAdapterConfig, AiContextDisclosure, ConfigureAiAdapterInput,
};
use crate::workspace::approval::{
    self, ApproveSuggestedEntryInput, ApproveTransferEntryInput, BrokenProvenance,
    RevertTransferToStandardInput, SuggestedEntry,
};
use crate::workspace::categorization_rules::{
    self, CategorizationRule, CreateCategorizationRuleInput, UpdateCategorizationRuleInput,
};
use crate::workspace::create;
use crate::workspace::data_integrity::{
    self, RestoreSnapshotInput, SaveLedgerFileInput, SnapshotSummary,
};
use crate::workspace::documents::{
    self, CreateDocumentFolderInput, DeleteDocumentEntryInput, DocumentFileSummary,
    DocumentFolderSummary, DocumentPreview, DocumentsState, DocumentsStateInput,
    ImportDocumentFileInput, ReadDocumentPreviewInput, RenameDocumentEntryInput,
};
use crate::workspace::git::{
    self, CommitWorkspaceChangesInput, GitCommitDiff, GitCommitResult, GitCommitSummary,
    GitPanelState,
};
use crate::workspace::imports::{
    self, CsvImportAnalysis, CsvImportAnalysisInput, CsvImportInput, CsvImportResult,
};
use crate::workspace::ledger_editor::{
    self, AccountContextHintsInput, EntryDescription, LedgerEditorState, LedgerFileSnapshot,
    PredictiveEntryCompletion, PredictiveEntryCompletionInput, ReadLedgerFileInput,
    SaveLedgerEditorSessionInput,
};
use crate::workspace::open;
use crate::workspace::reports::{self, MvpReports, ReportsInput};
use crate::workspace::settings::{
    self, CloseSourceAccountInput, DetectedAiAdapter, GitIdentitySummary, RenameSourceAccountInput,
    SourceAccountSummary, SourceMappingSummary, TestAiAdapterInput, UpdateGitIdentityInput,
    UpdateSourceAccountOpeningBalanceInput, UpdateSourceMappingInput, UpdateWorkspaceMetadataInput,
};
use crate::workspace::shell::{self, WorkspaceGitStatus, WorkspacePathStatus};
use crate::workspace::source_accounts::{self, AddSourceAccountInput};
use crate::workspace::types::{CreateWorkspaceInput, LedgerValidationSummary, WorkspaceSummary};
use crate::workspace::validation;
use crate::workspace::view::{self, WorkspaceView};
use crate::workspace::WorkspaceError;

#[tauri::command]
pub fn get_workspace_view(path: String) -> Result<WorkspaceView, WorkspaceError> {
    view::load(path)
}

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
pub fn restore_snapshot(input: RestoreSnapshotInput) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(data_integrity::restore_snapshot(input)?)
}

#[tauri::command]
pub fn save_ledger_file(
    input: SaveLedgerFileInput,
) -> Result<LedgerValidationSummary, WorkspaceError> {
    data_integrity::save_ledger_file(input)
}

#[tauri::command]
pub fn get_ledger_editor_state(path: String) -> Result<LedgerEditorState, WorkspaceError> {
    ledger_editor::get_ledger_editor_state(path)
}

#[tauri::command]
pub fn read_ledger_file(input: ReadLedgerFileInput) -> Result<LedgerFileSnapshot, WorkspaceError> {
    ledger_editor::read_ledger_file(input)
}

#[tauri::command]
pub fn save_ledger_editor_session(
    input: SaveLedgerEditorSessionInput,
) -> Result<crate::workspace::LedgerEditorSession, WorkspaceError> {
    ledger_editor::save_ledger_editor_session(input)
}

#[tauri::command]
pub fn get_documents_state(input: DocumentsStateInput) -> Result<DocumentsState, WorkspaceError> {
    documents::get_documents_state(input)
}

#[tauri::command]
pub fn create_document_folder(
    input: CreateDocumentFolderInput,
) -> Result<DocumentFolderSummary, WorkspaceError> {
    documents::create_document_folder(input)
}

#[tauri::command]
pub fn import_document_file(
    input: ImportDocumentFileInput,
) -> Result<DocumentFileSummary, WorkspaceError> {
    documents::import_document_file(input)
}

#[tauri::command]
pub fn rename_document_entry(input: RenameDocumentEntryInput) -> Result<(), WorkspaceError> {
    documents::rename_document_entry(input)
}

#[tauri::command]
pub fn delete_document_entry(input: DeleteDocumentEntryInput) -> Result<(), WorkspaceError> {
    documents::delete_document_entry(input)
}

#[tauri::command]
pub fn read_document_preview(
    input: ReadDocumentPreviewInput,
) -> Result<DocumentPreview, WorkspaceError> {
    documents::read_document_preview(input)
}

#[tauri::command]
pub fn get_predictive_entry_completion(
    input: PredictiveEntryCompletionInput,
) -> Result<Option<PredictiveEntryCompletion>, WorkspaceError> {
    ledger_editor::get_predictive_entry_completion(input)
}

#[tauri::command]
pub fn get_account_context_hints(
    input: AccountContextHintsInput,
) -> Result<Vec<String>, WorkspaceError> {
    ledger_editor::get_account_context_hints(&input.workspace_root_path, &input.description)
}

#[tauri::command]
pub fn list_entry_descriptions(
    workspace_root_path: String,
) -> Result<Vec<EntryDescription>, WorkspaceError> {
    ledger_editor::list_entry_descriptions(&workspace_root_path)
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
pub fn get_git_panel_state(path: String) -> Result<GitPanelState, WorkspaceError> {
    git::get_git_panel_state(path)
}

#[tauri::command]
pub fn list_recent_git_commits(path: String) -> Result<Vec<GitCommitSummary>, WorkspaceError> {
    git::list_recent_commits(path, 20)
}

#[tauri::command]
pub fn get_git_commit_diff(
    workspace_root_path: String,
    commit_hash: String,
) -> Result<GitCommitDiff, WorkspaceError> {
    git::get_commit_diff(workspace_root_path, &commit_hash)
}

#[tauri::command]
pub fn commit_git_changes(
    input: CommitWorkspaceChangesInput,
) -> Result<GitCommitResult, WorkspaceError> {
    git::commit_workspace_changes(input)
}

#[tauri::command]
pub fn add_source_account(input: AddSourceAccountInput) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(source_accounts::add_source_account(input)?)
}

#[tauri::command]
pub fn import_statement_rows(input: CsvImportInput) -> Result<CsvImportResult, WorkspaceError> {
    imports::import_statement_rows(input)
}

#[tauri::command]
pub fn analyze_csv_import(
    input: CsvImportAnalysisInput,
) -> Result<CsvImportAnalysis, WorkspaceError> {
    imports::analyze_csv_import(input)
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
) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(approval::approve_suggested_entry(input)?)
}

#[tauri::command]
pub fn approve_transfer_entry(
    input: ApproveTransferEntryInput,
) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(approval::approve_transfer_entry(input)?)
}

#[tauri::command]
pub fn revert_transfer_to_standard(
    input: RevertTransferToStandardInput,
) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(approval::revert_transfer_to_standard(input)?)
}

#[tauri::command]
pub fn get_known_ledger_accounts(path: String) -> Result<Vec<String>, WorkspaceError> {
    approval::get_known_ledger_accounts(path)
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
pub fn disable_categorization_rule(
    workspace_root_path: String,
    id: String,
) -> Result<CategorizationRule, WorkspaceError> {
    categorization_rules::set_categorization_rule_enabled(workspace_root_path, &id, false)
}

#[tauri::command]
pub fn enable_categorization_rule(
    workspace_root_path: String,
    id: String,
) -> Result<CategorizationRule, WorkspaceError> {
    categorization_rules::set_categorization_rule_enabled(workspace_root_path, &id, true)
}

#[tauri::command]
pub fn delete_categorization_rule(
    workspace_root_path: String,
    id: String,
) -> Result<(), WorkspaceError> {
    categorization_rules::delete_categorization_rule(workspace_root_path, &id)
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

#[tauri::command]
pub fn update_workspace_metadata(
    input: UpdateWorkspaceMetadataInput,
) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(settings::update_workspace_metadata(input)?)
}

#[tauri::command]
pub fn list_source_accounts(
    workspace_root_path: String,
) -> Result<Vec<SourceAccountSummary>, WorkspaceError> {
    settings::list_source_accounts(workspace_root_path)
}

#[tauri::command]
pub fn list_source_mappings(
    workspace_root_path: String,
) -> Result<Vec<SourceMappingSummary>, WorkspaceError> {
    settings::list_source_mappings(workspace_root_path)
}

#[tauri::command]
pub fn save_source_mapping(
    input: UpdateSourceMappingInput,
) -> Result<SourceMappingSummary, WorkspaceError> {
    settings::save_source_mapping(input)
}

#[tauri::command]
pub fn rename_source_account(
    input: RenameSourceAccountInput,
) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(settings::rename_source_account(input)?)
}

#[tauri::command]
pub fn close_source_account(
    input: CloseSourceAccountInput,
) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(settings::close_source_account(input)?)
}

#[tauri::command]
pub fn update_source_account_opening_balance(
    input: UpdateSourceAccountOpeningBalanceInput,
) -> Result<WorkspaceView, WorkspaceError> {
    view::load_from_summary(settings::update_source_account_opening_balance(input)?)
}

#[tauri::command]
pub fn get_git_identity(workspace_root_path: String) -> Result<GitIdentitySummary, WorkspaceError> {
    settings::get_git_identity(workspace_root_path)
}

#[tauri::command]
pub fn update_git_identity(
    input: UpdateGitIdentityInput,
) -> Result<GitIdentitySummary, WorkspaceError> {
    settings::update_git_identity(input)
}

#[tauri::command]
pub fn detect_ai_adapters() -> Result<Vec<DetectedAiAdapter>, WorkspaceError> {
    settings::detect_ai_adapters()
}

#[tauri::command]
pub fn test_ai_adapter(
    input: TestAiAdapterInput,
) -> Result<Option<crate::workspace::ai_adapter::AiSuggestion>, WorkspaceError> {
    settings::test_ai_adapter(input)
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

        assert_eq!(
            updated.summary.ledger_status,
            crate::workspace::LedgerStatus::Valid
        );
    }
}
