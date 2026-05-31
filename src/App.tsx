import { useEffect, useState } from "react";
import {
  AppShell,
  type RecentWorkspace,
  type WorkspaceScreen,
} from "./components/AppShell";
import {
  addSourceAccount,
  approveTransferEntry,
  approveSuggestedEntry,
  closeSourceAccount,
  deleteCategorizationRule,
  disableCategorizationRule,
  detectAiAdapters,
  configureAiAdapter,
  createCategorizationRule,
  createWorkspace,
  getGitIdentity,
  getAiAdapterConfig,
  getAiContextDisclosure,
  getBrokenProvenance,
  getMvpReports,
  getSuggestedEntries,
  getWorkspaceGitStatus,
  importStatementRows,
  inspectWorkspacePaths,
  listSnapshots,
  listCategorizationRules,
  listSourceAccounts,
  enableCategorizationRule,
  openWorkspace,
  pickDirectory,
  revealWorkspace,
  restoreSnapshot,
  renameSourceAccount,
  saveSourceMapping,
  testAiAdapter,
  updateGitIdentity,
  updateSourceAccountOpeningBalance,
  updateWorkspaceMetadata,
  updateCategorizationRule,
  validateWorkspace,
} from "./lib/workspace/api";
import type {
  AiAdapterConfig,
  AiContextDisclosure,
  CategorizationRule,
  CsvSourceMappingInput,
  BrokenProvenance,
  CloseSourceAccountInput,
  DetectedAiAdapter,
  GitIdentitySummary,
  MvpReports,
  SnapshotSummary,
  SourceAccountSummary,
  SourceAccountKind,
  SourceMappingUpdateInput,
  SuggestedEntry,
  RenameSourceAccountInput,
  WorkspaceGitStatus,
  LedgerValidationSummary,
  WorkspaceCreateInput,
  UpdateGitIdentityInput,
  UpdateSourceAccountOpeningBalanceInput,
  WorkspaceMetadataUpdateInput,
  WorkspaceSummary,
} from "./lib/workspace/types";
import { CreateWorkspaceForm } from "./features/workspace/CreateWorkspaceForm";
import { InboxPanel } from "./features/workspace/InboxPanel";
import { DocumentsPanel } from "./features/workspace/DocumentsPanel";
import { SettingsPanel } from "./features/workspace/SettingsPanel";
import type { WorkspaceTemplate } from "./features/workspace/CreateWorkspaceForm";
import { LedgerEditor } from "./features/workspace/LedgerEditor";
import { OpenWorkspaceForm } from "./features/workspace/OpenWorkspaceForm";
import { WorkspaceOverview } from "./features/workspace/WorkspaceOverview";
import { WorkspaceStart } from "./features/workspace/WorkspaceStart";
import type { CategorizationRuleOffer } from "./features/workspace/CategorizationRulesPanel";

type View = "start" | "create" | "open" | "workspace";

const RECENT_WORKSPACES_KEY = "diurnum.workspaceRecents.v1";

const emptyGitStatus: WorkspaceGitStatus = {
  isRepository: false,
  branchName: null,
  uncommittedChangesCount: 0,
};

function userFacingError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes("not an App-Created Workspace")) {
      return "This folder is not a Diurnum workspace.";
    }
    return message;
  }
  return "Diurnum could not complete that Workspace action.";
}

