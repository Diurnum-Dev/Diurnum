import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { MENU_SAVE_EVENT, routeMenuEvent, type MenuHandlers } from "./lib/menu";
import {
  AppShell,
  type RecentWorkspace,
  type WorkspaceScreen,
} from "./components/AppShell";
import {
  inspectWorkspacePaths,
  pickDirectory,
  revealWorkspace,
  syncAppMenu,
} from "./lib/workspace/api";
import {
  createDefaultWorkspaceSession,
  monthlyLedgerPath,
  userFacingError,
} from "./lib/workspace/session";
import type {
  CsvSourceMappingInput,
  CloseSourceAccountInput,
  SourceMappingUpdateInput,
  SourceAccountKind,
  RenameSourceAccountInput,
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

export default function App() {
  // The open Workspace and its derived data live in one module. App owns only
  // UI and navigation state and subscribes to the session for the rest.
  const sessionRef = useRef(createDefaultWorkspaceSession());
  const session = sessionRef.current;
  const sessionState = useSyncExternalStore(session.subscribe, session.getState);
  const {
    workspace,
    suggestedEntries,
    knownAccounts,
    brokenProvenance,
    categorizationRules,
    sourceAccounts,
    snapshots,
    gitStatus,
    gitPanelState,
    aiAdapterConfig,
    aiContextDisclosure,
    detectedAdapters,
    gitIdentity,
    reports,
    gitWarning,
    gitHookOutput,
    error,
  } = sessionState;

  const [view, setView] = useState<View>("start");
  const [createTemplate, setCreateTemplate] = useState<WorkspaceTemplate>(null);
  const [activeScreen, setActiveScreen] = useState<WorkspaceScreen>("ledger");
  const [ledgerActiveFile, setLedgerActiveFile] = useState("main.bean");
  const [ledgerRequestedFile, setLedgerRequestedFile] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [ledgerFiles, setLedgerFiles] = useState<string[]>([]);
  const [ruleOffer, setRuleOffer] = useState<CategorizationRuleOffer | null>(null);
  const [ledgerRequestedCursor, setLedgerRequestedCursor] = useState<number | null>(null);
  const [ledgerRequestedVersion, setLedgerRequestedVersion] = useState(0);
  const [ledgerCursor, setLedgerCursor] = useState<{ line: number; column: number } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteMode, setCommandPaletteMode] =
    useState<CommandPaletteMode>("commands");
  const [recentCommands, setRecentCommands] = useState<string[]>(loadRecentCommands);
  const [updatePrefs, setUpdatePrefs] = useState<UpdatePrefs>(loadUpdatePrefs);
  const [updateNotice, setUpdateNotice] = useState<GitHubReleaseUpdate | null>(null);
  const [updateCheckInProgress, setUpdateCheckInProgress] = useState(false);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(
    loadRecentWorkspaces,
  );
  const [recentLedgerFiles, setRecentLedgerFiles] = useState<string[]>([]);
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
    if (!ledgerActiveFile) return;
    setRecentLedgerFiles((prev) => {
      const deduped = [ledgerActiveFile, ...prev.filter((f) => f !== ledgerActiveFile)];
      return deduped.slice(0, 5);
    });
  }, [ledgerActiveFile]);

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
    try {
      await session.create(input);
      rememberOpenWorkspace();
      openLedgerFile("main.bean", 0);
      setView("workspace");
    } catch {
      // Error is surfaced through session state.
    }
  }

  async function handleOpenWorkspace(path: string) {
    try {
      await session.open(path);
      rememberOpenWorkspace();
      openLedgerFile("main.bean", 0);
      setView("workspace");
    } catch {
      // Error is surfaced through session state.
    }
  }

  function handleCreateBlankWorkspace() {
    session.setError(null);
    setCreateTemplate(null);
    setView("create");
  }

  function handleCreateExampleWorkspace() {
    session.setError(null);
    setCreateTemplate("example");
    setView("create");
  }

  async function handleWelcomeOpenExistingWorkspace() {
    session.setError(null);
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
      const next = current.filter((entry) => entry.path !== path);
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

  function handleOpenRecentLedgerFile(relativePath: string) {
    setActiveScreen("ledger");
    setLedgerRequestedFile(relativePath);
    setLedgerRequestedCursor(null);
    setLedgerRequestedVersion((current) => current + 1);
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

  const menuHandlersRef = useRef<MenuHandlers | null>(null);
  menuHandlersRef.current = {
    navigate: handleNavigate,
    openSettings: () => handleNavigate("settings"),
    newWorkspace: handleCreateBlankWorkspace,
    openWorkspace: () => void handleWelcomeOpenExistingWorkspace(),
    openRecentWorkspace: (path) => void handleOpenWorkspace(path),
    closeWorkspace: () => void handleCloseWorkspace(),
    save: () => window.dispatchEvent(new CustomEvent(MENU_SAVE_EVENT)),
    openCommandPalette: () => openCommandPalette("commands"),
  };

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<string>("menu", (event) => {
      const handlers = menuHandlersRef.current;
      if (handlers) routeMenuEvent(event.payload, handlers);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Depends on workspace truthiness, not identity — the workspace object is
  // re-created on every save/validation and the menu must not rebuild then.
  const workspaceOpen = view === "workspace" && Boolean(workspace);
  useEffect(() => {
    if (!isTauri()) return;
    void syncAppMenu({
      workspaceOpen,
      gitAvailable: gitStatus.isRepository,
      recents: recentWorkspaces
        .filter((recent) => recent.exists !== false)
        .map((recent) => ({ path: recent.path, displayName: recent.displayName })),
    }).catch(() => undefined);
  }, [workspaceOpen, gitStatus.isRepository, recentWorkspaces]);

  useEffect(() => {
    if (!isTauri()) return;
    const count = view === "workspace" ? suggestedEntries.length : 0;
    void getCurrentWindow()
      .setBadgeCount(count > 0 ? count : undefined)
      .catch(() => undefined);
  }, [view, suggestedEntries.length]);

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
    void session.commit(message).catch(() => undefined);
  }

  async function handleCloseWorkspace() {
    closeCommandPalette();
    await session.close();
    setSwitcherOpen(false);
    setActiveScreen("ledger");
    setLedgerActiveFile("main.bean");
    setLedgerRequestedFile(null);
    setLedgerRequestedCursor(null);
    setLedgerRequestedVersion((current) => current + 1);
    setRuleOffer(null);
    setLedgerFiles([]);
    setView("start");
  }

  function handleLedgerValidationChange(validation: LedgerValidationSummary) {
    session.applyLedgerValidation(validation);
  }

  async function handleReveal() {
    if (!workspace) return;
    try {
      await revealWorkspace(workspace.rootPath);
    } catch (caught) {
      session.setError(userFacingError(caught));
    }
  }

  async function handleValidateWorkspace() {
    await session.validate().catch(() => undefined);
  }

  async function handleLedgerFileSaved() {
    await session.notifyLedgerSaved().catch(() => undefined);
  }

  async function handleAddSourceAccount(input: {
    kind: SourceAccountKind;
    name: string;
    openingBalance: string | null;
  }) {
    if (!workspace) return;
    await session
      .addSourceAccount({ workspaceRootPath: workspace.rootPath, ...input })
      .catch(() => undefined);
  }

  async function handleImportStatementRows(input: {
    sourceAccount: string;
    sourceFileName: string;
    csvContents: string;
    mapping: CsvSourceMappingInput;
  }) {
    if (!workspace) return;
    await session
      .importRows({ workspaceRootPath: workspace.rootPath, ...input })
      .catch(() => undefined);
  }

  async function handleApproveSuggestedEntry(input: {
    statementRowId: string;
    ledgerAccount: string;
  }) {
    if (!workspace) return;
    try {
      const { ruleOffer: offer } = await session.approve({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      if (offer) setRuleOffer(offer);
    } catch {
      // Error is surfaced through session state.
    }
  }

  async function handleRevertTransferToStandard(input: { statementRowId: string }) {
    if (!workspace) return;
    await session
      .revertTransfer({ workspaceRootPath: workspace.rootPath, ...input })
      .catch(() => undefined);
  }

  async function handleApproveTransferEntry(input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) {
    if (!workspace) return;
    try {
      await session.approveTransfer({ workspaceRootPath: workspace.rootPath, ...input });
      setRuleOffer(null);
    } catch {
      // Error is surfaced through session state.
    }
  }

  async function handleCreateCategorizationRule(input: CategorizationRuleOffer) {
    if (!workspace) return;
    try {
      await session.createRule({ workspaceRootPath: workspace.rootPath, ...input });
      setRuleOffer(null);
    } catch {
      // Error is surfaced through session state.
    }
  }

  async function handleUpdateCategorizationRule(
    input: CategorizationRuleOffer & { id: string },
  ) {
    if (!workspace) return;
    await session
      .updateRule({ workspaceRootPath: workspace.rootPath, ...input })
      .catch(() => undefined);
  }

  async function handleDisableCategorizationRule(input: {
    workspaceRootPath: string;
    id: string;
  }) {
    await session.disableRule(input.workspaceRootPath, input.id).catch(() => undefined);
  }

  async function handleEnableCategorizationRule(input: {
    workspaceRootPath: string;
    id: string;
  }) {
    await session.enableRule(input.workspaceRootPath, input.id).catch(() => undefined);
  }

  async function handleDeleteCategorizationRule(input: {
    workspaceRootPath: string;
    id: string;
  }) {
    await session.deleteRule(input.workspaceRootPath, input.id).catch(() => undefined);
  }

  async function handleConfigureAiAdapter(command: string | null) {
    if (!workspace) return;
    await session.configureAiAdapter(command).catch(() => undefined);
  }

  async function handleUpdateWorkspaceMetadata(input: WorkspaceMetadataUpdateInput) {
    await session.updateMetadata(input);
  }

  async function handleRenameSourceAccount(input: RenameSourceAccountInput) {
    await session.renameSourceAccount(input);
  }

  async function handleCloseSourceAccount(input: CloseSourceAccountInput) {
    await session.closeSourceAccount(input);
  }

  async function handleUpdateSourceAccountOpeningBalance(
    input: UpdateSourceAccountOpeningBalanceInput,
  ) {
    await session.updateOpeningBalance(input);
  }

  async function handleSaveSourceMapping(input: SourceMappingUpdateInput) {
    await session.saveSourceMapping(input);
  }

  async function handleUpdateGitIdentity(input: UpdateGitIdentityInput) {
    await session.updateGitIdentity(input);
  }

  async function handleTestAiAdapter() {
    await session.testAiAdapter();
  }

  async function handleLoadReports(input: { periodStart: string; periodEnd: string }) {
    await session.loadReports(input).catch(() => undefined);
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!workspace) return;
    await session
      .restoreSnapshot({ workspaceRootPath: workspace.rootPath, snapshotId })
      .catch(() => undefined);
  }

  function rememberOpenWorkspace() {
    const summary = session.getState().workspace;
    if (summary) rememberWorkspace(summary);
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
        ...current.filter((entry) => entry.path !== summary.rootPath),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, workspace?.rootPath]);

  const recentPathsKey = recentWorkspaces.map((entry) => entry.path).join("\n");
  useEffect(() => {
    if (recentWorkspaces.length === 0) return;

    let cancelled = false;
    void inspectWorkspacePaths(recentWorkspaces.map((entry) => entry.path))
      .then((statuses) => {
        if (cancelled) return;
        const existsByPath = new Map(statuses.map((status) => [status.path, status.exists]));
        setRecentWorkspaces((current) =>
          current.map((entry) => ({
            ...entry,
            exists: existsByPath.get(entry.path) ?? entry.exists,
          })),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              session.setError(null);
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
              session.setError(null);
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
        recentLedgerFiles={recentLedgerFiles}
        gitStatus={gitStatus}
        ledgerStatus={workspace.ledgerStatus}
        ledgerErrorCount={workspace.ledgerValidation.errors.length}
        gitWarning={gitWarning}
        statusContext={activeScreen === "ledger" ? ledgerActiveFile : statusContextFor(activeScreen)}
        ledgerCursor={activeScreen === "ledger" ? ledgerCursor : null}
        statusHints={activeScreen === "inbox" ? "⏎ Accept · J / K Navigate · E Edit" : null}
        switcherOpen={switcherOpen}
        onToggleSwitcher={() => setSwitcherOpen((open) => !open)}
        onNavigate={handleNavigate}
        onOpenRecentWorkspace={handleOpenRecentWorkspace}
        onRemoveRecentWorkspace={handleRemoveRecentWorkspace}
        onOpenExistingWorkspace={handleOpenExistingWorkspace}
        onOpenRecentFile={handleOpenRecentLedgerFile}
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
            onError={session.setError}
            onCursorChange={setLedgerCursor}
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
            onWarningChange={session.setGitWarning}
            onHookOutputChange={session.setGitHookOutput}
            onRefresh={async () => {
              await session.validate().catch(() => undefined);
            }}
            onError={session.setError}
          />
        ) : activeScreen === "documents" ? (
          <DocumentsPanel workspace={workspace} onError={session.setError} />
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
              session.setError(null);
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
            onError={session.setError}
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
              session.setError(null);
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
