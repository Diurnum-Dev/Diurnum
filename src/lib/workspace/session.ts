import * as workspaceApi from "./api";
import type {
  AddSourceAccountInput,
  AiAdapterConfig,
  ApproveAiAssistBatchInput,
  AiContextDisclosure,
  ApproveSuggestedEntryInput,
  ApproveTransferEntryInput,
  BrokenProvenance,
  CategorizationRule,
  CloseSourceAccountInput,
  ConfigureAiAdapterInput,
  CreateCategorizationRuleInput,
  CsvImportInput,
  DetectedAiAdapter,
  GitIdentitySummary,
  GitPanelState,
  LedgerValidationSummary,
  MvpReports,
  RenameSourceAccountInput,
  ReportsInput,
  RestoreSnapshotInput,
  RevertAiAssistBatchInput,
  RevertTransferToStandardInput,
  SnapshotSummary,
  SourceAccountSummary,
  SourceMappingUpdateInput,
  SuggestedEntry,
  TestAiAdapterInput,
  UpdateCategorizationRuleInput,
  UpdateGitIdentityInput,
  UpdateSourceAccountOpeningBalanceInput,
  WorkspaceCreateInput,
  WorkspaceGitStatus,
  WorkspaceMetadataUpdateInput,
  WorkspaceSummary,
  WorkspaceView,
} from "./types";

/**
 * The injectable backend the session talks to. The same `__DIURNUM_TEST_API__`
 * fake used elsewhere satisfies this, so the session — and its refresh
 * invariant — is testable with zero React.
 */
export type WorkspaceSessionApi = Pick<
  typeof workspaceApi,
  | "createWorkspace"
  | "openWorkspace"
  | "getWorkspaceView"
  | "getAiAdapterConfig"
  | "getAiContextDisclosure"
  | "detectAiAdapters"
  | "getGitIdentity"
  | "approveSuggestedEntry"
  | "approveTransferEntry"
  | "revertTransferToStandard"
  | "approveAiAssistBatch"
  | "revertAiAssistBatch"
  | "importStatementRows"
  | "addSourceAccount"
  | "renameSourceAccount"
  | "closeSourceAccount"
  | "updateSourceAccountOpeningBalance"
  | "updateWorkspaceMetadata"
  | "restoreSnapshot"
  | "saveSourceMapping"
  | "createCategorizationRule"
  | "updateCategorizationRule"
  | "enableCategorizationRule"
  | "disableCategorizationRule"
  | "deleteCategorizationRule"
  | "configureAiAdapter"
  | "testAiAdapter"
  | "updateGitIdentity"
  | "getMvpReports"
  | "commitGitChanges"
>;

export type RuleOfferData = {
  sourceAccount: string;
  matchText: string;
  ledgerAccount: string;
};

export type ApproveResult = {
  approvedRowId: string;
  ruleOffer: RuleOfferData | null;
};

/** Everything the UI reads about the open Workspace. Owned in one place. */
export type WorkspaceSessionState = {
  workspace: WorkspaceSummary | null;
  suggestedEntries: SuggestedEntry[];
  knownAccounts: string[];
  brokenProvenance: BrokenProvenance[];
  categorizationRules: CategorizationRule[];
  sourceAccounts: SourceAccountSummary[];
  snapshots: SnapshotSummary[];
  gitStatus: WorkspaceGitStatus;
  gitPanelState: GitPanelState | null;
  aiAdapterConfig: AiAdapterConfig;
  aiContextDisclosure: AiContextDisclosure;
  detectedAdapters: DetectedAiAdapter[];
  gitIdentity: GitIdentitySummary;
  reports: MvpReports | null;
  gitWarning: string | null;
  gitHookOutput: string | null;
  error: string | null;
};