export default function App() {
  const [view, setView] = useState<View>("start");
  const [createTemplate, setCreateTemplate] = useState<WorkspaceTemplate>(null);
  const [activeScreen, setActiveScreen] = useState<WorkspaceScreen>("ledger");
  const [ledgerActiveFile, setLedgerActiveFile] = useState("main.bean");
  const [ledgerRequestedFile, setLedgerRequestedFile] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [suggestedEntries, setSuggestedEntries] = useState<SuggestedEntry[]>([]);
  const [brokenProvenance, setBrokenProvenance] = useState<BrokenProvenance[]>([]);
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRule[]>([]);
  const [ruleOffer, setRuleOffer] = useState<CategorizationRuleOffer | null>(null);
  const [aiAdapterConfig, setAiAdapterConfig] = useState<AiAdapterConfig>({ command: null });
  const [aiContextDisclosure, setAiContextDisclosure] = useState<AiContextDisclosure>({
    adapterConfigured: false,
    fieldsSent: [],
  });
  const [sourceAccounts, setSourceAccounts] = useState<SourceAccountSummary[]>([]);
  const [detectedAdapters, setDetectedAdapters] = useState<DetectedAiAdapter[]>([]);
  const [gitIdentity, setGitIdentity] = useState<GitIdentitySummary>({
    isRepository: false,
    localName: null,
    localEmail: null,
    globalName: null,
    globalEmail: null,
    warning: null,
  });
  const [reports, setReports] = useState<MvpReports | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(
    loadRecentWorkspaces,
  );
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus>(emptyGitStatus);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(input: WorkspaceCreateInput) {
    setError(null);
    try {
      const created = await createWorkspace(input);
      setWorkspace(created);
      setSuggestedEntries(await getSuggestedEntries(created.rootPath));
      setBrokenProvenance(await getBrokenProvenance(created.rootPath));
      setCategorizationRules(await listCategorizationRules(created.rootPath));
      setRuleOffer(null);
      setAiAdapterConfig(await getAiAdapterConfig(created.rootPath));
      setAiContextDisclosure(await getAiContextDisclosure(created.rootPath));
      setSourceAccounts(await listSourceAccounts(created.rootPath));
      setDetectedAdapters(await detectAiAdapters());
      setGitIdentity(await getGitIdentity(created.rootPath));
      setReports(null);
      setSnapshots(await listSnapshots(created.rootPath));
      rememberWorkspace(created);
      await refreshGitStatus(created.rootPath);
      setActiveScreen("ledger");
      setLedgerRequestedFile("main.bean");
      setView("workspace");
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleOpenWorkspace(path: string) {
    setError(null);
    try {
      const opened = await openWorkspace(path);
      setWorkspace(opened);
      setSuggestedEntries(await getSuggestedEntries(opened.rootPath));
      setBrokenProvenance(await getBrokenProvenance(opened.rootPath));
      setCategorizationRules(await listCategorizationRules(opened.rootPath));
      setAiAdapterConfig(await getAiAdapterConfig(opened.rootPath));
      setAiContextDisclosure(await getAiContextDisclosure(opened.rootPath));
      setRuleOffer(null);
      setReports(null);
      setSnapshots(await listSnapshots(opened.rootPath));
      setSourceAccounts(await listSourceAccounts(opened.rootPath));
      setDetectedAdapters(await detectAiAdapters());
      setGitIdentity(await getGitIdentity(opened.rootPath));
      rememberWorkspace(opened);
      await refreshGitStatus(opened.rootPath);
      setActiveScreen("ledger");
      setLedgerRequestedFile("main.bean");
      setView("workspace");
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  function handleCreateBlankWorkspace() {
    setError(null);
    setCreateTemplate(null);
    setView("create");
  }

  function handleCreateExampleWorkspace() {
    setError(null);
    setCreateTemplate("example");
    setView("create");
  }

  async function handleWelcomeOpenExistingWorkspace() {
    setError(null);
    const path = await pickDirectory();
    if (path) {
      await handleOpenWorkspace(path);
    }
  }

  async function handleOpenRecentWorkspace(path: string) {
    setSwitcherOpen(false);
    await handleOpenWorkspace(path);
  }

  async function handleOpenExistingWorkspace() {
    setSwitcherOpen(false);
    const path = await pickDirectory();
    if (path) {
      await handleOpenWorkspace(path);
    }
  }

  function handleRemoveRecentWorkspace(path: string) {
    setRecentWorkspaces((current) => {
      const next = current.filter((workspace) => workspace.path !== path);
      saveRecentWorkspaces(next);
      return next;
    });
  }

  function handleNavigate(screen: WorkspaceScreen) {
    if (screen === "git" && !gitStatus.isRepository) return;
    setActiveScreen(screen);
    setSwitcherOpen(false);
  }

  function handleCloseWorkspace() {
    setWorkspace(null);
    setSuggestedEntries([]);
    setBrokenProvenance([]);
    setCategorizationRules([]);
    setRuleOffer(null);
    setAiAdapterConfig({ command: null });
    setAiContextDisclosure({ adapterConfigured: false, fieldsSent: [] });
    setSourceAccounts([]);
    setDetectedAdapters([]);
    setGitIdentity({
      isRepository: false,
      localName: null,
      localEmail: null,
      globalName: null,
      globalEmail: null,
      warning: null,
    });
    setReports(null);
    setSnapshots([]);
    setGitStatus(emptyGitStatus);
    setSwitcherOpen(false);
    setActiveScreen("ledger");
    setLedgerActiveFile("main.bean");
    setLedgerRequestedFile(null);
    setError(null);
    setView("start");
  }

  function handleLedgerValidationChange(validation: LedgerValidationSummary) {
    if (!workspace) return;
    setWorkspace({
      ...workspace,
      ledgerStatus: validation.status,
      ledgerValidation: validation,
    });
    if (validation.status === "invalid") {
      setReports(null);
    }
  }

  async function handleReveal() {
    if (!workspace) return;
    setError(null);
    try {
      await revealWorkspace(workspace.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleValidateWorkspace() {
    if (!workspace) return;
    setError(null);
    try {
      const ledgerValidation = await validateWorkspace(workspace.rootPath);
      setWorkspace({
        ...workspace,
        ledgerStatus: ledgerValidation.status,
        ledgerValidation,
      });
      setBrokenProvenance(await getBrokenProvenance(workspace.rootPath));
      setSnapshots(await listSnapshots(workspace.rootPath));
      await refreshGitStatus(workspace.rootPath);
      if (ledgerValidation.status === "invalid") {
        setReports(null);
      }
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleAddSourceAccount(input: {
    kind: SourceAccountKind;
    name: string;
    openingBalance: string | null;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await addSourceAccount({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setWorkspace(updated);
      setSuggestedEntries(await getSuggestedEntries(updated.rootPath));
      setBrokenProvenance(await getBrokenProvenance(updated.rootPath));
      setCategorizationRules(await listCategorizationRules(updated.rootPath));
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setReports(null);
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleImportStatementRows(input: {
    sourceAccount: string;
    sourceFileName: string;
    csvContents: string;
    mapping: CsvSourceMappingInput;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      await importStatementRows({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      await handleValidateWorkspace();
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
      setBrokenProvenance(await getBrokenProvenance(workspace.rootPath));
      setCategorizationRules(await listCategorizationRules(workspace.rootPath));
      setAiContextDisclosure(await getAiContextDisclosure(workspace.rootPath));
      setSourceAccounts(await listSourceAccounts(workspace.rootPath));
      setReports(null);
      setSnapshots(await listSnapshots(workspace.rootPath));
      await refreshGitStatus(workspace.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleApproveSuggestedEntry(input: {
    statementRowId: string;
    ledgerAccount: string;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await approveSuggestedEntry({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setWorkspace(updated);
      setSuggestedEntries(await getSuggestedEntries(updated.rootPath));
      setBrokenProvenance(await getBrokenProvenance(updated.rootPath));
      setCategorizationRules(await listCategorizationRules(updated.rootPath));
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setReports(null);
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
      const approvedEntry = suggestedEntries.find(
        (entry) => entry.statementRowId === input.statementRowId,
      );
      if (approvedEntry) {
        setLedgerRequestedFile(monthlyLedgerPath(approvedEntry.postedDate));
        setActiveScreen("ledger");
        setRuleOffer({
          sourceAccount: approvedEntry.sourceAccount,
          matchText: approvedEntry.description,
          ledgerAccount: input.ledgerAccount,
        });
      }
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleApproveTransferEntry(input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await approveTransferEntry({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setWorkspace(updated);
      setSuggestedEntries(await getSuggestedEntries(updated.rootPath));
      setBrokenProvenance(await getBrokenProvenance(updated.rootPath));
      setCategorizationRules(await listCategorizationRules(updated.rootPath));
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setRuleOffer(null);
      setReports(null);
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
      const approvedEntry = suggestedEntries.find(
        (entry) => entry.statementRowId === input.statementRowId,
      );
      if (approvedEntry) {
        setLedgerRequestedFile(monthlyLedgerPath(approvedEntry.postedDate));
        setActiveScreen("ledger");
      }
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleCreateCategorizationRule(input: CategorizationRuleOffer) {
    if (!workspace) return;
    setError(null);
    try {
      await createCategorizationRule({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setCategorizationRules(await listCategorizationRules(workspace.rootPath));
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
      setRuleOffer(null);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleUpdateCategorizationRule(
    input: CategorizationRuleOffer & { id: string },
  ) {
    if (!workspace) return;
    setError(null);
    try {
      await updateCategorizationRule({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setCategorizationRules(await listCategorizationRules(workspace.rootPath));
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleDisableCategorizationRule(input: {
    workspaceRootPath: string;
    id: string;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      await disableCategorizationRule(input.workspaceRootPath, input.id);
      setCategorizationRules(await listCategorizationRules(input.workspaceRootPath));
      setSuggestedEntries(await getSuggestedEntries(input.workspaceRootPath));
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleEnableCategorizationRule(input: {
    workspaceRootPath: string;
    id: string;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      await enableCategorizationRule(input.workspaceRootPath, input.id);
      setCategorizationRules(await listCategorizationRules(input.workspaceRootPath));
      setSuggestedEntries(await getSuggestedEntries(input.workspaceRootPath));
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleDeleteCategorizationRule(input: {
    workspaceRootPath: string;
    id: string;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      await deleteCategorizationRule(input.workspaceRootPath, input.id);
      setCategorizationRules(await listCategorizationRules(input.workspaceRootPath));
      setSuggestedEntries(await getSuggestedEntries(input.workspaceRootPath));
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleConfigureAiAdapter(command: string | null) {
    if (!workspace) return;
    setError(null);
    try {
      const config = await configureAiAdapter({
        workspaceRootPath: workspace.rootPath,
        command,
      });
      setAiAdapterConfig(config);
      setAiContextDisclosure(await getAiContextDisclosure(workspace.rootPath));
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleUpdateWorkspaceMetadata(input: WorkspaceMetadataUpdateInput) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await updateWorkspaceMetadata(input);
      setWorkspace(updated);
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setDetectedAdapters(await detectAiAdapters());
      setGitIdentity(await getGitIdentity(updated.rootPath));
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
      throw caught;
    }
  }

  async function handleRenameSourceAccount(input: RenameSourceAccountInput) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await renameSourceAccount(input);
      setWorkspace(updated);
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
      throw caught;
    }
  }

  async function handleCloseSourceAccount(input: CloseSourceAccountInput) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await closeSourceAccount(input);
      setWorkspace(updated);
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
      throw caught;
    }
  }

  async function handleUpdateSourceAccountOpeningBalance(
    input: UpdateSourceAccountOpeningBalanceInput,
  ) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await updateSourceAccountOpeningBalance(input);
      setWorkspace(updated);
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
      throw caught;
    }
  }

  async function handleSaveSourceMapping(input: SourceMappingUpdateInput) {
    if (!workspace) return;
    setError(null);
    try {
      await saveSourceMapping(input);
      setSourceAccounts(await listSourceAccounts(workspace.rootPath));
    } catch (caught) {
      setError(userFacingError(caught));
      throw caught;
    }
  }

  async function handleUpdateGitIdentity(input: UpdateGitIdentityInput) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await updateGitIdentity(input);
      setGitIdentity(updated);
    } catch (caught) {
      setError(userFacingError(caught));
      throw caught;
    }
  }

  async function handleTestAiAdapter() {
    if (!workspace) return;
    setError(null);
    try {
      await testAiAdapter({ workspaceRootPath: workspace.rootPath });
    } catch (caught) {
      setError(userFacingError(caught));
      throw caught;
    }
  }

  async function handleLoadReports(input: { periodStart: string; periodEnd: string }) {
    if (!workspace) return;
    setError(null);
    try {
      setReports(
        await getMvpReports({
          workspaceRootPath: workspace.rootPath,
          ...input,
        }),
      );
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!workspace) return;
    setError(null);
    try {
      const restored = await restoreSnapshot({
        workspaceRootPath: workspace.rootPath,
        snapshotId,
      });
      setWorkspace(restored);
      setSuggestedEntries(await getSuggestedEntries(restored.rootPath));
      setBrokenProvenance(await getBrokenProvenance(restored.rootPath));
      setCategorizationRules(await listCategorizationRules(restored.rootPath));
      setAiAdapterConfig(await getAiAdapterConfig(restored.rootPath));
      setAiContextDisclosure(await getAiContextDisclosure(restored.rootPath));
      setSourceAccounts(await listSourceAccounts(restored.rootPath));
      setDetectedAdapters(await detectAiAdapters());
      setGitIdentity(await getGitIdentity(restored.rootPath));
      setSnapshots(await listSnapshots(restored.rootPath));
      setReports(null);
      setRuleOffer(null);
      await refreshGitStatus(restored.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function refreshGitStatus(path: string) {
    try {
      setGitStatus(await getWorkspaceGitStatus(path));
    } catch {
      setGitStatus(emptyGitStatus);
    }
  }

  function rememberWorkspace(summary: WorkspaceSummary) {
    setRecentWorkspaces((current) => {
      const next = [
        {
          path: summary.rootPath,
          displayName: summary.businessName,
          lastOpenedAt: new Date().toISOString(),
          exists: true,
        },
        ...current.filter((workspace) => workspace.path !== summary.rootPath),
      ].slice(0, 10);
      saveRecentWorkspaces(next);
      return next;
    });
  }

  useEffect(() => {
    if (view !== "workspace" || !workspace) return;

    function revalidateOnFocus() {
      void handleValidateWorkspace();
    }

    window.addEventListener("focus", revalidateOnFocus);
    return () => window.removeEventListener("focus", revalidateOnFocus);
  }, [view, workspace?.rootPath]);

  const recentPathsKey = recentWorkspaces.map((workspace) => workspace.path).join("\n");
  useEffect(() => {
    if (recentWorkspaces.length === 0) return;

    let cancelled = false;
    void inspectWorkspacePaths(recentWorkspaces.map((workspace) => workspace.path))
      .then((statuses) => {
        if (cancelled) return;
        const existsByPath = new Map(statuses.map((status) => [status.path, status.exists]));
        setRecentWorkspaces((current) =>
          current.map((workspace) => ({
            ...workspace,
            exists: existsByPath.get(workspace.path) ?? workspace.exists,
          })),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [recentPathsKey]);

  useEffect(() => {
    if (!gitStatus.isRepository && activeScreen === "git") {
      setActiveScreen("ledger");
    }
  }, [gitStatus.isRepository, activeScreen]);

  if (view === "start") {
    return (
      <main className="main-pane standalone-pane">
        <WorkspaceStart
          recentWorkspaces={recentWorkspaces}
          onCreateBlank={handleCreateBlankWorkspace}
          onCreateExample={handleCreateExampleWorkspace}
          onOpenExisting={handleWelcomeOpenExistingWorkspace}
          onOpenRecentWorkspace={handleOpenRecentWorkspace}
          error={error}
        />
      </main>
    );
  }

  if (view === "create") {
    return (
      <main className="main-pane standalone-pane">
        <CreateWorkspaceForm
          initialTemplate={createTemplate}
          onCancel={() => {
            setError(null);
            setView("start");
          }}
          onChooseDirectory={pickDirectory}
          onCreate={handleCreate}
          error={error}
        />
      </main>
    );
  }

  if (view === "open") {
    return (
      <main className="main-pane standalone-pane">
        <OpenWorkspaceForm
          onCancel={() => {
            setError(null);
            setView("start");
          }}
          onChooseDirectory={pickDirectory}
          onOpen={handleOpenWorkspace}
          error={error}
        />
      </main>
    );
  }

  if (view === "workspace" && workspace) {
    return (
      <AppShell
        workspaceName={workspace.businessName}
        activeScreen={activeScreen}
        pendingInboxCount={suggestedEntries.length}
        recentWorkspaces={recentWorkspaces}
        gitStatus={gitStatus}
        ledgerStatus={workspace.ledgerStatus}
        ledgerErrorCount={workspace.ledgerValidation.errors.length}
        statusContext={activeScreen === "ledger" ? ledgerActiveFile : statusContextFor(activeScreen)}
        switcherOpen={switcherOpen}
        onToggleSwitcher={() => setSwitcherOpen((open) => !open)}
        onNavigate={handleNavigate}
        onOpenRecentWorkspace={handleOpenRecentWorkspace}
        onRemoveRecentWorkspace={handleRemoveRecentWorkspace}
        onOpenExistingWorkspace={handleOpenExistingWorkspace}
        onCloseWorkspace={handleCloseWorkspace}
      >
        {activeScreen === "ledger" ? (
          <LedgerEditor
            workspace={workspace}
            requestedFile={ledgerRequestedFile}
            onActiveFileChange={setLedgerActiveFile}
            onValidationChange={handleLedgerValidationChange}
            onError={setError}
          />
        ) : activeScreen === "inbox" ? (
          <InboxPanel
            suggestedEntries={suggestedEntries}
            ledgerStatus={workspace.ledgerStatus}
            onApprove={handleApproveSuggestedEntry}
            onApproveTransfer={handleApproveTransferEntry}
          />
        ) : activeScreen === "documents" ? (
          <DocumentsPanel workspace={workspace} onError={setError} />
        ) : activeScreen === "settings" ? (
          <SettingsPanel
            workspace={workspace}
            sourceAccounts={sourceAccounts}
            detectedAdapters={detectedAdapters}
            gitIdentity={gitIdentity}
            aiAdapterConfig={aiAdapterConfig}
            aiContextDisclosure={aiContextDisclosure}
            categorizationRules={categorizationRules}
            categorizationRuleOffer={ruleOffer}
            snapshots={snapshots}
            onReveal={handleReveal}
            onOpenAnother={() => {
              setError(null);
              setView("open");
            }}
            onUpdateWorkspaceMetadata={handleUpdateWorkspaceMetadata}
            onAddSourceAccount={handleAddSourceAccount}
            onRenameSourceAccount={handleRenameSourceAccount}
            onCloseSourceAccount={handleCloseSourceAccount}
            onUpdateSourceAccountOpeningBalance={handleUpdateSourceAccountOpeningBalance}
            onSaveSourceMapping={handleSaveSourceMapping}
            onConfigureAiAdapter={handleConfigureAiAdapter}
            onTestAiAdapter={handleTestAiAdapter}
            onUpdateGitIdentity={handleUpdateGitIdentity}
            onRestoreSnapshot={handleRestoreSnapshot}
            onCreateCategorizationRule={handleCreateCategorizationRule}
            onUpdateCategorizationRule={handleUpdateCategorizationRule}
            onDisableCategorizationRule={handleDisableCategorizationRule}
            onEnableCategorizationRule={handleEnableCategorizationRule}
            onDeleteCategorizationRule={handleDeleteCategorizationRule}
            onDismissCategorizationRuleOffer={() => setRuleOffer(null)}
            onError={setError}
          />
        ) : (
          <WorkspaceOverview
            activeScreen={activeScreen}
            workspace={workspace}
            suggestedEntries={suggestedEntries}
            brokenProvenance={brokenProvenance}
            categorizationRules={categorizationRules}
            categorizationRuleOffer={ruleOffer}
            onReveal={handleReveal}
            onOpenAnother={() => {
              setError(null);
              setView("open");
            }}
            reports={reports}
            snapshots={snapshots}
            onValidate={handleValidateWorkspace}
            onRestoreSnapshot={handleRestoreSnapshot}
            onImportStatementRows={handleImportStatementRows}
            onApproveSuggestedEntry={handleApproveSuggestedEntry}
            onApproveTransferEntry={handleApproveTransferEntry}
            onCreateCategorizationRule={handleCreateCategorizationRule}
            onUpdateCategorizationRule={handleUpdateCategorizationRule}
            onDisableCategorizationRule={handleDisableCategorizationRule}
            onEnableCategorizationRule={handleEnableCategorizationRule}
            onDeleteCategorizationRule={handleDeleteCategorizationRule}
            onDismissCategorizationRuleOffer={() => setRuleOffer(null)}
            onConfigureAiAdapter={handleConfigureAiAdapter}
            onLoadReports={handleLoadReports}
            error={error}
          />
        )}
      </AppShell>
    );
  }

  return null;
}

function monthlyLedgerPath(postedDate: string): string {
  return `transactions/${postedDate.slice(0, 7)}.bean`;
}

function loadRecentWorkspaces(): RecentWorkspace[] {
  try {
    const raw = window.localStorage.getItem(RECENT_WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentWorkspace[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (workspace) =>
          typeof workspace.path === "string" &&
          typeof workspace.displayName === "string" &&
          typeof workspace.lastOpenedAt === "string",
      )
      .slice(0, 10);
  } catch {
    return [];
  }
}

function saveRecentWorkspaces(workspaces: RecentWorkspace[]) {
  window.localStorage.setItem(
    RECENT_WORKSPACES_KEY,
    JSON.stringify(workspaces.slice(0, 10)),
  );
}

function statusContextFor(screen: WorkspaceScreen): string {
  switch (screen) {
    case "ledger":
      return "main.bean";
    case "inbox":
      return "Inbox";
    case "reports":
      return "Reports";
    case "documents":
      return "Documents";
    case "import":
      return "Import";
    case "git":
      return "Git";
    case "settings":
      return "Settings";
  }
}
