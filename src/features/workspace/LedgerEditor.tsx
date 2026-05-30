import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, Compartment, EditorSelection } from "@codemirror/state";
import { EditorView, Decoration, keymap, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { bracketMatching, foldGutter, foldKeymap, foldService } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type {
  LedgerEditorSession,
  LedgerEditorTabSession,
  LedgerFileSnapshot,
  LedgerValidationSummary,
  WorkspaceSummary,
} from "../../lib/workspace/types";
import {
  getLedgerEditorState,
  readLedgerFile,
  saveLedgerEditorSession,
  saveLedgerFile,
  validateWorkspace,
} from "../../lib/workspace/api";

type LedgerEditorProps = {
  workspace: WorkspaceSummary;
  requestedFile?: string | null;
  onActiveFileChange: (relativePath: string) => void;
  onValidationChange: (validation: LedgerValidationSummary) => void;
  onError: (message: string | null) => void;
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
  onActiveFileChange,
  onValidationChange,
  onError,
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
          snapshotToTab(snapshot, preferredCursor, 0),
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
        setRecentlyClosedTabs(state.session.recentlyClosedTabs);
        const snapshots = await Promise.all(
          state.session.openTabs.map((tab) =>
            readLedgerFile({
              workspaceRootPath: workspace.rootPath,
              relativePath: tab.relativePath,
            }).then((snapshot) => snapshotToTab(snapshot, tab.cursor, tab.scrollTop)),
          ),
        );
        if (cancelled) return;
        setTabs(snapshots.length > 0 ? snapshots : []);
        setActivePath(state.session.activeTab || MAIN_FILE);
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
  }, [onError, workspace.rootPath]);

  useEffect(() => {
    if (!requestedFile) return;
    void openFile(requestedFile);
  }, [openFile, requestedFile]);

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
      setValidationErrors(validation.errors);
      onValidationChange(validation);
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
  }, [activePath, onError, onValidationChange, tabs, workspace.rootPath]);

  useEffect(() => {
    if (!activeTab?.isDirty) return;
    const timeout = window.setTimeout(() => void saveActiveFile(), 2000);
    return () => window.clearTimeout(timeout);
  }, [activeTab?.contents, activeTab?.isDirty, saveActiveFile]);

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

      <div className="ledger-editor-toolbar">
        <button className="secondary-button" type="button" onClick={() => setCommandOpen(true)}>
          Open file
        </button>
        <button className="secondary-button" type="button" onClick={() => void saveActiveFile()}>
          Save
        </button>
        <span>{isSaving ? "Saving..." : activeTab.isDirty ? "Unsaved" : "Saved"}</span>
      </div>

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
        <aside className="ledger-file-tree" aria-label="Ledger files">
          {files.map((file) => (
            <button
              className={file === activePath ? "active" : ""}
              type="button"
              key={file}
              onClick={() => void openFile(file)}
            >
              {file}
            </button>
          ))}
        </aside>

        <div className="ledger-editor-pane">
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
                {tab.isDirty ? <span aria-label="Unsaved changes">*</span> : null}
                <span
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
                  x
                </span>
              </button>
            ))}
          </div>
          <CodeMirrorEditor
            key={activePath}
            contents={activeTab.contents}
            cursor={activeTab.cursor}
            scrollTop={activeTab.scrollTop}
            validationErrors={validationErrorsForFile(validationErrors, activePath)}
            onChange={updateActiveContents}
            onSave={saveActiveFile}
            onCloseTab={() => closeTab()}
            onReopenTab={reopenClosedTab}
            onOpenInclude={(relativePath) => void openFile(relativePath)}
          />
        </div>
      </div>
    </section>
  );
}

type CodeMirrorEditorProps = {
  contents: string;
  cursor: number;
  scrollTop: number;
  validationErrors: FileValidationError[];
  onChange: (contents: string, cursor: number, scrollTop: number) => void;
  onSave: () => void;
  onCloseTab: () => void;
  onReopenTab: () => void;
  onOpenInclude: (relativePath: string) => void;
};

function CodeMirrorEditor({
  contents,
  cursor,
  scrollTop,
  validationErrors,
  onChange,
  onSave,
  onCloseTab,
  onReopenTab,
  onOpenInclude,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lintCompartment = useRef(new Compartment());
  const callbacksRef = useRef({
    onChange,
    onSave,
    onCloseTab,
    onReopenTab,
    onOpenInclude,
  });

  useEffect(() => {
    callbacksRef.current = {
      onChange,
      onSave,
      onCloseTab,
      onReopenTab,
      onOpenInclude,
    };
  }, [onChange, onSave, onCloseTab, onReopenTab, onOpenInclude]);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: contents,
        selection: EditorSelection.cursor(Math.min(cursor, contents.length)),
        extensions: [
          basicSetup,
          lintGutter(),
          bracketMatching(),
          foldGutter(),
          transactionFolding,
          beanDecorations((relativePath) => callbacksRef.current.onOpenInclude(relativePath)),
          currentTransactionHighlight,
          lintCompartment.current.of(
            linter((view) => diagnosticsFromErrors(validationErrors, view.state)),
          ),
          keymap.of([
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
            callbacksRef.current.onChange(
              update.state.doc.toString(),
              update.state.selection.main.head,
              update.view.scrollDOM.scrollTop,
            );
          }),
        ],
      }),
    });
    viewRef.current = view;
    window.requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = scrollTop;
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

  return <div ref={hostRef} className="codemirror-host" />;
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

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Ledger Editor could not complete that action.";
}
