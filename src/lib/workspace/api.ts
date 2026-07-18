import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type {
  AddSourceAccountInput,
  AiAdapterConfig,
  AiAssistBatchSummary,
  AiAssistPassState,
  AiContextDisclosure,
  ApproveAiAssistBatchInput,
  ApproveSuggestedEntryInput,
  ApproveTransferEntryInput,
  RevertTransferToStandardInput,
  CommitGitChangesInput,
  CloseSourceAccountInput,
  DetectedAiAdapter,
  BrokenProvenance,
  CategorizationRule,
  CsvImportAnalysis,
  CsvImportAnalysisInput,
  EntryDescription,
  GitCommitDiff,
  GitCommitResult,
  GitCommitSummary,
  GitPanelState,
  GitIdentitySummary,
  ConfigureAiAdapterInput,
  CreateCategorizationRuleInput,
  CreateDocumentFolderInput,
  CsvImportInput,
  CsvImportResult,
  DeleteDocumentEntryInput,
  DocumentFileSummary,
  DocumentFolderSummary,
  DocumentPreview,
  DocumentsState,
  DocumentsStateInput,
  LedgerValidationSummary,
  LedgerEditorSession,
  LedgerEditorState,
  LedgerFileSnapshot,
  ImportDocumentFileInput,
  MvpReports,
  PredictiveEntryCompletion,
  PredictiveEntryCompletionInput,
  ReadLedgerFileInput,
  ReadDocumentPreviewInput,
  RenameDocumentEntryInput,
  RenameSourceAccountInput,
  RevertAiAssistBatchInput,
  ReportsInput,
  RestoreSnapshotInput,
  SaveLedgerFileInput,
  SaveLedgerEditorSessionInput,
  SourceAccountSummary,
  SourceMappingSummary,
  SourceMappingUpdateInput,
  SnapshotSummary,
  SuggestedEntry,
  ValidateLedgerBufferInput,
  TestAiAdapterInput,
  UpdateCategorizationRuleInput,
  UpdateGitIdentityInput,
  UpdateSourceAccountOpeningBalanceInput,
  WorkspaceMetadataUpdateInput,
  WorkspaceCreateInput,
  WorkspaceGitStatus,
  WorkspacePathStatus,
  WorkspaceSummary,
  WorkspaceView,
} from "./types";

