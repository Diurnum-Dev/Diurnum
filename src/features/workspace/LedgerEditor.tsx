import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import type React from "react";
import { MENU_SAVE_EVENT } from "../../lib/menu";
import { basicSetup } from "codemirror";
import { EditorState, Compartment, EditorSelection } from "@codemirror/state";
import { EditorView, Decoration, keymap, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { bracketMatching, foldGutter, foldKeymap, foldService } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import {
  autocompletion,
  completionStatus,
  acceptCompletion,
  startCompletion,
  closeCompletion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { filterAccounts, accountAt, payeeAt, postingPosition, blockDescriptionAt } from "./ledger-completions";
import type {
  EntryDescription,
  LedgerEditorSession,
  LedgerEditorTabSession,
  LedgerFileSnapshot,
  LedgerValidationSummary,
  PredictiveEntryCompletion,
  WorkspaceSummary,
} from "../../lib/workspace/types";
import {
  getPredictiveEntryCompletion,
  getAccountContextHints,
  getLedgerEditorState,
  listEntryDescriptions,
  readLedgerFile,
  saveLedgerEditorSession,
  saveLedgerFile,
  validateWorkspace,
} from "../../lib/workspace/api";

type LedgerEditorProps = {
  workspace: WorkspaceSummary;
  requestedFile?: string | null;
  requestedCursor?: number | null;
  requestedFileVersion?: number;
  onActiveFileChange: (relativePath: string) => void;
  onFilesChange?: (files: string[]) => void;
  onValidationChange: (validation: LedgerValidationSummary) => void;
  onSaved?: (relativePath: string) => void | Promise<void>;
  onError: (message: string | null) => void;
  onCursorChange?: (cursor: { line: number; column: number }) => void;
  knownAccounts?: string[];
};

type OpenTab = LedgerEditorTabSession & {
  contents: string;
  savedContents: string;
  modifiedAt: number;
  isDirty: boolean;
};

type ExternalChange = {
  relativePath: string;
  modifiedAt: number;
};

const MAIN_FILE = "main.bean";

export function LedgerEditor({
  workspace,
  requestedFile,
  requestedCursor,
  requestedFileVersion,
  onActiveFileChange,
  onFilesChange,
  onValidationChange,
  onSaved,
  onError,
  onCursorChange,
  knownAccounts = [],
}: LedgerEditorProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState(MAIN_FILE);
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<LedgerEditorTabSession[]>([]);
  const [externalChange, setExternalChange] = useState<ExternalChange | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState(workspace.ledgerValidation.errors);
  const [predictiveCompletion, setPredictiveCompletion] =
    useState<PredictiveEntryCompletion | null>(null);
  const [payeeDescriptions, setPayeeDescriptions] = useState<EntryDescription[]>([]);

  const activeTab = tabs.find((tab) => tab.relativePath === activePath) ?? null;
  const activeLineRef = useRef(1);

  const openFile = useCallback(
    async (relativePath: string, preferredCursor = 0) => {
      onError(null);
      setExternalChange(null);
      const existing = tabs.find((tab) => tab.relativePath === relativePath);
      if (existing) {
        setActivePath(relativePath);
        return;
      }

      try {
        const snapshot = await readLedgerFile({
          workspaceRootPath: workspace.rootPath,
          relativePath,
        });
        setTabs((current) => [
          ...current,
          snapshotToTab(snapshot, Math.min(preferredCursor, snapshot.contents.length), 0),
        ]);
        setActivePath(relativePath);
      } catch (error) {
        onError(errorMessage(error));
      }
    },
    [onError, tabs, workspace.rootPath],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getLedgerEditorState(workspace.rootPath)
      .then(async (state) => {
        if (cancelled) return;
        setFiles(state.files);
        onFilesChange?.(state.files);
        setRecentlyClosedTabs(state.session.recentlyClosedTabs);
        // Honor a file the parent requested before this editor mounted (e.g.
        // "Open file..." from another screen, which remounts this component).
        // Without this, the async session load resolves last and clobbers the
        // requested file back to the session's default active tab.
        const openTabs = [...state.session.openTabs];
        if (requestedFile && !openTabs.some((tab) => tab.relativePath === requestedFile)) {
          openTabs.push({ relativePath: requestedFile, cursor: requestedCursor ?? 0, scrollTop: 0 });
        }
        const snapshots = await Promise.all(
          openTabs.map((tab) =>
            readLedgerFile({
              workspaceRootPath: workspace.rootPath,
              relativePath: tab.relativePath,
            }).then((snapshot) => snapshotToTab(snapshot, tab.cursor, tab.scrollTop)),
          ),
        );
        if (cancelled) return;
        setTabs(snapshots.length > 0 ? snapshots : []);
        setActivePath(requestedFile || state.session.activeTab || MAIN_FILE);
        setIsLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setIsLoading(false);
        onError(errorMessage(error));
      });

    return () => {
      cancelled = true;
    };
    // requestedFile/requestedCursor are read for their mount-time value only;
    // subsequent requests are handled by the requested-file effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onError, onFilesChange, workspace.rootPath]);

  useEffect(() => {
    void listEntryDescriptions(workspace.rootPath)
      .then(setPayeeDescriptions)
      .catch(() => undefined);
  }, [workspace.rootPath]);

  // Keep a ref to the latest openFile so the effect below doesn't re-run every
  // time a new tab is opened (which recreates openFile due to `tabs` in its deps).
  // The effect should only fire when the *request* changes, not when openFile changes.
  const openFileRef = useRef(openFile);
  useEffect(() => {
    openFileRef.current = openFile;
  });

  // Skip the mount-time request: when this editor remounts with a requested
  // file already set (e.g. "Open file..." from another screen), the initial
  // load handles it. Acting here too would race the load and open a duplicate
  // tab. Only honor requests that arrive while the editor is already mounted.
  const handledRequestVersionRef = useRef(requestedFileVersion);
  useEffect(() => {
    if (handledRequestVersionRef.current === requestedFileVersion) return;
    handledRequestVersionRef.current = requestedFileVersion;
    if (!requestedFile) return;
    void openFileRef.current(requestedFile, requestedCursor ?? 0);
    // Intentionally omit openFile — we use openFileRef so this only re-runs
    // when a new file is actually requested by the parent, not on every tab open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCursor, requestedFile, requestedFileVersion]);

  useEffect(() => {
    onActiveFileChange(activePath);
  }, [activePath, onActiveFileChange]);

  const persistSession = useCallback(
    (nextTabs = tabs, nextActivePath = activePath, nextClosed = recentlyClosedTabs) => {
      if (nextTabs.length === 0) return;
      const session: LedgerEditorSession = {
        activeTab: nextActivePath,
        openTabs: nextTabs.map(tabToSession),
        recentlyClosedTabs: nextClosed.slice(0, 10),
      };
      void saveLedgerEditorSession({
        workspaceRootPath: workspace.rootPath,
        session,
      }).catch(() => undefined);
    },
    [activePath, recentlyClosedTabs, tabs, workspace.rootPath],
  );

  const reopenMainAfterClosingLastTab = useCallback(
    async (nextClosed: LedgerEditorTabSession[]) => {
      try {
        const snapshot = await readLedgerFile({
          workspaceRootPath: workspace.rootPath,
          relativePath: MAIN_FILE,
        });
        const nextTabs = [snapshotToTab(snapshot, 0, 0)];
        setTabs(nextTabs);
        setActivePath(MAIN_FILE);
        persistSession(nextTabs, MAIN_FILE, nextClosed);
      } catch (error) {
        onError(errorMessage(error));
      }
    },
    [onError, persistSession, workspace.rootPath],
  );

  useEffect(() => {
    if (tabs.length === 0 || isLoading) return;
    const timeout = window.setTimeout(() => persistSession(), 250);
    return () => window.clearTimeout(timeout);
  }, [activePath, isLoading, persistSession, tabs]);

  const runValidation = useCallback(async () => {
    try {
      const validation = await validateWorkspace(workspace.rootPath);
      setValidationErrors(validation.errors);
      onValidationChange(validation);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [onError, onValidationChange, workspace.rootPath]);

  useEffect(() => {
    if (!activeTab?.isDirty) return;
    const timeout = window.setTimeout(() => void runValidation(), 300);
    return () => window.clearTimeout(timeout);
  }, [activeTab?.contents, activeTab?.isDirty, runValidation]);

  const saveActiveFile = useCallback(async () => {
    const tab = tabs.find((candidate) => candidate.relativePath === activePath);
    if (!tab) return;

    setIsSaving(true);
    onError(null);
    try {
      const alignedContents = alignTransactionAmounts(tab.contents, activeLineRef.current);
      const validation = await saveLedgerFile({
        workspaceRootPath: workspace.rootPath,
        relativePath: tab.relativePath,
        contents: alignedContents,
        expectedModifiedAt: tab.modifiedAt,
      });
      const snapshot = await readLedgerFile({
        workspaceRootPath: workspace.rootPath,
        relativePath: tab.relativePath,
      });
      setTabs((current) =>
        current.map((candidate) =>
          candidate.relativePath === tab.relativePath
            ? snapshotToTab(snapshot, Math.min(tab.cursor, snapshot.contents.length), tab.scrollTop)
            : candidate,
        ),
      );
      void listEntryDescriptions(workspace.rootPath)
        .then(setPayeeDescriptions)
        .catch(() => undefined);
      setValidationErrors(validation.errors);
      onValidationChange(validation);
      await onSaved?.(tab.relativePath);
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("changed outside Diurnum")) {
        setExternalChange({
          relativePath: tab.relativePath,
          modifiedAt: Date.now(),
        });
      }
      onError(message);
    } finally {
      setIsSaving(false);
    }
  }, [activePath, onError, onSaved, onValidationChange, tabs, workspace.rootPath]);

  useEffect(() => {
    function handleMenuSave() {
      void saveActiveFile();
    }
    window.addEventListener(MENU_SAVE_EVENT, handleMenuSave);
    return () => window.removeEventListener(MENU_SAVE_EVENT, handleMenuSave);
  }, [saveActiveFile]);

  // Refs so blur handler always calls the latest version of saveActiveFile and reads latest isDirty
  const saveActiveFileRef = useRef(saveActiveFile);
  useEffect(() => {
    saveActiveFileRef.current = saveActiveFile;
  }, [saveActiveFile]);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    function handleBlur() {
      if (activeTabRef.current?.isDirty) void saveActiveFileRef.current();
    }
    function handleVisibility() {
      if (document.visibilityState === "hidden" && activeTabRef.current?.isDirty) {
        void saveActiveFileRef.current();
      }
    }
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!activeTab?.isDirty) return;
    const timeout = window.setTimeout(() => void saveActiveFile(), 2000);
    return () => window.clearTimeout(timeout);
  }, [activeTab?.contents, activeTab?.isDirty, saveActiveFile]);

  useEffect(() => {
    if (!activeTab) {
      setPredictiveCompletion(null);
      return;
    }
    const linePrefix = completionLinePrefixAtCursor(activeTab.contents, activeTab.cursor);
    if (!linePrefix) {
      setPredictiveCompletion(null);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void getPredictiveEntryCompletion({
        workspaceRootPath: workspace.rootPath,
        linePrefix,
      })
        .then((completion) => {
          if (cancelled) return;
          setPredictiveCompletion(completion?.insertText ? completion : null);
        })
        .catch((error) => {
          if (cancelled) return;
          setPredictiveCompletion(null);
          onError(errorMessage(error));
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [activeTab?.contents, activeTab?.cursor, activePath, onError, workspace.rootPath]);

  useEffect(() => {
    if (!activeTab || activeTab.isDirty) return;
    const interval = window.setInterval(() => {
      void readLedgerFile({
        workspaceRootPath: workspace.rootPath,
        relativePath: activeTab.relativePath,
      })
        .then((snapshot) => {
          if (snapshot.modifiedAt !== activeTab.modifiedAt) {
            setExternalChange({
              relativePath: activeTab.relativePath,
              modifiedAt: snapshot.modifiedAt,
            });
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [activeTab, workspace.rootPath]);

  async function reloadExternalChange() {
    if (!externalChange) return;
    const snapshot = await readLedgerFile({
      workspaceRootPath: workspace.rootPath,
      relativePath: externalChange.relativePath,
    });
    setTabs((current) =>
      current.map((tab) =>
        tab.relativePath === snapshot.relativePath
          ? snapshotToTab(snapshot, tab.cursor, tab.scrollTop)
          : tab,
      ),
    );
    setExternalChange(null);
    await runValidation();
  }

  function closeTab(relativePath = activePath) {
    const closing = tabs.find((tab) => tab.relativePath === relativePath);
    if (!closing) return;
    const remaining = tabs.filter((tab) => tab.relativePath !== relativePath);
    const nextClosed = [tabToSession(closing), ...recentlyClosedTabs].slice(0, 10);
    setRecentlyClosedTabs(nextClosed);
    if (remaining.length === 0) {
      setTabs([]);
      setActivePath(MAIN_FILE);
      void reopenMainAfterClosingLastTab(nextClosed);
      return;
    }
    const nextActive = relativePath === activePath ? remaining[remaining.length - 1].relativePath : activePath;
    setTabs(remaining);
    setActivePath(nextActive);
    persistSession(remaining, nextActive, nextClosed);
  }

  function reopenClosedTab() {
    const [lastClosed, ...rest] = recentlyClosedTabs;
    if (!lastClosed) return;
    setRecentlyClosedTabs(rest);
    void openFile(lastClosed.relativePath, lastClosed.cursor);
  }

  function updateActiveContents(contents: string, cursor: number, scrollTop: number) {
    activeLineRef.current = lineNumberAt(contents, cursor);
    setTabs((current) =>
      current.map((tab) =>
        tab.relativePath === activePath
          ? {
              ...tab,
              contents,
              cursor,
              scrollTop,
              isDirty: contents !== tab.savedContents,
            }
          : tab,
      ),
    );
  }

  const commandMatches = useMemo(() => {
    const normalized = commandFilter.trim().toLowerCase();
    return files
      .filter((file) => file.endsWith(".bean"))
      .filter((file) => file.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [commandFilter, files]);

  if (isLoading || !activeTab) {
    return (
      <section className="ledger-editor" aria-label="Ledger Editor">
        <p className="empty-note">Loading Ledger Editor...</p>
      </section>
    );
  }

  return (
    <section className="ledger-editor" aria-label="Ledger Editor">
      {externalChange ? (
        <div className="ledger-editor-alert" role="alert">
          <span>External Ledger Edit detected for {externalChange.relativePath}.</span>
          <button className="secondary-button" type="button" onClick={reloadExternalChange}>
            Reload
          </button>
        </div>
      ) : null}

      {commandOpen ? (
        <div className="command-popover" role="dialog" aria-label="Open file">
          <input
            autoFocus
            aria-label="Open file"
            value={commandFilter}
            onChange={(event) => setCommandFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setCommandOpen(false);
            }}
            placeholder="Search .bean files"
          />
          <div className="command-results">
            {commandMatches.map((file) => (
              <button
                type="button"
                key={file}
                onClick={() => {
                  setCommandOpen(false);
                  setCommandFilter("");
                  void openFile(file);
                }}
              >
                {file}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ledger-editor-layout">
        <LedgerFileTree
          files={files}
          activePath={activePath}
          workspaceName={workspace.businessName}
          onOpenFile={(file) => void openFile(file)}
          onOpenCommandPalette={() => setCommandOpen(true)}
        />

        <div className="ledger-editor-pane">
          <div className="ledger-tabbar">
            <div className="ledger-tabs" role="tablist" aria-label="Open ledger files">
            {tabs.map((tab) => (
              <button
                className={tab.relativePath === activePath ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={tab.relativePath === activePath}
                key={tab.relativePath}
                onClick={() => setActivePath(tab.relativePath)}
              >
                <span>{shortName(tab.relativePath)}</span>
                {tab.isDirty ? (
                  <span className="tab-modified-dot" aria-label="Unsaved changes" />
                ) : null}
                <span
                  className="tab-close"
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${tab.relativePath}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.relativePath);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      closeTab(tab.relativePath);
                    }
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 6l12 12" />
                    <path d="M6 18L18 6" />
                  </svg>
                </span>
              </button>
            ))}
            </div>
            <div
              className="ledger-tab-dragzone"
              data-tauri-drag-region
              aria-hidden="true"
            />
          </div>
          <CodeMirrorEditor
            key={activePath}
            contents={activeTab.contents}
            cursor={activeTab.cursor}
            scrollTop={activeTab.scrollTop}
            validationErrors={validationErrorsForFile(validationErrors, activePath)}
            completionText={predictiveCompletion?.insertText ?? null}
            knownAccounts={knownAccounts}
            payeeDescriptions={payeeDescriptions}
            workspaceRootPath={workspace.rootPath}
            onChange={updateActiveContents}
            onSave={saveActiveFile}
            onCloseTab={() => closeTab()}
            onReopenTab={reopenClosedTab}
            onOpenInclude={(relativePath) => void openFile(relativePath)}
            onDismissCompletion={() => setPredictiveCompletion(null)}
            onCursorChange={onCursorChange}
          />
        </div>
      </div>
    </section>
  );
}

// ── File tree types ────────────────────────────────────────────

type TreeNode =
  | { kind: "file"; name: string; relativePath: string }
  | { kind: "folder"; name: string; children: TreeNode[] };

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const relativePath of files) {
    const parts = relativePath.split("/");
    let nodes = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let folder = nodes.find(
        (n): n is Extract<TreeNode, { kind: "folder" }> =>
          n.kind === "folder" && n.name === folderName,
      );
      if (!folder) {
        folder = { kind: "folder", name: folderName, children: [] };
        nodes.push(folder);
      }
      nodes = folder.children;
    }
    nodes.push({ kind: "file", name: parts[parts.length - 1], relativePath });
  }
  return root;
}

// ── LedgerFileTree component ───────────────────────────────────

type LedgerFileTreeProps = {
  files: string[];
  activePath: string;
  workspaceName: string;
  onOpenFile: (relativePath: string) => void;
  onOpenCommandPalette: () => void;
};

function LedgerFileTree({
  files,
  activePath,
  workspaceName,
  onOpenFile,
  onOpenCommandPalette,
}: LedgerFileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [rootCollapsed, setRootCollapsed] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  function toggleFolder(path: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function collapseAll() {
    const allFolderPaths = new Set<string>();
    function collect(nodes: TreeNode[], prefix: string) {
      for (const node of nodes) {
        if (node.kind === "folder") {
          const path = prefix ? `${prefix}/${node.name}` : node.name;
          allFolderPaths.add(path);
          collect(node.children, path);
        }
      }
    }
    collect(tree, "");
    setCollapsedFolders(allFolderPaths);
  }

  return (
    <aside className="ledger-file-tree" aria-label="Ledger files">
      <div className="ledger-file-tree-head" data-tauri-drag-region>
        <span className="ledger-file-tree-title" data-tauri-drag-region>Explorer</span>
        <button
          className="ledger-file-tree-icon-btn"
          type="button"
          title="New file"
          aria-label="New file"
          onClick={onOpenCommandPalette}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="M9 15h6" />
          </svg>
        </button>
        <button
          className="ledger-file-tree-icon-btn"
          type="button"
          title="New folder"
          aria-label="New folder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M12 13v4" />
            <path d="M10 15h4" />
          </svg>
        </button>
        <button
          className="ledger-file-tree-icon-btn"
          type="button"
          title="Collapse all"
          aria-label="Collapse all"
          onClick={collapseAll}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16" />
            <path d="M4 12h10" />
            <path d="M4 18h4" />
          </svg>
        </button>
      </div>

      <div className="ledger-file-tree-body" role="tree">
        <button
          className={`ledger-tree-root-label${rootCollapsed ? " collapsed" : ""}`}
          type="button"
          role="treeitem"
          aria-expanded={!rootCollapsed}
          onClick={() => setRootCollapsed((c) => !c)}
        >
          <svg
            className="root-chev"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          {workspaceName.toLowerCase()}
        </button>

        {!rootCollapsed && (
          <div role="group">
            <TreeNodes
              nodes={tree}
              activePath={activePath}
              collapsedFolders={collapsedFolders}
              pathPrefix=""
              depth={0}
              onOpenFile={onOpenFile}
              onToggleFolder={toggleFolder}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

type TreeNodesProps = {
  nodes: TreeNode[];
  activePath: string;
  collapsedFolders: Set<string>;
  pathPrefix: string;
  depth: number;
  onOpenFile: (relativePath: string) => void;
  onToggleFolder: (path: string) => void;
};

const FILE_ICON = (
  <svg className="file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

const FOLDER_ICON = (
  <svg className="folder-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const CHEV_ICON = (
  <svg className="tree-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

function TreeNodes({
  nodes,
  activePath,
  collapsedFolders,
  pathPrefix,
  depth,
  onOpenFile,
  onToggleFolder,
}: TreeNodesProps) {
  // Indent: root files at 20px, each depth adds 12px. Folders start at 8px for depth=0.
  const filePadding = depth === 0 ? 20 : 20 + depth * 12;
  const folderPadding = depth === 0 ? 8 : 8 + depth * 12;

  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "file") {
          const isActive = node.relativePath === activePath;
          return (
            <button
              key={node.relativePath}
              className={`ledger-tree-item${isActive ? " active" : ""}`}
              style={{ paddingLeft: filePadding }}
              type="button"
              role="treeitem"
              aria-selected={isActive}
              aria-label={node.name}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onOpenFile(node.relativePath)}
            >
              {FILE_ICON}
              <span className="label">{node.name}</span>
            </button>
          );
        } else {
          const folderPath = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
          const isCollapsed = collapsedFolders.has(folderPath);
          return (
            <Fragment key={folderPath}>
              <button
                className={`ledger-tree-item${isCollapsed ? " collapsed" : ""}`}
                style={{ paddingLeft: folderPadding }}
                type="button"
                role="treeitem"
                aria-expanded={!isCollapsed}
                tabIndex={0}
                onClick={() => onToggleFolder(folderPath)}
              >
                {CHEV_ICON}
                {FOLDER_ICON}
                <span className="label">{node.name}</span>
              </button>
              {!isCollapsed && (
                <div role="group">
                  <TreeNodes
                    nodes={node.children}
                    activePath={activePath}
                    collapsedFolders={collapsedFolders}
                    pathPrefix={folderPath}
                    depth={depth + 1}
                    onOpenFile={onOpenFile}
                    onToggleFolder={onToggleFolder}
                  />
                </div>
              )}
            </Fragment>
          );
        }
      })}
    </>
  );
}

type CodeMirrorEditorProps = {
  contents: string;
  cursor: number;
  scrollTop: number;
  validationErrors: FileValidationError[];
  completionText: string | null;
  knownAccounts: string[];
  payeeDescriptions: EntryDescription[];
  workspaceRootPath: string;
  onChange: (contents: string, cursor: number, scrollTop: number) => void;
  onSave: () => void;
  onCloseTab: () => void;
  onReopenTab: () => void;
  onOpenInclude: (relativePath: string) => void;
  onDismissCompletion: () => void;
  onCursorChange?: (cursor: { line: number; column: number }) => void;
};

function buildInstantCompletion(
  knownAccountsRef: React.MutableRefObject<string[]>,
  contextHintsRef: React.MutableRefObject<string[]>,
  payeeDescriptionsRef: React.MutableRefObject<EntryDescription[]>,
): import("@codemirror/state").Extension {
  const accountSource: CompletionSource = (context) => {
    const match = accountAt(context);
    if (!match) return null;
    const accounts = knownAccountsRef.current;
    const hints = new Set(contextHintsRef.current);
    const candidates = filterAccounts(accounts, match.prefix);
    if (!candidates.length && !context.explicit) return null;

    // Rank: hinted accounts first, then debit/credit-position bias, then chart order
    const pos = postingPosition(context.state, context.pos);
    const debitPreferred = pos === "first"; // first posting → Expenses/Income; balancing → Assets/Liabilities
    const sorted = [...candidates].sort((a, b) => {
      const aHint = hints.has(a) ? 0 : 1;
      const bHint = hints.has(b) ? 0 : 1;
      if (aHint !== bHint) return aHint - bHint;
      const aBias = (debitPreferred ? isExpenseOrIncome(a) : isAssetOrLiability(a)) ? 0 : 1;
      const bBias = (debitPreferred ? isExpenseOrIncome(b) : isAssetOrLiability(b)) ? 0 : 1;
      return aBias - bBias;
    });

    return {
      from: match.from,
      options: sorted.map((account) => ({
        label: account,
        type: "variable",
        apply: (view: EditorView, _completion: import("@codemirror/autocomplete").Completion, from: number, to: number) => {
          view.dispatch({
            changes: { from, to, insert: account + "  " },
            selection: EditorSelection.cursor(from + account.length + 2),
          });
        },
      })),
      validFor: /[\w:]*/,
    };
  };

  const payeeSource: CompletionSource = (context) => {
    const match = payeeAt(context);
    if (!match) return null;
    const descriptions = payeeDescriptionsRef.current;
    const prefix = match.prefix.toLowerCase();
    const candidates = descriptions.filter((d) =>
      d.text.toLowerCase().includes(prefix),
    );
    if (!candidates.length && !context.explicit) return null;
    return {
      from: match.from,
      options: candidates.map((d) => ({
        label: d.text,
        detail: d.kind,
        type: "text",
      })),
      validFor: /[^"]*/,
    };
  };

  // @ts-expect-error -- ghostText is a valid CM6 autocompletion option; added after current @types snapshot
  return autocompletion({ override: [accountSource, payeeSource], ghostText: true });
}

function isExpenseOrIncome(account: string): boolean {
  return account.startsWith("Expenses:") || account.startsWith("Income:");
}

function isAssetOrLiability(account: string): boolean {
  return account.startsWith("Assets:") || account.startsWith("Liabilities:");
}

function CodeMirrorEditor({
  contents,
  cursor,
  scrollTop,
  validationErrors,
  completionText,
  knownAccounts,
  payeeDescriptions,
  workspaceRootPath,
  onChange,
  onSave,
  onCloseTab,
  onReopenTab,
  onOpenInclude,
  onDismissCompletion,
  onCursorChange,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lintCompartment = useRef(new Compartment());
  const completionCompartment = useRef(new Compartment());
  const knownAccountsCompartment = useRef(new Compartment());
  const knownAccountsRef = useRef<string[]>(knownAccounts);
  const contextHintsRef = useRef<string[]>([]);
  const payeeDescriptionsRef = useRef<EntryDescription[]>(payeeDescriptions);
  const lastFetchedDescriptionRef = useRef<string | null>(null);
  const callbacksRef = useRef({
    completionText,
    workspaceRootPath,
    onChange,
    onSave,
    onCloseTab,
    onReopenTab,
    onOpenInclude,
    onDismissCompletion,
    onCursorChange,
  });

  useEffect(() => {
    callbacksRef.current = {
      completionText,
      workspaceRootPath,
      onChange,
      onSave,
      onCloseTab,
      onReopenTab,
      onOpenInclude,
      onDismissCompletion,
      onCursorChange,
    };
  }, [completionText, workspaceRootPath, onChange, onSave, onCloseTab, onReopenTab, onOpenInclude, onDismissCompletion, onCursorChange]);

  // Sync prop → ref and reconfigure the completion extension
  useEffect(() => {
    knownAccountsRef.current = knownAccounts;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: knownAccountsCompartment.current.reconfigure(
        buildInstantCompletion(knownAccountsRef, contextHintsRef, payeeDescriptionsRef),
      ),
    });
  }, [knownAccounts]);

  useEffect(() => {
    payeeDescriptionsRef.current = payeeDescriptions;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: knownAccountsCompartment.current.reconfigure(
        buildInstantCompletion(knownAccountsRef, contextHintsRef, payeeDescriptionsRef),
      ),
    });
  }, [payeeDescriptions]);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: contents,
        selection: EditorSelection.cursor(Math.min(cursor, contents.length)),
        extensions: [
          basicSetup,
          tripleClickLineSelect,
          lintGutter(),
          bracketMatching(),
          foldGutter(),
          transactionFolding,
          beanDecorations((relativePath) => callbacksRef.current.onOpenInclude(relativePath)),
          currentTransactionHighlight,
          completionCompartment.current.of(ghostCompletion(completionText)),
          knownAccountsCompartment.current.of(
            buildInstantCompletion(knownAccountsRef, contextHintsRef, payeeDescriptionsRef),
          ),
          lintCompartment.current.of(
            linter((view) => diagnosticsFromErrors(validationErrors, view.state)),
          ),
          keymap.of([
            {
              key: "Tab",
              run: (view) => {
                if (completionStatus(view.state) === "active") {
                  return acceptCompletion(view);
                }
                const text = callbacksRef.current.completionText;
                if (!text) return false;
                const cursor = view.state.selection.main.head;
                view.dispatch({
                  changes: { from: cursor, to: cursor, insert: text },
                  selection: EditorSelection.cursor(cursor + text.length),
                });
                callbacksRef.current.onDismissCompletion();
                return true;
              },
            },
            {
              key: "Ctrl-Space",
              run: (view) => {
                startCompletion(view);
                return true;
              },
            },
            {
              key: "Escape",
              run: (view) => {
                if (completionStatus(view.state) !== null) {
                  closeCompletion(view);
                  return true;
                }
                if (!callbacksRef.current.completionText) return false;
                callbacksRef.current.onDismissCompletion();
                return true;
              },
            },
            {
              key: "Mod-s",
              run: () => {
                callbacksRef.current.onSave();
                return true;
              },
            },
            {
              key: "Mod-w",
              run: () => {
                callbacksRef.current.onCloseTab();
                return true;
              },
            },
            {
              key: "Mod-Shift-t",
              run: () => {
                callbacksRef.current.onReopenTab();
                return true;
              },
            },
            ...searchKeymap,
            ...foldKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet && !update.viewportChanged) return;
            const head = update.state.selection.main.head;
            callbacksRef.current.onChange(
              update.state.doc.toString(),
              head,
              update.view.scrollDOM.scrollTop,
            );
            if (update.selectionSet || update.docChanged) {
              const cursorLine = update.state.doc.lineAt(head);
              const lineNumber = cursorLine.number;
              const column = head - cursorLine.from + 1;
              callbacksRef.current.onCursorChange?.({ line: lineNumber, column });
            }
            // Fetch per-block context hints when the cursor enters a new transaction block
            if (update.selectionSet) {
              const description = blockDescriptionAt(
                update.state,
                update.state.selection.main.head,
              );
              if (description !== null && description !== lastFetchedDescriptionRef.current) {
                lastFetchedDescriptionRef.current = description;
                void getAccountContextHints(
                  callbacksRef.current.workspaceRootPath,
                  description,
                )
                  .then((hints) => {
                    contextHintsRef.current = hints;
                  })
                  .catch(() => undefined);
              }
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    window.requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = scrollTop;
      // Emit initial cursor position
      const head = view.state.selection.main.head;
      const cursorLine = view.state.doc.lineAt(head);
      callbacksRef.current.onCursorChange?.({
        line: cursorLine.number,
        column: head - cursorLine.from + 1,
      });
    });
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lintCompartment.current.reconfigure(
        linter((view) => diagnosticsFromErrors(validationErrors, view.state)),
      ),
    });
  }, [validationErrors]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: completionCompartment.current.reconfigure(ghostCompletion(completionText)),
    });
  }, [completionText]);

  return <div ref={hostRef} className="codemirror-host" />;
}

class GhostCompletionWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: GhostCompletionWidget) {
    return this.text === other.text;
  }

  toDOM() {
    const wrap = document.createElement("span");
    const ghost = document.createElement("span");
    ghost.className = "cm-ghost-completion";
    ghost.textContent = this.text;
    const hint = document.createElement("span");
    hint.className = "cm-ghost-hint";
    const kbd = document.createElement("kbd");
    kbd.textContent = "Tab";
    hint.append(kbd, document.createTextNode("to accept"));
    wrap.append(ghost, hint);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

const ghostCompletion = (text: string | null) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = ghostCompletionDecorations(view, text);
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged || update.viewportChanged) {
          this.decorations = ghostCompletionDecorations(update.view, text);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );

function ghostCompletionDecorations(view: EditorView, text: string | null): DecorationSet {
  if (!text || !view.state.selection.main.empty) return Decoration.set([]);
  return Decoration.set([
    Decoration.widget({
      widget: new GhostCompletionWidget(text),
      side: 1,
    }).range(view.state.selection.main.head),
  ]);
}

type FileValidationError = {
  line: number;
  message: string;
};

function validationErrorsForFile(
  errors: string[],
  relativePath: string,
): FileValidationError[] {
  return errors.flatMap((error) => {
    const match = error.match(/^([^:]+):(\d+)\s*(.*)$/);
    if (!match || match[1] !== relativePath) return [];
    return [{ line: Number(match[2]), message: match[3] || error }];
  });
}

function diagnosticsFromErrors(
  errors: FileValidationError[],
  state: EditorState,
): Diagnostic[] {
  return errors.map((error) => ({
    from: state.doc.line(Math.min(error.line, state.doc.lines)).from,
    to: state.doc.line(Math.min(error.line, state.doc.lines)).to,
    severity: "error",
    message: error.message,
    markClass: "cm-ledger-error",
  }));
}

const transactionFolding = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  if (!isTransactionStart(line.text)) return null;
  let endLine = line.number;
  for (let next = line.number + 1; next <= state.doc.lines; next += 1) {
    const text = state.doc.line(next).text;
    if (isTransactionStart(text) || text.trim() === "") break;
    endLine = next;
  }
  if (endLine === line.number) return null;
  return {
    from: line.to,
    to: state.doc.line(endLine).to,
  };
});

const beanDecorations = (onOpenInclude: (relativePath: string) => void) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildBeanDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildBeanDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        click(event) {
          const target = event.target as HTMLElement;
          const include = target.closest<HTMLElement>(".cm-include-link");
          if (!include) return false;
          const relativePath = include.textContent?.replace(/"/g, "").trim();
          if (!relativePath) return false;
          onOpenInclude(relativePath);
          return true;
        },
      },
    },
  );

function buildBeanDecorations(view: EditorView): DecorationSet {
  const builder: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    let position = from;
    while (position <= to) {
      const line = view.state.doc.lineAt(position);
      addLineDecorations(line.from, line.text, builder);
      position = line.to + 1;
    }
  }
  return Decoration.set(builder, true);
}

type Range<T> = {
  from: number;
  to: number;
  value: T;
};

function addLineDecorations(
  lineFrom: number,
  text: string,
  builder: Array<Range<Decoration>>,
) {
  const amountPattern = /[-+]?\d[\d,]*\.\d+/g;
  let amountMatch: RegExpExecArray | null;
  while ((amountMatch = amountPattern.exec(text))) {
    builder.push({
      from: lineFrom + amountMatch.index,
      to: lineFrom + amountMatch.index + amountMatch[0].length,
      value: Decoration.mark({ class: "cm-bean-amount" }),
    });
  }

  const stringPattern = /"[^"]*"/g;
  let stringMatch: RegExpExecArray | null;
  while ((stringMatch = stringPattern.exec(text))) {
    const isInclude = text.trimStart().startsWith("include ");
    builder.push({
      from: lineFrom + stringMatch.index,
      to: lineFrom + stringMatch.index + stringMatch[0].length,
      value: Decoration.mark({
        class: isInclude ? "cm-bean-string cm-include-link" : "cm-bean-string",
      }),
    });
  }
}

// CM6's built-in triple-click path relies on an internal docView API that is
// unreliable on WebKit/Tauri. This explicit mouseSelectionStyle takes over for
// detail >= 3 and selects the full document line, with drag-extend across lines.
const tripleClickLineSelect = EditorView.mouseSelectionStyle.of((view, event) => {
  if (event.detail < 3) return null;
  const anchorPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (anchorPos == null) return null;
  const anchorLine = view.state.doc.lineAt(anchorPos);
  return {
    get(moveEvent, _extend, _multiple) {
      const pos = view.posAtCoords({ x: moveEvent.clientX, y: moveEvent.clientY });
      const line = pos != null ? view.state.doc.lineAt(pos) : anchorLine;
      const from = Math.min(anchorLine.from, line.from);
      const to = Math.max(anchorLine.to, line.to);
      return EditorSelection.create([
        EditorSelection.range(from, to < view.state.doc.length ? to + 1 : to),
      ]);
    },
    update(_update) {},
  };
});

const currentTransactionHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = currentTransactionDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = currentTransactionDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function currentTransactionDecorations(view: EditorView): DecorationSet {
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);
  let start = cursorLine.number;
  for (let line = cursorLine.number; line >= 1; line -= 1) {
    const text = view.state.doc.line(line).text;
    if (isTransactionStart(text)) {
      start = line;
      break;
    }
    if (text.trim() === "") break;
  }
  let end = cursorLine.number;
  for (let line = cursorLine.number + 1; line <= view.state.doc.lines; line += 1) {
    const text = view.state.doc.line(line).text;
    if (text.trim() === "" || isTransactionStart(text)) break;
    end = line;
  }

  const decorations = [];
  for (let line = start; line <= end; line += 1) {
    decorations.push(
      Decoration.line({ class: "cm-current-transaction" }).range(view.state.doc.line(line).from),
    );
  }
  return Decoration.set(decorations);
}