export type WorkspaceSession = {
  getState: () => WorkspaceSessionState;
  subscribe: (listener: () => void) => () => void;
  create: (input: WorkspaceCreateInput) => Promise<void>;
  open: (path: string) => Promise<void>;
  close: () => Promise<void>;
  approve: (input: ApproveSuggestedEntryInput) => Promise<ApproveResult>;
  approveAiAssistBatch: (input: ApproveAiAssistBatchInput) => Promise<void>;
  revertAiAssistBatch: (input: RevertAiAssistBatchInput) => Promise<void>;
  approveTransfer: (
    input: ApproveTransferEntryInput,
  ) => Promise<{ approvedRowId: string }>;
  revertTransfer: (input: RevertTransferToStandardInput) => Promise<void>;
  importRows: (input: CsvImportInput) => Promise<void>;
  addSourceAccount: (input: AddSourceAccountInput) => Promise<void>;
  renameSourceAccount: (input: RenameSourceAccountInput) => Promise<void>;
  closeSourceAccount: (input: CloseSourceAccountInput) => Promise<void>;
  updateOpeningBalance: (
    input: UpdateSourceAccountOpeningBalanceInput,
  ) => Promise<void>;
  saveSourceMapping: (input: SourceMappingUpdateInput) => Promise<void>;
  updateMetadata: (input: WorkspaceMetadataUpdateInput) => Promise<void>;
  restoreSnapshot: (input: RestoreSnapshotInput) => Promise<void>;
  validate: () => Promise<void>;
  createRule: (input: CreateCategorizationRuleInput) => Promise<void>;
  updateRule: (input: UpdateCategorizationRuleInput) => Promise<void>;
  enableRule: (workspaceRootPath: string, id: string) => Promise<void>;
  disableRule: (workspaceRootPath: string, id: string) => Promise<void>;
  deleteRule: (workspaceRootPath: string, id: string) => Promise<void>;
  configureAiAdapter: (command: string | null) => Promise<void>;
  testAiAdapter: () => Promise<void>;
  updateGitIdentity: (input: UpdateGitIdentityInput) => Promise<void>;
  loadReports: (input: { periodStart: string; periodEnd: string }) => Promise<void>;
  commit: (message: string, paths?: string[]) => Promise<void>;
  /** Cheap, no backend call — fold a Ledger Editor inline-validation result into the open workspace. */
  applyLedgerValidation: (validation: LedgerValidationSummary) => void;
  /** A Ledger Editor save landed: refresh the view (git included) and queue a backup. */
  notifyLedgerSaved: () => Promise<void>;
  setError: (error: string | null) => void;
  setGitWarning: (warning: string | null) => void;
  setGitHookOutput: (output: string | null) => void;
};

const EMPTY_GIT_STATUS: WorkspaceGitStatus = {
  isRepository: false,
  branchName: null,
  uncommittedChangesCount: 0,
};

const EMPTY_GIT_IDENTITY: GitIdentitySummary = {
  isRepository: false,
  localName: null,
  localEmail: null,
  globalName: null,
  globalEmail: null,
  warning: null,
};

function freshState(): WorkspaceSessionState {
  return {
    workspace: null,
    suggestedEntries: [],
    knownAccounts: [],
    brokenProvenance: [],
    categorizationRules: [],
    sourceAccounts: [],
    snapshots: [],
    gitStatus: EMPTY_GIT_STATUS,
    gitPanelState: null,
    aiAdapterConfig: { command: null },
    aiContextDisclosure: { adapterConfigured: false, fieldsSent: [] },
    detectedAdapters: [],
    gitIdentity: EMPTY_GIT_IDENTITY,
    reports: null,
    gitWarning: null,
    gitHookOutput: null,
    error: null,
  };
}

const GIT_BACKUP_DELAY_MS = 60_000;

export function userFacingError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes("not an App-Created Workspace")) {
      return "This folder is not a Diurnum workspace.";
    }
    return message;
  }
  return "Diurnum could not complete that Workspace action.";
}

export function monthlyLedgerPath(postedDate: string): string {
  return `transactions/${postedDate.slice(0, 7)}.bean`;
}