type WorkspaceApi = {
  createWorkspace: (input: WorkspaceCreateInput) => Promise<WorkspaceSummary>;
  openWorkspace: (path: string) => Promise<WorkspaceSummary>;
  getWorkspaceView: (path: string) => Promise<WorkspaceView>;
  validateWorkspace: (path: string) => Promise<LedgerValidationSummary>;
  // Optional so existing test doubles keep working; falls back to validateWorkspace.
  validateLedgerBuffer?: (
    input: ValidateLedgerBufferInput,
  ) => Promise<LedgerValidationSummary>;
  listSnapshots: (path: string) => Promise<SnapshotSummary[]>;
  restoreSnapshot: (input: RestoreSnapshotInput) => Promise<WorkspaceView>;
  saveLedgerFile: (input: SaveLedgerFileInput) => Promise<LedgerValidationSummary>;
  getLedgerEditorState: (path: string) => Promise<LedgerEditorState>;
  readLedgerFile: (input: ReadLedgerFileInput) => Promise<LedgerFileSnapshot>;
  saveLedgerEditorSession: (
    input: SaveLedgerEditorSessionInput,
  ) => Promise<LedgerEditorSession>;
  analyzeCsvImport: (input: CsvImportAnalysisInput) => Promise<CsvImportAnalysis>;
  getDocumentsState: (input: DocumentsStateInput) => Promise<DocumentsState>;
  createDocumentFolder: (
    input: CreateDocumentFolderInput,
  ) => Promise<DocumentFolderSummary>;
  importDocumentFile: (input: ImportDocumentFileInput) => Promise<DocumentFileSummary>;
  renameDocumentEntry: (input: RenameDocumentEntryInput) => Promise<void>;
  deleteDocumentEntry: (input: DeleteDocumentEntryInput) => Promise<void>;
  readDocumentPreview: (input: ReadDocumentPreviewInput) => Promise<DocumentPreview>;
  getPredictiveEntryCompletion: (
    input: PredictiveEntryCompletionInput,
  ) => Promise<PredictiveEntryCompletion | null>;
  inspectWorkspacePaths: (paths: string[]) => Promise<WorkspacePathStatus[]>;
  getWorkspaceGitStatus: (path: string) => Promise<WorkspaceGitStatus>;
  getGitPanelState: (path: string) => Promise<GitPanelState>;
  listRecentGitCommits: (path: string) => Promise<GitCommitSummary[]>;
  getGitCommitDiff: (workspaceRootPath: string, commitHash: string) => Promise<GitCommitDiff>;
  commitGitChanges: (input: CommitGitChangesInput) => Promise<GitCommitResult>;
  addSourceAccount: (input: AddSourceAccountInput) => Promise<WorkspaceView>;
  importStatementRows: (input: CsvImportInput) => Promise<CsvImportResult>;
  getSuggestedEntries: (path: string) => Promise<SuggestedEntry[]>;
  getBrokenProvenance: (path: string) => Promise<BrokenProvenance[]>;
  approveSuggestedEntry: (input: ApproveSuggestedEntryInput) => Promise<WorkspaceView>;
  approveTransferEntry: (input: ApproveTransferEntryInput) => Promise<WorkspaceView>;
  revertTransferToStandard: (input: RevertTransferToStandardInput) => Promise<WorkspaceView>;
  getKnownLedgerAccounts: (path: string) => Promise<string[]>;
  listCategorizationRules: (path: string) => Promise<CategorizationRule[]>;
  createCategorizationRule: (
    input: CreateCategorizationRuleInput,
  ) => Promise<CategorizationRule>;
  updateCategorizationRule: (
    input: UpdateCategorizationRuleInput,
  ) => Promise<CategorizationRule>;
  disableCategorizationRule: (
    workspaceRootPath: string,
    id: string,
  ) => Promise<CategorizationRule>;
  enableCategorizationRule: (
    workspaceRootPath: string,
    id: string,
  ) => Promise<CategorizationRule>;
  deleteCategorizationRule: (
    workspaceRootPath: string,
    id: string,
  ) => Promise<void>;
  getAiAdapterConfig: (path: string) => Promise<AiAdapterConfig>;
  configureAiAdapter: (input: ConfigureAiAdapterInput) => Promise<AiAdapterConfig>;
  getAiContextDisclosure: (path: string) => Promise<AiContextDisclosure>;
  startAiAssistPass?: (path: string) => Promise<AiAssistPassState>;
  runAiAssistNextChunk?: (path: string, passId: string) => Promise<AiAssistPassState>;
  getAiAssistPass?: (path: string) => Promise<AiAssistPassState | null>;
  retryAiAssistFailedRows?: (path: string, passId: string) => Promise<AiAssistPassState>;
  dismissAiAssistPass?: (path: string, passId: string) => Promise<void>;
  approveAiAssistBatch?: (input: ApproveAiAssistBatchInput) => Promise<WorkspaceView>;
  listAiAssistBatches?: (path: string) => Promise<AiAssistBatchSummary[]>;
  revertAiAssistBatch?: (input: RevertAiAssistBatchInput) => Promise<WorkspaceView>;
  getMvpReports: (input: ReportsInput) => Promise<MvpReports>;
  updateWorkspaceMetadata: (input: WorkspaceMetadataUpdateInput) => Promise<WorkspaceView>;
  listSourceAccounts: (workspaceRootPath: string) => Promise<SourceAccountSummary[]>;
  listSourceMappings: (workspaceRootPath: string) => Promise<SourceMappingSummary[]>;
  saveSourceMapping: (input: SourceMappingUpdateInput) => Promise<SourceMappingSummary>;
  renameSourceAccount: (input: RenameSourceAccountInput) => Promise<WorkspaceView>;
  closeSourceAccount: (input: CloseSourceAccountInput) => Promise<WorkspaceView>;
  updateSourceAccountOpeningBalance: (
    input: UpdateSourceAccountOpeningBalanceInput,
  ) => Promise<WorkspaceView>;
  getGitIdentity: (workspaceRootPath: string) => Promise<GitIdentitySummary>;
  updateGitIdentity: (input: UpdateGitIdentityInput) => Promise<GitIdentitySummary>;
  detectAiAdapters: () => Promise<DetectedAiAdapter[]>;
  testAiAdapter: (input: TestAiAdapterInput) => Promise<unknown>;
  getAccountContextHints: (workspaceRootPath: string, description: string) => Promise<string[]>;
  listEntryDescriptions: (workspaceRootPath: string) => Promise<EntryDescription[]>;
  pickDirectory: () => Promise<string | null>;
  revealWorkspace: (path: string) => Promise<void>;
  openExternalPath: (path: string) => Promise<void>;
};

