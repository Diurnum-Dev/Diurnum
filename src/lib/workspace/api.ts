import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type {
  AddSourceAccountInput,
  AiAdapterConfig,
  AiContextDisclosure,
  ApproveSuggestedEntryInput,
  ApproveTransferEntryInput,
  BrokenProvenance,
  CategorizationRule,
  ConfigureAiAdapterInput,
  CreateCategorizationRuleInput,
  CsvImportInput,
  CsvImportResult,
  LedgerValidationSummary,
  MvpReports,
  ReportsInput,
  SuggestedEntry,
  UpdateCategorizationRuleInput,
  WorkspaceCreateInput,
  WorkspaceSummary,
} from "./types";

type WorkspaceApi = {
  createWorkspace: (input: WorkspaceCreateInput) => Promise<WorkspaceSummary>;
  openWorkspace: (path: string) => Promise<WorkspaceSummary>;
  validateWorkspace: (path: string) => Promise<LedgerValidationSummary>;
  addSourceAccount: (input: AddSourceAccountInput) => Promise<WorkspaceSummary>;
  importStatementRows: (input: CsvImportInput) => Promise<CsvImportResult>;
  getSuggestedEntries: (path: string) => Promise<SuggestedEntry[]>;
  getBrokenProvenance: (path: string) => Promise<BrokenProvenance[]>;
  approveSuggestedEntry: (input: ApproveSuggestedEntryInput) => Promise<WorkspaceSummary>;
  approveTransferEntry: (input: ApproveTransferEntryInput) => Promise<WorkspaceSummary>;
  listCategorizationRules: (path: string) => Promise<CategorizationRule[]>;
  createCategorizationRule: (
    input: CreateCategorizationRuleInput,
  ) => Promise<CategorizationRule>;
  updateCategorizationRule: (
    input: UpdateCategorizationRuleInput,
  ) => Promise<CategorizationRule>;
  getAiAdapterConfig: (path: string) => Promise<AiAdapterConfig>;
  configureAiAdapter: (input: ConfigureAiAdapterInput) => Promise<AiAdapterConfig>;
  getAiContextDisclosure: (path: string) => Promise<AiContextDisclosure>;
  getMvpReports: (input: ReportsInput) => Promise<MvpReports>;
  pickDirectory: () => Promise<string | null>;
  revealWorkspace: (path: string) => Promise<void>;
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

export async function validateWorkspace(
  path: string,
): Promise<LedgerValidationSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.validateWorkspace(path);
  }
  return invoke<LedgerValidationSummary>("validate_workspace", { path });
}

export async function addSourceAccount(
  input: AddSourceAccountInput,
): Promise<WorkspaceSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.addSourceAccount(input);
  }
  return invoke<WorkspaceSummary>("add_source_account", { input });
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
): Promise<WorkspaceSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.approveSuggestedEntry(input);
  }
  return invoke<WorkspaceSummary>("approve_suggested_entry", { input });
}

export async function approveTransferEntry(
  input: ApproveTransferEntryInput,
): Promise<WorkspaceSummary> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.approveTransferEntry(input);
  }
  return invoke<WorkspaceSummary>("approve_transfer_entry", { input });
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

export async function getMvpReports(input: ReportsInput): Promise<MvpReports> {
  if (window.__DIURNUM_TEST_API__) {
    return window.__DIURNUM_TEST_API__.getMvpReports(input);
  }
  return invoke<MvpReports>("get_mvp_reports", { input });
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