export function createWorkspaceSession(api: WorkspaceSessionApi): WorkspaceSession {
  let state: WorkspaceSessionState = freshState();
  const listeners = new Set<() => void>();
  let gitBackupTimer: ReturnType<typeof setTimeout> | null = null;

  function emit() {
    for (const listener of listeners) listener();
  }

  function set(patch: Partial<WorkspaceSessionState>) {
    state = { ...state, ...patch };
    emit();
  }

  function getState() {
    return state;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  // Applies a refreshed view as one unit, holding the domain rule that MVP
  // Reports are unavailable during Invalid Ledger State.
  function applyView(view: WorkspaceView) {
    const reports = view.summary.ledgerStatus === "invalid" ? null : state.reports;
    set({
      workspace: view.summary,
      suggestedEntries: view.suggestedEntries,
      knownAccounts: view.knownAccounts,
      brokenProvenance: view.brokenProvenance,
      categorizationRules: view.categorizationRules,
      sourceAccounts: view.sourceAccounts,
      snapshots: view.snapshots,
      gitStatus: view.gitStatus,
      gitPanelState: view.gitPanel,
      reports,
    });
  }

  async function refreshView() {
    const workspace = state.workspace;
    if (!workspace) return;
    applyView(await api.getWorkspaceView(workspace.rootPath));
  }

  async function loadOpenTimeExtras(path: string) {
    const [aiAdapterConfig, aiContextDisclosure, detectedAdapters, gitIdentity] =
      await Promise.all([
        api.getAiAdapterConfig(path),
        api.getAiContextDisclosure(path),
        api.detectAiAdapters(),
        api.getGitIdentity(path),
      ]);
    set({ aiAdapterConfig, aiContextDisclosure, detectedAdapters, gitIdentity });
  }

  function clearGitBackup() {
    if (gitBackupTimer !== null) {
      clearTimeout(gitBackupTimer);
      gitBackupTimer = null;
    }
  }

  function queueGitBackup() {
    const workspace = state.workspace;
    if (!workspace || !state.gitStatus.isRepository) return;
    clearGitBackup();
    gitBackupTimer = setTimeout(() => {
      void commit(`workspace backup ${new Date().toISOString()}`);
    }, GIT_BACKUP_DELAY_MS);
  }

  async function commit(message: string, paths: string[] = []) {
    const workspace = state.workspace;
    if (!workspace || !state.gitStatus.isRepository) return;
    clearGitBackup();
    set({ gitWarning: null, gitHookOutput: null });
    const commitPaths =
      paths.length > 0
        ? paths
        : state.gitPanelState?.workingTree
            .map((entry) => entry.path)
            .filter((path) => !path.startsWith(".diurnum/")) ?? [];
    if (commitPaths.length === 0) return;
    const result = await api.commitGitChanges({
      workspaceRootPath: workspace.rootPath,
      message,
      paths: commitPaths,
    });
    set({
      gitWarning: result.warning ?? null,
      gitHookOutput: result.warning ? result.hookOutput : null,
    });
    await refreshView();
  }

  async function withErrorReset<T>(fn: () => Promise<T>): Promise<T> {
    set({ error: null });
    try {
      return await fn();
    } catch (caught) {
      set({ error: userFacingError(caught) });
      throw caught;
    }
  }

  return {
    getState,
    subscribe,
    setError: (error) => set({ error }),
    setGitWarning: (gitWarning) => set({ gitWarning }),
    setGitHookOutput: (gitHookOutput) => set({ gitHookOutput }),

    create: (input) =>
      withErrorReset(async () => {
        clearGitBackup();
        set(freshState());
        const created = await api.createWorkspace(input);
        applyView(await api.getWorkspaceView(created.rootPath));
        await loadOpenTimeExtras(created.rootPath);
      }),

    open: (path) =>
      withErrorReset(async () => {
        clearGitBackup();
        set(freshState());
        await api.openWorkspace(path);
        applyView(await api.getWorkspaceView(path));
        await loadOpenTimeExtras(path);
      }),

    close: async () => {
      const workspace = state.workspace;
      if (workspace && state.gitStatus.isRepository) {
        try {
          await commit(`workspace backup ${new Date().toISOString()}`);
        } catch {
          // Closing the Workspace must not be blocked by Git errors.
        }
      }
      clearGitBackup();
      set(freshState());
    },

    approve: (input) =>
      withErrorReset(async () => {
        const approved = state.suggestedEntries.find(
          (entry) => entry.statementRowId === input.statementRowId,
        );
        applyView(await api.approveSuggestedEntry(input));
        queueGitBackup();
        let ruleOffer: RuleOfferData | null = null;
        if (approved) {
          ruleOffer = {
            sourceAccount: approved.sourceAccount,
            matchText: approved.description,
            ledgerAccount: input.ledgerAccount,
          };
          await commit(
            `diurnum: approve 1 entry (${approved.postedDate.slice(0, 7)})`,
            [monthlyLedgerPath(approved.postedDate), "main.bean"],
          );
        }
        return { approvedRowId: input.statementRowId, ruleOffer };
      }),

    approveAiAssistBatch: (input) =>
      withErrorReset(async () => {
        applyView(await api.approveAiAssistBatch(input));
      }),

    revertAiAssistBatch: (input) =>
      withErrorReset(async () => {
        applyView(await api.revertAiAssistBatch(input));
      }),

    approveTransfer: (input) =>
      withErrorReset(async () => {
        const approved = state.suggestedEntries.find(
          (entry) => entry.statementRowId === input.statementRowId,
        );
        applyView(await api.approveTransferEntry(input));
        queueGitBackup();
        if (approved) {
          await commit(
            `diurnum: approve 2 entries (${approved.postedDate.slice(0, 7)})`,
            [monthlyLedgerPath(approved.postedDate), "main.bean"],
          );
        }
        return { approvedRowId: input.statementRowId };
      }),

    revertTransfer: (input) =>
      withErrorReset(async () => {
        applyView(await api.revertTransferToStandard(input));
      }),

    importRows: (input) =>
      withErrorReset(async () => {
        await api.importStatementRows(input);
        await refreshView();
        set({
          aiContextDisclosure: await api.getAiContextDisclosure(
            input.workspaceRootPath,
          ),
        });
        queueGitBackup();
      }),

    addSourceAccount: (input) =>
      withErrorReset(async () => {
        applyView(await api.addSourceAccount(input));
        queueGitBackup();
      }),

    renameSourceAccount: (input) =>
      withErrorReset(async () => {
        applyView(await api.renameSourceAccount(input));
        queueGitBackup();
      }),

    closeSourceAccount: (input) =>
      withErrorReset(async () => {
        applyView(await api.closeSourceAccount(input));
        queueGitBackup();
      }),

    updateOpeningBalance: (input) =>
      withErrorReset(async () => {
        applyView(await api.updateSourceAccountOpeningBalance(input));
        queueGitBackup();
      }),

    saveSourceMapping: (input) =>
      withErrorReset(async () => {
        await api.saveSourceMapping(input);
        await refreshView();
      }),

    updateMetadata: (input) =>
      withErrorReset(async () => {
        applyView(await api.updateWorkspaceMetadata(input));
        const [detectedAdapters, gitIdentity] = await Promise.all([
          api.detectAiAdapters(),
          api.getGitIdentity(input.workspaceRootPath),
        ]);
        set({ detectedAdapters, gitIdentity });
        queueGitBackup();
      }),

    restoreSnapshot: (input) =>
      withErrorReset(async () => {
        applyView(await api.restoreSnapshot(input));
        await loadOpenTimeExtras(input.workspaceRootPath);
        queueGitBackup();
      }),

    validate: () =>
      withErrorReset(async () => {
        await refreshView();
      }),

    createRule: (input) =>
      withErrorReset(async () => {
        await api.createCategorizationRule(input);
        await refreshView();
      }),

    updateRule: (input) =>
      withErrorReset(async () => {
        await api.updateCategorizationRule(input);
        await refreshView();
      }),

    enableRule: (workspaceRootPath, id) =>
      withErrorReset(async () => {
        await api.enableCategorizationRule(workspaceRootPath, id);
        await refreshView();
      }),

    disableRule: (workspaceRootPath, id) =>
      withErrorReset(async () => {
        await api.disableCategorizationRule(workspaceRootPath, id);
        await refreshView();
      }),

    deleteRule: (workspaceRootPath, id) =>
      withErrorReset(async () => {
        await api.deleteCategorizationRule(workspaceRootPath, id);
        await refreshView();
      }),

    configureAiAdapter: (command) =>
      withErrorReset(async () => {
        const workspace = state.workspace;
        if (!workspace) return;
        const config = await api.configureAiAdapter({
          workspaceRootPath: workspace.rootPath,
          command,
        });
        set({
          aiAdapterConfig: config,
          aiContextDisclosure: await api.getAiContextDisclosure(workspace.rootPath),
        });
        await refreshView();
      }),

    testAiAdapter: () =>
      withErrorReset(async () => {
        const workspace = state.workspace;
        if (!workspace) return;
        await api.testAiAdapter({ workspaceRootPath: workspace.rootPath } as TestAiAdapterInput);
      }),

    updateGitIdentity: (input) =>
      withErrorReset(async () => {
        set({ gitIdentity: await api.updateGitIdentity(input) });
      }),

    loadReports: (input) =>
      withErrorReset(async () => {
        const workspace = state.workspace;
        if (!workspace) return;
        set({
          reports: await api.getMvpReports({
            workspaceRootPath: workspace.rootPath,
            ...input,
          } as ReportsInput),
        });
      }),

    commit: (message, paths) => withErrorReset(() => commit(message, paths)),

    applyLedgerValidation: (validation) => {
      const workspace = state.workspace;
      if (!workspace) return;
      set({
        workspace: {
          ...workspace,
          ledgerStatus: validation.status,
          ledgerValidation: validation,
        },
        reports: validation.status === "invalid" ? null : state.reports,
      });
    },

    notifyLedgerSaved: () =>
      withErrorReset(async () => {
        await refreshView();
        queueGitBackup();
      }),
  };
}

/** Production session wired to the real Tauri bridge. */
export function createDefaultWorkspaceSession(): WorkspaceSession {
  return createWorkspaceSession(workspaceApi);
}