declare global {
  interface Window {
    __DIURNUM_TEST_API__?: WorkspaceApi;
  }
}

export async function createWorkspace(
  input: WorkspaceCreateInput,
): Promise<WorkspaceSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.createWorkspace(input);
  }
  return invoke<WorkspaceSummary>("create_workspace", { input });
}

export async function openWorkspace(path: string): Promise<WorkspaceSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.openWorkspace(path);
  }
  return invoke<WorkspaceSummary>("open_workspace", { path });
}

export async function getWorkspaceView(path: string): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getWorkspaceView(path);
  }
  return invoke<WorkspaceView>("get_workspace_view", { path });
}

export async function validateWorkspace(
  path: string,
): Promise<LedgerValidationSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.validateWorkspace(path);
  }
  return invoke<LedgerValidationSummary>("validate_workspace", { path });
}

/// Validates the Workspace as if `contents` were already saved, so the Ledger
/// Editor can lint a dirty buffer instead of the stale file on disk.
export async function validateLedgerBuffer(
  input: ValidateLedgerBufferInput,
): Promise<LedgerValidationSummary> {
  if (window.__DIURNUM_TEST_API__) {
    const testApi = window.__DIURNUM_TEST_API__;
    return testApi.validateLedgerBuffer
      ? testApi.validateLedgerBuffer(input)
      : testApi.validateWorkspace(input.workspaceRootPath);
  }
  return invoke<LedgerValidationSummary>("validate_ledger_buffer", { input });
}

export async function listSnapshots(path: string): Promise<SnapshotSummary[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.listSnapshots(path);
  }
  return invoke<SnapshotSummary[]>("list_snapshots", { path });
}

export async function restoreSnapshot(
  input: RestoreSnapshotInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.restoreSnapshot(input);
  }
  return invoke<WorkspaceView>("restore_snapshot", { input });
}

export async function saveLedgerFile(
  input: SaveLedgerFileInput,
): Promise<LedgerValidationSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.saveLedgerFile(input);
  }
  return invoke<LedgerValidationSummary>("save_ledger_file", { input });
}

export async function getLedgerEditorState(
  path: string,
): Promise<LedgerEditorState> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getLedgerEditorState(path);
  }
  return invoke<LedgerEditorState>("get_ledger_editor_state", { path });
}

export async function readLedgerFile(
  input: ReadLedgerFileInput,
): Promise<LedgerFileSnapshot> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.readLedgerFile(input);
  }
  return invoke<LedgerFileSnapshot>("read_ledger_file", { input });
}

export async function saveLedgerEditorSession(
  input: SaveLedgerEditorSessionInput,
): Promise<LedgerEditorSession> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.saveLedgerEditorSession(input);
  }
  return invoke<LedgerEditorSession>("save_ledger_editor_session", { input });
}

export async function analyzeCsvImport(
  input: CsvImportAnalysisInput,
): Promise<CsvImportAnalysis> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.analyzeCsvImport(input);
  }
  return invoke<CsvImportAnalysis>("analyze_csv_import", { input });
}

export async function getDocumentsState(input: DocumentsStateInput): Promise<DocumentsState> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getDocumentsState(input);
  }
  return invoke<DocumentsState>("get_documents_state", { input });
}

export async function createDocumentFolder(
  input: CreateDocumentFolderInput,
): Promise<DocumentFolderSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.createDocumentFolder(input);
  }
  return invoke<DocumentFolderSummary>("create_document_folder", { input });
}

export async function importDocumentFile(
  input: ImportDocumentFileInput,
): Promise<DocumentFileSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.importDocumentFile(input);
  }
  return invoke<DocumentFileSummary>("import_document_file", { input });
}

export async function renameDocumentEntry(
  input: RenameDocumentEntryInput,
): Promise<void> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.renameDocumentEntry(input);
  }
  await invoke("rename_document_entry", { input });
}

export async function deleteDocumentEntry(
  input: DeleteDocumentEntryInput,
): Promise<void> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.deleteDocumentEntry(input);
  }
  await invoke("delete_document_entry", { input });
}

