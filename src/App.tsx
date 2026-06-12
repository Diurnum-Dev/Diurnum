import { useCallback, useEffect, useRef, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AppShell,
  type RecentWorkspace,
  type WorkspaceScreen,
} from "./components/AppShell";
import {
  addSourceAccount,
  approveTransferEntry,
  approveSuggestedEntry,
  revertTransferToStandard,
  getKnownLedgerAccounts,
  closeSourceAccount,
  commitGitChanges,
  deleteCategorizationRule,
  disableCategorizationRule,
  detectAiAdapters,
  configureAiAdapter,
  createCategorizationRule,
  createWorkspace,
  getGitIdentity,
  getGitPanelState,
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
  GitPanelState,
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
import {
  CommandPalette,
  type CommandPaletteItem,
  type CommandPaletteMode,
} from "./features/workspace/CommandPalette";
import { GitPanel } from "./features/workspace/GitPanel";
import { SettingsPanel } from "./features/workspace/SettingsPanel";
import type { WorkspaceTemplate } from "./features/workspace/CreateWorkspaceForm";
import { LedgerEditor } from "./features/workspace/LedgerEditor";
import { OpenWorkspaceForm } from "./features/workspace/OpenWorkspaceForm";
import { WorkspaceOverview } from "./features/workspace/WorkspaceOverview";
import { WorkspaceStart } from "./features/workspace/WorkspaceStart";
import type { CategorizationRuleOffer } from "./features/workspace/CategorizationRulesPanel";
import { checkGitHubReleaseUpdate, type GitHubReleaseUpdate } from "./lib/githubReleases";
import {
  loadUpdatePrefs,
  saveUpdatePrefs,
  type UpdatePrefs,
} from "./lib/updatePreferences";

type View = "start" | "create" | "open" | "workspace";

const RECENT_WORKSPACES_KEY = "diurnum.workspaceRecents.v1";
const RECENT_COMMANDS_KEY = "diurnum.commandPaletteRecents.v1";
const APP_VERSION = "0.1.0";

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
  const [ledgerFiles, setLedgerFiles] = useState<string[]>([]);
  const [suggestedEntries, setSuggestedEntries] = useState<SuggestedEntry[]>([]);
  const [knownAccounts, setKnownAccounts] = useState<string[]>([]);
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
  const [gitPanelState, setGitPanelState] = useState<GitPanelState | null>(null);
  const [gitWarning, setGitWarning] = useState<string | null>(null);
  const [gitHookOutput, setGitHookOutput] = useState<string | null>(null);
  const [ledgerRequestedCursor, setLedgerRequestedCursor] = useState<number | null>(null);
  const [ledgerRequestedVersion, setLedgerRequestedVersion] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteMode, setCommandPaletteMode] =
    useState<CommandPaletteMode>("commands");
  const [recentCommands, setRecentCommands] = useState<string[]>(loadRecentCommands);
  const [updatePrefs, setUpdatePrefs] = useState<UpdatePrefs>(loadUpdatePrefs);
  const [updateNotice, setUpdateNotice] = useState<GitHubReleaseUpdate | null>(null);
  const [updateCheckInProgress, setUpdateCheckInProgress] = useState(false);
  const [reports, setReports] = useState<MvpReports | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(
    loadRecentWorkspaces,
  );
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus>(emptyGitStatus);
  const [error, setError] = useState<string | null>(null);
  const gitBackupTimerRef = useRef<number | null>(null);
  const autoUpdateCheckRef = useRef(false);

  const checkForAppUpdate = useCallback(async (): Promise<boolean> => {
    setUpdateCheckInProgress(true);
    try {
      const update = await checkGitHubReleaseUpdate(APP_VERSION);
      setUpdateNotice(update);
      return Boolean(update);
    } finally {
      setUpdatePrefs((current) => ({
        ...current,
        lastCheckedAt: new Date().toISOString(),
      }));
      setUpdateCheckInProgress(false);
    }
  }, []);

  useEffect(() => {
    saveUpdatePrefs(updatePrefs);
  }, [updatePrefs]);

  useEffect(() => {
    if (!updatePrefs.checkOnLaunch) {
      autoUpdateCheckRef.current = false;
      return;
    }
    if (autoUpdateCheckRef.current) return;
    autoUpdateCheckRef.current = true;
    void checkForAppUpdate();
  }, [checkForAppUpdate, updatePrefs.checkOnLaunch]);

  async function handleCreate(input: WorkspaceCreateInput) {
    setError(null);
    clearGitBackupTimer();
    try {
      const created = await createWorkspace(input);
      setWorkspace(created);
      setSuggestedEntries(await getSuggestedEntries(created.rootPath));
      setKnownAccounts(await getKnownLedgerAccounts(created.rootPath));
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
      await refreshGitPanel(created.rootPath);
      openLedgerFile("main.bean", 0);
      setView("workspace");
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleOpenWorkspace(path: string) {
    setError(null);
    clearGitBackupTimer();
    try {
      const opened = await openWorkspace(path);
      setWorkspace(opened);
      setSuggestedEntries(await getSuggestedEntries(opened.rootPath));
      setKnownAccounts(await getKnownLedgerAccounts(opened.rootPath));
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
      await refreshGitPanel(opened.rootPath);
      openLedgerFile("main.bean", 0);
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
    closeCommandPalette();
  }

  function openLedgerFile(relativePath: string, cursor: number) {
    setActiveScreen("ledger");
    setLedgerRequestedFile(relativePath);
    setLedgerRequestedCursor(cursor);
    setLedgerRequestedVersion((current) => current + 1);
    setCommandPaletteOpen(false);
    setSwitcherOpen(false);
  }

  function openCommandPalette(mode: CommandPaletteMode = "commands") {
    if (view !== "workspace") return;
    setSwitcherOpen(false);
    setCommandPaletteMode(mode);
    setCommandPaletteOpen(true);
  }

  function closeCommandPalette() {
    setCommandPaletteOpen(false);
    setCommandPaletteMode("commands");
  }

  function recordRecentCommand(commandId: string) {
    setRecentCommands((current) => {
      const next = [commandId, ...current.filter((id) => id !== commandId)].slice(0, 8);
      saveRecentCommands(next);
      return next;
    });
  }

  const updateBanner = updateNotice ? (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-copy">
        <p className="eyebrow">Updates</p>
        <strong>Version {updateNotice.version} is available</strong>
        <span>Open the GitHub release to download the latest macOS build.</span>
      </div>
      <div className="update-banner-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            void openPath(updateNotice.releaseUrl);
          }}
        >
          Open release
        </button>
        <button className="ghost-button" type="button" onClick={() => setUpdateNotice(null)}>
          Later
        </button>
      </div>
    </div>
  ) : null;

  function buildCommandPaletteItems(): CommandPaletteItem[] {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const baseItems: CommandPaletteItem[] = [
      {
        id: "go-ledger",
        label: "Go to Ledger",
        group: "Navigation",
        shortcut: "⌘1",
        iconPath: "M4 5h10M4 9h10M4 13h7",
        onSelect: () => {
          recordRecentCommand("go-ledger");
          setActiveScreen("ledger");
          closeCommandPalette();
        },
      },
      {
        id: "go-inbox",
        label: "Go to Inbox",
        group: "Navigation",
        shortcut: "⌘2",
        iconPath: "M3 5h12v7l-2 3H5l-2-3V5z",
        onSelect: () => {
          recordRecentCommand("go-inbox");
          setActiveScreen("inbox");
          closeCommandPalette();
        },
      },
      {
        id: "go-reports",
        label: "Go to Reports",
        group: "Navigation",
        shortcut: "⌘3",
        iconPath: "M4 13V7m4 6V4m4 9V9",
        onSelect: () => {
          recordRecentCommand("go-reports");
          setActiveScreen("reports");
          closeCommandPalette();
        },
      },
      {
        id: "go-documents",
        label: "Go to Documents",
        group: "Navigation",
        shortcut: "⌘4",
        iconPath: "M5 3h6l3 3v9H5V3z",
        onSelect: () => {
          recordRecentCommand("go-documents");
          setActiveScreen("documents");
          closeCommandPalette();
        },
      },
      {
        id: "go-import",
        label: "Go to Import",
        group: "Navigation",
        shortcut: "⌘5",
        iconPath: "M8 3v8m0 0 3-3m-3 3L5 8M4 14h8",
        onSelect: () => {
          recordRecentCommand("go-import");
          setActiveScreen("import");
          closeCommandPalette();
        },
      },
      {
        id: "go-settings",
        label: "Go to Settings",
        group: "Navigation",
        shortcut: "⌘,",
        iconPath: "M8 4v1m0 6v1M4 8H3m10 0h-1M5.2 5.2l.7.7m4.2 4.2.7.7m0-5.6-.7.7m-4.2 4.2-.7.7M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
        onSelect: () => {
          recordRecentCommand("go-settings");
          setActiveScreen("settings");
          closeCommandPalette();
        },
      },
      {
        id: "open-file",
        label: "Open file...",
        group: "Actions",
        iconPath: "M14 2H6a2 2 0 0 0-2 2v8l4 2 4-2 4 2V4a2 2 0 0 0-2-2Z",
        onSelect: () => {
          recordRecentCommand("open-file");
          setCommandPaletteMode("files");
        },
      },
      {
        id: "import-csv",
        label: "Import CSV...",
        group: "Actions",
        iconPath: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
        onSelect: () => {
          recordRecentCommand("import-csv");
          setActiveScreen("import");
          closeCommandPalette();
        },
      },
      {
        id: "run-validation",
        label: "Run Ledger Validation",
        group: "Actions",
        iconPath: "M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z",
        onSelect: () => {
          recordRecentCommand("run-validation");
          void handleValidateWorkspace();
          closeCommandPalette();
        },
      },
      {
        id: "new-entry",
        label: "New entry",
        group: "Actions",
        iconPath: "M12 5v14M5 12h14",
        onSelect: () => {
          recordRecentCommand("new-entry");
          openLedgerFile(monthlyLedgerPath(`${currentMonth}-01`), Number.MAX_SAFE_INTEGER);
        },
      },
      {
        id: "switch-workspace",
        label: "Switch workspace",
        group: "Actions",
        iconPath: "M4 8h8M8 4l4 4-4 4",
        onSelect: () => {
          recordRecentCommand("switch-workspace");
          setSwitcherOpen(true);
          closeCommandPalette();
        },
      },
      {
        id: "close-workspace",
        label: "Close workspace",
        group: "Actions",
        iconPath: "M4 4l8 8M12 4l-8 8",
        onSelect: () => {
          recordRecentCommand("close-workspace");
          void handleCloseWorkspace();
        },
      },
    ];

    if (gitStatus.isRepository) {
      baseItems.push(
        {
          id: "open-git-panel",
          label: "Go to Git panel",
          group: "Git",
          iconPath: "M8 3v4m0 0 4 2m-4-2-4 2m0 0v4m8-4v4",
          onSelect: () => {
            recordRecentCommand("open-git-panel");
            setActiveScreen("git");
            closeCommandPalette();
          },
        },
        {
          id: "commit-message",
          label: "Commit with message...",
          group: "Git",
          iconPath: "M12 6v4m0 0 2-2m-2 2-2-2M5 12h14",
          onSelect: () => {
            recordRecentCommand("commit-message");
            setCommandPaletteMode("prompt");
          },
        },
      );
    }

    const recentItems = recentCommands
      .map((id) => baseItems.find((item) => item.id === id))
      .filter((item): item is CommandPaletteItem => Boolean(item))
      .map((item) => ({
        ...item,
        group: "Recent",
      }));

    const remainingItems = baseItems.filter((item) => !recentCommands.includes(item.id));
    return [...recentItems, ...remainingItems];
  }

  const commandPaletteItems = buildCommandPaletteItems();
  const filePaletteItems: CommandPaletteItem[] = ledgerFiles
    .filter((file) => file.endsWith(".bean"))
    .map((file) => {
      const shortName = file.split("/").at(-1) ?? file;
      return {
        id: file,
        label: shortName,
        description: file === shortName ? null : file,
        group: "Workspace files",
        iconPath: "M14 2H6a2 2 0 0 0-2 2v8l4 2 4-2 4 2V4a2 2 0 0 0-2-2Z",
        onSelect: () => {
          openLedgerFile(file, 0);
          closeCommandPalette();
        },
      };
    });

  function handleCommandPalettePromptSubmit(message: string) {
    closeCommandPalette();
    void commitGitWorkspaceChanges(message);
  }

  async function handleCloseWorkspace() {
    clearGitBackupTimer();
    closeCommandPalette();
    if (workspace && gitStatus.isRepository) {
      try {
        await commitGitWorkspaceChanges(`workspace backup ${new Date().toISOString()}`);
      } catch {
        // Closing the Workspace should not be blocked by Git errors.
      }
    }
    setWorkspace(null);
    setLedgerFiles([]);
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
    setGitPanelState(null);
    setGitWarning(null);
    setGitHookOutput(null);
    setReports(null);
    setSnapshots([]);
    setGitStatus(emptyGitStatus);
    setSwitcherOpen(false);
    setActiveScreen("ledger");
    setLedgerActiveFile("main.bean");
    setLedgerRequestedFile(null);
    setLedgerRequestedCursor(null);
    setLedgerRequestedVersion((current) => current + 1);
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

  async function handleLedgerFileSaved() {
    queueGitBackupCommit();
    if (workspace) {
      await refreshGitStatus(workspace.rootPath);
      await refreshGitPanel(workspace.rootPath);
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
      await refreshGitPanel(updated.rootPath);
      queueGitBackupCommit();
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
      await refreshGitPanel(workspace.rootPath);
      queueGitBackupCommit();
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
      setKnownAccounts(await getKnownLedgerAccounts(updated.rootPath));
      setBrokenProvenance(await getBrokenProvenance(updated.rootPath));
      setCategorizationRules(await listCategorizationRules(updated.rootPath));
      setSourceAccounts(await listSourceAccounts(updated.rootPath));
      setReports(null);
      setSnapshots(await listSnapshots(updated.rootPath));
      await refreshGitStatus(updated.rootPath);
      await refreshGitPanel(updated.rootPath);
      queueGitBackupCommit();
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
        await commitGitWorkspaceChanges(
          `diurnum: approve 1 entry (${approvedEntry.postedDate.slice(0, 7)})`,
          [monthlyLedgerPath(approvedEntry.postedDate), "main.bean"],
        );
      }
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleRevertTransferToStandard(input: { statementRowId: string }) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await revertTransferToStandard({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setWorkspace(updated);
      setSuggestedEntries(await getSuggestedEntries(updated.rootPath));
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
      await refreshGitPanel(updated.rootPath);
      queueGitBackupCommit();
      const approvedEntry = suggestedEntries.find(
        (entry) => entry.statementRowId === input.statementRowId,
      );
      if (approvedEntry) {
        setLedgerRequestedFile(monthlyLedgerPath(approvedEntry.postedDate));
        setActiveScreen("ledger");
        await commitGitWorkspaceChanges(
          `diurnum: approve 2 entries (${approvedEntry.postedDate.slice(0, 7)})`,
          [monthlyLedgerPath(approvedEntry.postedDate), "main.bean"],
        );
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
      await refreshGitPanel(updated.rootPath);
      queueGitBackupCommit();
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
      await refreshGitPanel(updated.rootPath);
      queueGitBackupCommit();
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
      await refreshGitPanel(updated.rootPath);
      queueGitBackupCommit();
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
      await refreshGitPanel(updated.rootPath);
      queueGitBackupCommit();
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
      await refreshGitPanel(restored.rootPath);
      queueGitBackupCommit();
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

  async function refreshGitPanel(path: string) {
    try {
      setGitPanelState(await getGitPanelState(path));
    } catch {
      setGitPanelState(null);
    }
  }

  function clearGitBackupTimer() {
    if (gitBackupTimerRef.current !== null) {
      window.clearTimeout(gitBackupTimerRef.current);
      gitBackupTimerRef.current = null;
    }
  }

  function queueGitBackupCommit() {
    if (!workspace || !gitStatus.isRepository) return;
    clearGitBackupTimer();
    gitBackupTimerRef.current = window.setTimeout(() => {
      void commitGitWorkspaceChanges(`workspace backup ${new Date().toISOString()}`);
    }, 60_000);
  }

  async function commitGitWorkspaceChanges(message: string, paths: string[] = []) {
    if (!workspace || !gitStatus.isRepository) return;
    clearGitBackupTimer();
    setGitWarning(null);
    setGitHookOutput(null);
    const commitPaths =
      paths.length > 0
        ? paths
        : gitPanelState?.workingTree
            .map((entry) => entry.path)
            .filter((path) => !path.startsWith(".diurnum/")) ?? [];
    if (commitPaths.length === 0) {
      return;
    }
    const result = await commitGitChanges({
      workspaceRootPath: workspace.rootPath,
      message,
      paths: commitPaths,
    });
    if (result.warning) {
      setGitWarning(result.warning);
      setGitHookOutput(result.hookOutput);
    } else {
      setGitWarning(null);
      setGitHookOutput(null);
    }
    await refreshGitStatus(workspace.rootPath);
    await refreshGitPanel(workspace.rootPath);
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

  useEffect(() => {
    if (view !== "workspace") return;

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette("commands");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  if (view === "start") {
    return (
      <>
        {updateBanner}
        <div className="window-drag-strip" data-tauri-drag-region />
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
      </>
    );
  }

  if (view === "create") {
    return (
      <>
        {updateBanner}
        <div className="window-drag-strip" data-tauri-drag-region />
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
      </>
    );
  }

  if (view === "open") {
    return (
      <>
        {updateBanner}
        <div className="window-drag-strip" data-tauri-drag-region />
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
      </>
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
        gitWarning={gitWarning}
        statusContext={activeScreen === "ledger" ? ledgerActiveFile : statusContextFor(activeScreen)}
        switcherOpen={switcherOpen}
        onToggleSwitcher={() => setSwitcherOpen((open) => !open)}
        onNavigate={handleNavigate}
        onOpenRecentWorkspace={handleOpenRecentWorkspace}
        onRemoveRecentWorkspace={handleRemoveRecentWorkspace}
        onOpenExistingWorkspace={handleOpenExistingWorkspace}
        onCloseWorkspace={handleCloseWorkspace}
      >
        {updateBanner}
        {activeScreen === "ledger" ? (
          <LedgerEditor
            workspace={workspace}
            requestedFile={ledgerRequestedFile}
            requestedCursor={ledgerRequestedCursor}
            requestedFileVersion={ledgerRequestedVersion}
            onActiveFileChange={setLedgerActiveFile}
            onFilesChange={setLedgerFiles}
            onValidationChange={handleLedgerValidationChange}
            onSaved={handleLedgerFileSaved}
            onError={setError}
          />
        ) : activeScreen === "inbox" ? (
          <InboxPanel
            suggestedEntries={suggestedEntries}
            ledgerStatus={workspace.ledgerStatus}
            knownAccounts={knownAccounts}
            onApprove={handleApproveSuggestedEntry}
            onApproveTransfer={handleApproveTransferEntry}
            onRevertTransfer={handleRevertTransferToStandard}
          />
        ) : activeScreen === "git" ? (
          <GitPanel
            workspaceRootPath={workspace.rootPath}
            state={gitPanelState}
            warning={gitWarning}
            hookOutput={gitHookOutput}
            onWarningChange={setGitWarning}
            onHookOutputChange={setGitHookOutput}
            onRefresh={async () => {
              await refreshGitStatus(workspace.rootPath);
              await refreshGitPanel(workspace.rootPath);
            }}
            onError={setError}
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
            updatePrefs={updatePrefs}
            updateCheckInProgress={updateCheckInProgress}
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
            onUpdatePrefsChange={setUpdatePrefs}
            onCheckForUpdates={checkForAppUpdate}
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
        <CommandPalette
          open={commandPaletteOpen}
          mode={commandPaletteMode}
          items={commandPaletteMode === "files" ? filePaletteItems : commandPaletteItems}
          promptLabel="Commit with message"
          promptPlaceholder={
            commandPaletteMode === "files"
              ? "Search files"
              : commandPaletteMode === "prompt"
                ? "Commit message"
                : "Search commands"
          }
          onClose={closeCommandPalette}
          onPromptSubmit={handleCommandPalettePromptSubmit}
        />
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

function loadRecentCommands(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_COMMANDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, 8);
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

function saveRecentCommands(commands: string[]) {
  window.localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(commands.slice(0, 8)));
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
