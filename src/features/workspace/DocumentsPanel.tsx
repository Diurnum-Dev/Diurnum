import { useEffect, useRef, useState } from "react";
import {
  createDocumentFolder,
  deleteDocumentEntry,
  getDocumentsState,
  importDocumentFile,
  openExternalPath,
  readDocumentPreview,
  renameDocumentEntry,
} from "../../lib/workspace/api";
import type {
  DocumentFileSummary,
  DocumentFolderSummary,
  DocumentPreview,
  DocumentsState,
  WorkspaceSummary,
} from "../../lib/workspace/types";

type DocumentsPanelProps = {
  workspace: WorkspaceSummary;
  onError: (message: string | null) => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  entry: DocumentFolderSummary | DocumentFileSummary;
  isFolder: boolean;
};

export function DocumentsPanel({ workspace, onError }: DocumentsPanelProps) {
  const [state, setState] = useState<DocumentsState | null>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFolder, setPendingFolder] = useState("");
  const previewUrl = usePreviewUrl(preview);

  useEffect(() => {
    void loadDocuments();
  }, [workspace.rootPath]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeMenu() {
      setContextMenu(null);
    }
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [contextMenu]);

  async function loadDocuments(selectedFolder?: string) {
    setIsLoading(true);
    onError(null);
    try {
      const next = await getDocumentsState({
        workspaceRootPath: workspace.rootPath,
        selectedFolder: selectedFolder ?? state?.selectedFolder ?? "",
      });
      setState(next);
      setPreview(null);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function openPreview(relativePath: string) {
    onError(null);
    try {
      setPreview(
        await readDocumentPreview({
          workspaceRootPath: workspace.rootPath,
          relativePath,
        }),
      );
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function handleImportFiles(fileList: FileList | null) {
    if (!fileList || !state) return;
    onError(null);
    try {
      for (const file of Array.from(fileList)) {
        await importDocumentFile({
          workspaceRootPath: workspace.rootPath,
          targetFolder: state.selectedFolder,
          fileName: file.name,
          bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        });
      }
      await loadDocuments(state.selectedFolder);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function handleCreateFolder() {
    const folderName = pendingFolder.trim();
    if (!folderName || !state) return;
    onError(null);
    try {
      await createDocumentFolder({
        workspaceRootPath: workspace.rootPath,
        parentRelativePath: state.selectedFolder || null,
        name: folderName,
      });
      setPendingFolder("");
      await loadDocuments(state.selectedFolder);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function handleRename(entry: ContextMenuState["entry"]) {
    const newName = window.prompt("Rename document entry", entry.name)?.trim();
    if (!newName) return;
    try {
      await renameDocumentEntry({
        workspaceRootPath: workspace.rootPath,
        relativePath: entry.relativePath,
        newName,
      });
      await loadDocuments(nextFolderAfterRename(state?.selectedFolder ?? "", entry.relativePath, newName));
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function handleDelete(entry: ContextMenuState["entry"]) {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    try {
      await deleteDocumentEntry({
        workspaceRootPath: workspace.rootPath,
        relativePath: entry.relativePath,
      });
      await loadDocuments(nextFolderAfterDelete(state?.selectedFolder ?? "", entry.relativePath));
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  if (isLoading || !state) {
    return (
      <section className="documents-panel" aria-label="Documents">
        <p className="empty-note">Loading documents...</p>
      </section>
    );
  }

  return (
    <section className="documents-panel" aria-label="Documents">
      <div className="documents-toolbar">
        <div>
          <p className="eyebrow">Workspace files</p>
          <h1>Documents</h1>
        </div>
        <div className="documents-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Add files
          </button>
          <button className="secondary-button" type="button" onClick={() => void openExternalPath(workspace.rootPath)}>
            Open Workspace
          </button>
        </div>
      </div>

      <div className="documents-layout">
        <aside className="documents-tree" aria-label="Document folders">
          {state.folders.map((folder) => (
            <button
              key={folder.relativePath || "documents-root"}
              className={folder.relativePath === state.selectedFolder ? "active" : ""}
              type="button"
              style={{ paddingLeft: `${12 + folder.depth * 14}px` }}
              onClick={() => void loadDocuments(folder.relativePath)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  entry: folder,
                  isFolder: true,
                });
              }}
            >
              <span>{folder.name}</span>
              {folder.isSourceAccountFolder ? <small>Source Account</small> : null}
            </button>
          ))}

          <div className="documents-folder-create">
            <input
              aria-label="New folder name"
              value={pendingFolder}
              onChange={(event) => setPendingFolder(event.target.value)}
              placeholder="New folder"
            />
            <button className="secondary-button" type="button" onClick={handleCreateFolder}>
              Create
            </button>
          </div>
        </aside>

        <div className="documents-content">
          <div
            className="documents-file-list"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleImportFiles(event.dataTransfer.files);
            }}
          >
            <div className="documents-file-header">
              <span>Name</span>
              <span>Modified</span>
              <span>Size</span>
            </div>
            {state.files.length > 0 ? (
              state.files.map((file) => (
                <button
                  key={file.relativePath}
                  className="documents-file-row"
                  type="button"
                  onClick={() => void openPreview(file.relativePath)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      entry: file,
                      isFolder: false,
                    });
                  }}
                >
                  <span>{file.name}</span>
                  <span>{formatDate(file.modifiedAt)}</span>
                  <span>{formatSize(file.sizeBytes)}</span>
                </button>
              ))
            ) : (
              <p className="empty-note">Drop files here or use Add files.</p>
            )}
          </div>

          <div className="documents-preview" aria-label="Document preview">
            {preview ? (
              <>
                <div className="documents-preview-header">
                  <strong>{preview.fileName}</strong>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void openExternalPath(preview.absolutePath)}
                  >
                    Open externally
                  </button>
                </div>
                {preview.kind === "text" ? (
                  <pre>{preview.textContent}</pre>
                ) : null}
                {preview.kind === "pdf" && previewUrl ? (
                  <iframe title={preview.fileName} src={previewUrl} />
                ) : null}
                {preview.kind === "image" && previewUrl ? (
                  <img alt={preview.fileName} src={previewUrl} />
                ) : null}
                {preview.kind === "unsupported" ? (
                  <p className="empty-note">This file type opens in the system default app.</p>
                ) : null}
              </>
            ) : (
              <p className="empty-note">Select a document to preview it.</p>
            )}
          </div>
        </div>
      </div>

      {contextMenu ? (
        <div
          className="documents-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button type="button" onClick={() => void openExternalPath(contextMenu.entry.absolutePath)}>
            Open in Finder
          </button>
          <button type="button" onClick={() => void handleRename(contextMenu.entry)}>
            Rename
          </button>
          <button type="button" onClick={() => void handleDelete(contextMenu.entry)}>
            Delete
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        hidden
        multiple
        type="file"
        onChange={(event) => {
          void handleImportFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </section>
  );
}

function usePreviewUrl(preview: DocumentPreview | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!preview?.bytes || !preview.mimeType) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(
      new Blob([new Uint8Array(preview.bytes)], { type: preview.mimeType }),
    );
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [preview]);

  return url;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Documents could not complete that action.";
}

function nextFolderAfterRename(selectedFolder: string, relativePath: string, newName: string) {
  if (!selectedFolder || selectedFolder === relativePath) {
    const parent = relativePath.split("/").slice(0, -1).join("/");
    return [parent, newName].filter(Boolean).join("/");
  }
  if (selectedFolder.startsWith(`${relativePath}/`)) {
    return selectedFolder.replace(relativePath, [relativePath.split("/").slice(0, -1).join("/"), newName].filter(Boolean).join("/"));
  }
  return selectedFolder;
}

function nextFolderAfterDelete(selectedFolder: string, relativePath: string) {
  if (selectedFolder === relativePath || selectedFolder.startsWith(`${relativePath}/`)) {
    return relativePath.split("/").slice(0, -1).join("/");
  }
  return selectedFolder;
}