export async function readDocumentPreview(
  input: ReadDocumentPreviewInput,
): Promise<DocumentPreview> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.readDocumentPreview(input);
  }
  return invoke<DocumentPreview>("read_document_preview", { input });
}

export async function getPredictiveEntryCompletion(
  input: PredictiveEntryCompletionInput,
): Promise<PredictiveEntryCompletion | null> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getPredictiveEntryCompletion(input);
  }
  return invoke<PredictiveEntryCompletion | null>("get_predictive_entry_completion", { input });
}

export async function inspectWorkspacePaths(
  paths: string[],
): Promise<WorkspacePathStatus[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.inspectWorkspacePaths(paths);
  }
  return invoke<WorkspacePathStatus[]>("inspect_workspace_paths", { paths });
}

export async function getWorkspaceGitStatus(
  path: string,
): Promise<WorkspaceGitStatus> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getWorkspaceGitStatus(path);
  }
  return invoke<WorkspaceGitStatus>("get_workspace_git_status", { path });
}

export async function getGitPanelState(
  path: string,
): Promise<GitPanelState> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getGitPanelState(path);
  }
  return invoke<GitPanelState>("get_git_panel_state", { path });
}

export async function listRecentGitCommits(
  path: string,
): Promise<GitCommitSummary[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.listRecentGitCommits(path);
  }
  return invoke<GitCommitSummary[]>("list_recent_git_commits", { path });
}

export async function getGitCommitDiff(
  workspaceRootPath: string,
  commitHash: string,
): Promise<GitCommitDiff> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getGitCommitDiff(workspaceRootPath, commitHash);
  }
  return invoke<GitCommitDiff>("get_git_commit_diff", { workspaceRootPath, commitHash });
}

export async function commitGitChanges(
  input: CommitGitChangesInput,
): Promise<GitCommitResult> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.commitGitChanges(input);
  }
  return invoke<GitCommitResult>("commit_git_changes", { input });
}

export async function addSourceAccount(
  input: AddSourceAccountInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.addSourceAccount(input);
  }
  return invoke<WorkspaceView>("add_source_account", { input });
}

export async function updateWorkspaceMetadata(
  input: WorkspaceMetadataUpdateInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.updateWorkspaceMetadata(input);
  }
  return invoke<WorkspaceView>("update_workspace_metadata", { input });
}

export async function listSourceAccounts(
  workspaceRootPath: string,
): Promise<SourceAccountSummary[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.listSourceAccounts(workspaceRootPath);
  }
  return invoke<SourceAccountSummary[]>("list_source_accounts", { workspaceRootPath });
}

export async function listSourceMappings(
  workspaceRootPath: string,
): Promise<SourceMappingSummary[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.listSourceMappings(workspaceRootPath);
  }
  return invoke<SourceMappingSummary[]>("list_source_mappings", { workspaceRootPath });
}

export async function saveSourceMapping(
  input: SourceMappingUpdateInput,
): Promise<SourceMappingSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.saveSourceMapping(input);
  }
  return invoke<SourceMappingSummary>("save_source_mapping", { input });
}

export async function renameSourceAccount(
  input: RenameSourceAccountInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.renameSourceAccount(input);
  }
  return invoke<WorkspaceView>("rename_source_account", { input });
}

export async function closeSourceAccount(
  input: CloseSourceAccountInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.closeSourceAccount(input);
  }
  return invoke<WorkspaceView>("close_source_account", { input });
}

export async function updateSourceAccountOpeningBalance(
  input: UpdateSourceAccountOpeningBalanceInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.updateSourceAccountOpeningBalance(input);
  }
  return invoke<WorkspaceView>("update_source_account_opening_balance", { input });
}

export async function getGitIdentity(
  workspaceRootPath: string,
): Promise<GitIdentitySummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getGitIdentity(workspaceRootPath);
  }
  return invoke<GitIdentitySummary>("get_git_identity", { workspaceRootPath });
}

export async function updateGitIdentity(
  input: UpdateGitIdentityInput,
): Promise<GitIdentitySummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.updateGitIdentity(input);
  }
  return invoke<GitIdentitySummary>("update_git_identity", { input });
}

export async function detectAiAdapters(): Promise<DetectedAiAdapter[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.detectAiAdapters();
  }
  return invoke<DetectedAiAdapter[]>("detect_ai_adapters");
}

