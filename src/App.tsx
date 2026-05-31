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
  configureAiAdapter,
  createCategorizationRule,
  createWorkspace,
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
  openWorkspace,
  pickDirectory,
  revealWorkspace,
  restoreSnapshot,
  updateCategorizationRule,
  validateWorkspace,
} from "./lib/workspace/api";
import type {
  AiAdapterConfig,
  AiContextDisclosure,
  CategorizationRule,
  CsvSourceMappingInput,
  BrokenProvenance,
  MvpReports,
  SnapshotSummary,
  SourceAccountKind,
  SuggestedEntry,
  WorkspaceGitStatus,
  LedgerValidationSummary,
  WorkspaceCreateInput,
  WorkspaceSummary,
} from "./lib/workspace/types";
import { CreateWorkspaceForm } from "./features/workspace/CreateWorkspaceForm";
import { InboxPanel } from "./features/workspace/InboxPanel";
import { DocumentsPanel } from "./features/workspace/DocumentsPanel";
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
        ) : (
          <WorkspaceOverview
            activeScreen={activeScreen}
            workspace={workspace}
            suggestedEntries={suggestedEntries}
            brokenProvenance={brokenProvenance}
            categorizationRules={categorizationRules}
            categorizationRuleOffer={ruleOffer}
            aiAdapterConfig={aiAdapterConfig}
            aiContextDisclosure={aiContextDisclosure}
            reports={reports}
            snapshots={snapshots}
            onReveal={handleReveal}
            onValidate={handleValidateWorkspace}
            onRestoreSnapshot={handleRestoreSnapshot}
            onAddSourceAccount={handleAddSourceAccount}
            onImportStatementRows={handleImportStatementRows}
            onApproveSuggestedEntry={handleApproveSuggestedEntry}
            onApproveTransferEntry={handleApproveTransferEntry}
            onCreateCategorizationRule={handleCreateCategorizationRule}
            onUpdateCategorizationRule={handleUpdateCategorizationRule}
            onDismissCategorizationRuleOffer={() => setRuleOffer(null)}
            onConfigureAiAdapter={handleConfigureAiAdapter}
            onLoadReports={handleLoadReports}
            onOpenAnother={() => {
              setError(null);
              setView("open");
            }}
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