export function alignTransactionAmounts(contents: string, activeLine: number): string {
  const lines = contents.split("\n");
  const next = [...lines];
  let blockStart = -1;
  for (let index = 0; index <= lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index === lines.length || (index > blockStart && isTransactionStart(line))) {
      if (blockStart >= 0) alignBlock(next, blockStart, index - 1, activeLine);
      blockStart = index < lines.length && isTransactionStart(line) ? index : -1;
    } else if (blockStart >= 0 && line.trim() === "") {
      alignBlock(next, blockStart, index - 1, activeLine);
      blockStart = -1;
    }
  }
  return next.join("\n");
}

function alignBlock(lines: string[], start: number, end: number, activeLine: number) {
  const amountRows = [];
  for (let index = start + 1; index <= end; index += 1) {
    if (index + 1 === activeLine) continue;
    const match = lines[index].match(/^(\s+\S.+?)(\s+)([-+]?\d[\d,]*)(\.\d+\s+\w+.*)$/);
    if (!match) continue;
    amountRows.push({ index, prefix: match[1].trimEnd(), amount: `${match[3]}${match[4]}` });
  }
  if (amountRows.length < 2) return;
  const maxPrefixLength = Math.max(...amountRows.map((row) => row.prefix.length));
  for (const row of amountRows) {
    lines[row.index] = `${row.prefix}${" ".repeat(maxPrefixLength - row.prefix.length + 2)}${row.amount}`;
  }
}