export async function testAiAdapter(
  input: TestAiAdapterInput,
): Promise<unknown> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.testAiAdapter(input);
  }
  return invoke<unknown>("test_ai_adapter", { input });
}

export async function importStatementRows(
  input: CsvImportInput,
): Promise<CsvImportResult> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.importStatementRows(input);
  }
  return invoke<CsvImportResult>("import_statement_rows", { input });
}

export async function getSuggestedEntries(path: string): Promise<SuggestedEntry[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getSuggestedEntries(path);
  }
  return invoke<SuggestedEntry[]>("get_suggested_entries", { path });
}

export async function getBrokenProvenance(
  path: string,
): Promise<BrokenProvenance[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getBrokenProvenance(path);
  }
  return invoke<BrokenProvenance[]>("get_broken_provenance", { path });
}

export async function approveSuggestedEntry(
  input: ApproveSuggestedEntryInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.approveSuggestedEntry(input);
  }
  return invoke<WorkspaceView>("approve_suggested_entry", { input });
}

export async function approveTransferEntry(
  input: ApproveTransferEntryInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.approveTransferEntry(input);
  }
  return invoke<WorkspaceView>("approve_transfer_entry", { input });
}

export async function revertTransferToStandard(
  input: RevertTransferToStandardInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.revertTransferToStandard(input);
  }
  return invoke<WorkspaceView>("revert_transfer_to_standard", { input });
}

export async function getKnownLedgerAccounts(path: string): Promise<string[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getKnownLedgerAccounts(path);
  }
  return invoke<string[]>("get_known_ledger_accounts", { path });
}

export async function listCategorizationRules(
  path: string,
): Promise<CategorizationRule[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.listCategorizationRules(path);
  }
  return invoke<CategorizationRule[]>("list_categorization_rules", { path });
}

export async function createCategorizationRule(
  input: CreateCategorizationRuleInput,
): Promise<CategorizationRule> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.createCategorizationRule(input);
  }
  return invoke<CategorizationRule>("create_categorization_rule", { input });
}

export async function updateCategorizationRule(
  input: UpdateCategorizationRuleInput,
): Promise<CategorizationRule> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.updateCategorizationRule(input);
  }
  return invoke<CategorizationRule>("update_categorization_rule", { input });
}

export async function disableCategorizationRule(
  workspaceRootPath: string,
  id: string,
): Promise<CategorizationRule> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.disableCategorizationRule(workspaceRootPath, id);
  }
  return invoke<CategorizationRule>("disable_categorization_rule", { workspaceRootPath, id });
}

export async function enableCategorizationRule(
  workspaceRootPath: string,
  id: string,
): Promise<CategorizationRule> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.enableCategorizationRule(workspaceRootPath, id);
  }
  return invoke<CategorizationRule>("enable_categorization_rule", { workspaceRootPath, id });
}

export async function deleteCategorizationRule(
  workspaceRootPath: string,
  id: string,
): Promise<void> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.deleteCategorizationRule(workspaceRootPath, id);
  }
  await invoke("delete_categorization_rule", { workspaceRootPath, id });
}

export async function getAiAdapterConfig(path: string): Promise<AiAdapterConfig> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getAiAdapterConfig(path);
  }
  return invoke<AiAdapterConfig>("get_ai_adapter_config", { path });
}

export async function configureAiAdapter(
  input: ConfigureAiAdapterInput,
): Promise<AiAdapterConfig> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.configureAiAdapter(input);
  }
  return invoke<AiAdapterConfig>("configure_ai_adapter", { input });
}

export async function getAiContextDisclosure(
  path: string,
): Promise<AiContextDisclosure> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getAiContextDisclosure(path);
  }
  return invoke<AiContextDisclosure>("get_ai_context_disclosure", { path });
}

export async function startAiAssistPass(path: string): Promise<AiAssistPassState> {
  if (window.__DIURNUM_TEST_API__) {
    const operation = window.__DIURNUM_TEST_API__.startAiAssistPass;
    if (!operation) throw new Error("Test API is missing required operation startAiAssistPass");
    return operation(path);
  }
  return invoke<AiAssistPassState>("start_ai_assist_pass", { path });
}

export async function runAiAssistNextChunk(
  path: string,
  passId: string,
): Promise<AiAssistPassState> {
  if (window.__DIURNUM_TEST_API__) {
    const operation = window.__DIURNUM_TEST_API__.runAiAssistNextChunk;
    if (!operation) throw new Error("Test API is missing required operation runAiAssistNextChunk");
    return operation(path, passId);
  }
  return invoke<AiAssistPassState>("run_ai_assist_next_chunk", { path, passId });
}

export async function getAiAssistPass(path: string): Promise<AiAssistPassState | null> {
  if (window.__DIURNUM_TEST_API__) {
    return (await window.__DIURNUM_TEST_API__.getAiAssistPass?.(path)) ?? null;
  }
  return invoke<AiAssistPassState | null>("get_ai_assist_pass", { path });
}

export async function retryAiAssistFailedRows(
  path: string,
  passId: string,
): Promise<AiAssistPassState> {
  if (window.__DIURNUM_TEST_API__) {
    const operation = window.__DIURNUM_TEST_API__.retryAiAssistFailedRows;
    if (!operation) {
      throw new Error("Test API is missing required operation retryAiAssistFailedRows");
    }
    return operation(path, passId);
  }
  return invoke<AiAssistPassState>("retry_ai_assist_failed_rows", { path, passId });
}

export async function dismissAiAssistPass(path: string, passId: string): Promise<void> {
  if (window.__DIURNUM_TEST_API__) {
    const operation = window.__DIURNUM_TEST_API__.dismissAiAssistPass;
    if (!operation) throw new Error("Test API is missing required operation dismissAiAssistPass");
    return operation(path, passId);
  }
  await invoke("dismiss_ai_assist_pass", { path, passId });
}

export async function approveAiAssistBatch(
  input: ApproveAiAssistBatchInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    const operation = window.__DIURNUM_TEST_API__.approveAiAssistBatch;
    if (!operation) throw new Error("Test API is missing required operation approveAiAssistBatch");
    return operation(input);
  }
  return invoke<WorkspaceView>("approve_ai_assist_batch", { input });
}

export async function listAiAssistBatches(path: string): Promise<AiAssistBatchSummary[]> {
  if (window.__DIURNUM_TEST_API__) {
    return (await window.__DIURNUM_TEST_API__.listAiAssistBatches?.(path)) ?? [];
  }
  return invoke<AiAssistBatchSummary[]>("list_ai_assist_batches", { path });
}

export async function revertAiAssistBatch(
  input: RevertAiAssistBatchInput,
): Promise<WorkspaceView> {
  if (window.__DIURNUM_TEST_API__) {
    const operation = window.__DIURNUM_TEST_API__.revertAiAssistBatch;
    if (!operation) throw new Error("Test API is missing required operation revertAiAssistBatch");
    return operation(input);
  }
  return invoke<WorkspaceView>("revert_ai_assist_batch", { input });
}

export async function getMvpReports(input: ReportsInput): Promise<MvpReports> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getMvpReports(input);
  }
  return invoke<MvpReports>("get_mvp_reports", { input });
}

export async function getAccountContextHints(
  workspaceRootPath: string,
  description: string,
): Promise<string[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getAccountContextHints?.(workspaceRootPath, description) ?? [];
  }
  return invoke<string[]>("get_account_context_hints", {
    input: { workspaceRootPath, description },
  });
}

export async function listEntryDescriptions(
  workspaceRootPath: string,
): Promise<EntryDescription[]> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.listEntryDescriptions?.(workspaceRootPath) ?? [];
  }
  return invoke<EntryDescription[]>("list_entry_descriptions", { workspaceRootPath });
}

export async function pickDirectory(): Promise<string | null> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.pickDirectory();
  }
  let selected: unknown = null;
  try {
    selected = await openDialog({
      directory: true,
      multiple: false,
    });
  } catch {
    return null;
  }

  return typeof selected === "string" ? selected : null;
}

export async function revealWorkspace(path: string): Promise<void> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.revealWorkspace(path);
  }
  await openPath(path);
}

export async function openExternalPath(path: string): Promise<void> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.openExternalPath(path);
  }
  await openPath(path);
}

export type AppMenuSyncState = {
  workspaceOpen: boolean;
  gitAvailable: boolean;
  recents: Array<{ path: string; displayName: string }>;
};

export async function syncAppMenu(state: AppMenuSyncState): Promise<void> {
  if (window.__DIURNUM_TEST_API__) return;
  await invoke("sync_app_menu", { state });
}