function isTransactionStart(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\s/.test(text);
}

function snapshotToTab(
  snapshot: LedgerFileSnapshot,
  cursor: number,
  scrollTop: number,
): OpenTab {
  return {
    relativePath: snapshot.relativePath,
    contents: snapshot.contents,
    savedContents: snapshot.contents,
    modifiedAt: snapshot.modifiedAt,
    cursor,
    scrollTop,
    isDirty: false,
  };
}

function tabToSession(tab: OpenTab): LedgerEditorTabSession {
  return {
    relativePath: tab.relativePath,
    cursor: tab.cursor,
    scrollTop: tab.scrollTop,
  };
}

function shortName(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath;
}

function lineNumberAt(contents: string, cursor: number): number {
  return contents.slice(0, cursor).split("\n").length;
}

export function completionLinePrefixAtCursor(contents: string, cursor: number): string | null {
  const boundedCursor = Math.max(0, Math.min(cursor, contents.length));
  const lineStart = contents.lastIndexOf("\n", boundedCursor - 1) + 1;
  const nextLineBreak = contents.indexOf("\n", boundedCursor);
  const lineEnd = nextLineBreak === -1 ? contents.length : nextLineBreak;
  if (boundedCursor !== lineEnd) return null;
  const linePrefix = contents.slice(lineStart, boundedCursor);
  return /^\d{4}-\d{2}-\d{2}\s/.test(linePrefix) ? linePrefix : null;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Ledger Editor could not complete that action.";
}
