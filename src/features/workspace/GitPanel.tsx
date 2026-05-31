import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  commitGitChanges,
  getGitCommitDiff,
} from "../../lib/workspace/api";
import type {
  GitCommitDiff,
  GitCommitSummary,
  GitPanelState,
} from "../../lib/workspace/types";

type GitPanelProps = {
  workspaceRootPath: string;
  state: GitPanelState | null;
  warning: string | null;
  hookOutput: string | null;
  onWarningChange: (warning: string | null) => void;
  onHookOutputChange: (output: string | null) => void;
  onRefresh: () => Promise<void> | void;
  onError: (message: string | null) => void;
};

export function GitPanel({
  workspaceRootPath,
  state,
  warning,
  hookOutput,
  onWarningChange,
  onHookOutputChange,
  onRefresh,
  onError,
}: GitPanelProps) {
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitDiff, setSelectedCommitDiff] = useState<GitCommitDiff | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!state) return;
    setSelectedPaths(
      Object.fromEntries(state.workingTree.map((entry) => [entry.path, true])),
    );
  }, [state?.workingTree]);

  useEffect(() => {
    if (!state || state.recentCommits.length === 0) {
      setSelectedCommitHash(null);
      setSelectedCommitDiff(null);
      return;
    }
    const nextHash =
      selectedCommitHash && state.recentCommits.some((commit) => commit.hash === selectedCommitHash)
        ? selectedCommitHash
        : state.recentCommits[0].hash;
    setSelectedCommitHash(nextHash);
  }, [selectedCommitHash, state]);

  useEffect(() => {
    if (!workspaceRootPath || !selectedCommitHash) {
      setSelectedCommitDiff(null);
      return;
    }
    let cancelled = false;
    void getGitCommitDiff(workspaceRootPath, selectedCommitHash)
      .then((diff) => {
        if (!cancelled) {
          setSelectedCommitDiff(diff);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setSelectedCommitDiff(null);
        onError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [onError, selectedCommitHash, workspaceRootPath]);

  const selectedWorkingTreePaths = useMemo(
    () => state?.workingTree.filter((entry) => selectedPaths[entry.path]).map((entry) => entry.path) ?? [],
    [selectedPaths, state?.workingTree],
  );

  async function handleCommit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state?.isRepository) return;
    setIsSubmitting(true);
    onError(null);
    try {
      const result = await commitGitChanges({
        workspaceRootPath,
        message: customMessage.trim(),
        paths: selectedWorkingTreePaths,
      });
      onWarningChange(result.warning ?? null);
      onHookOutputChange(result.hookOutput ?? null);
      if (result.committed && result.commitHash) {
        setSelectedCommitHash(result.commitHash);
      }
      setCustomMessage("");
      await onRefresh();
    } catch (error) {
      onWarningChange(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!state || !state.isRepository) {
    return (
      <section className="git-panel" aria-labelledby="git-panel-title">
        <p className="empty-note">Git Integration is unavailable for this Workspace.</p>
      </section>
    );
  }

  return (
    <section className="git-panel" aria-labelledby="git-panel-title">
      <div className="git-panel-header">
        <div>
          <p className="eyebrow">Git</p>
          <h1 id="git-panel-title">Workspace history</h1>
        </div>
        <div className="git-panel-meta">
          <span className="branch-chip">{state.branchName ?? "detached"}</span>
          <span className="git-panel-state">
            {state.uncommittedChangesCount > 0
              ? `${state.uncommittedChangesCount} changed`
              : "Working tree clean"}
          </span>
        </div>
      </div>

      {warning ? (
        <div className="git-warning-banner" role="alert">
          <strong>Git warning</strong>
          <span>{warning}</span>
        </div>
      ) : null}

      {hookOutput ? (
        <pre className="git-hook-output" aria-label="Pre-commit hook output">
          {hookOutput}
        </pre>
      ) : null}

      <div className="git-panel-layout">
        <aside className="git-panel-sidebar">
          <section className="git-section">
            <div className="section-heading">
              <p className="eyebrow">Working Tree</p>
              <h2>Files to commit</h2>
            </div>
            {state.workingTree.length > 0 ? (
              <form className="git-commit-form" onSubmit={handleCommit}>
                <div className="git-file-list">
                  {state.workingTree.map((entry) => (
                    <label className="git-file-row" key={`${entry.status}-${entry.path}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedPaths[entry.path])}
                        onChange={(event) =>
                          setSelectedPaths((current) => ({
                            ...current,
                            [entry.path]: event.target.checked,
                          }))
                        }
                      />
                      <span className={`git-file-status git-file-status--${entry.statusLabel.toLowerCase()}`}>
                        {entry.statusLabel}
                      </span>
                      <span className="git-file-path">{entry.path}</span>
                      {entry.originalPath ? <small>{entry.originalPath}</small> : null}
                    </label>
                  ))}
                </div>
                <label className="git-message-field">
                  Custom commit message
                  <input
                    value={customMessage}
                    onChange={(event) => setCustomMessage(event.target.value)}
                    placeholder="Commit selected files"
                  />
                </label>
                <div className="action-row">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isSubmitting || !customMessage.trim() || selectedWorkingTreePaths.length === 0}
                  >
                    {isSubmitting ? "Committing..." : "Commit with custom message..."}
                  </button>
                </div>
              </form>
            ) : (
              <p className="empty-note">No modified files to commit.</p>
            )}
          </section>

          <section className="git-section">
            <div className="section-heading">
              <p className="eyebrow">Recent Commits</p>
              <h2>Last 20 commits</h2>
            </div>
            {state.recentCommits.length > 0 ? (
              <div className="git-commit-list">
                {state.recentCommits.map((commit) => (
                  <button
                    className={`git-commit-row ${commit.hash === selectedCommitHash ? "active" : ""}`}
                    type="button"
                    key={commit.hash}
                    onClick={() => setSelectedCommitHash(commit.hash)}
                  >
                    <div className="git-commit-row-main">
                      <span className="git-commit-hash">{commit.shortHash}</span>
                      <span className="git-commit-message">{commit.summary}</span>
                    </div>
                    <small>{new Date(commit.committedAt).toLocaleString()}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-note">No commits yet.</p>
            )}
          </section>
        </aside>

        <section className="git-diff-pane" aria-labelledby="git-diff-title">
          <div className="section-heading">
            <p className="eyebrow">Diff Viewer</p>
            <h2 id="git-diff-title">
              {selectedCommitDiff?.summary ?? "Select a commit to view its diff"}
            </h2>
          </div>
          {selectedCommitDiff ? (
            <article className="git-diff">
              <div className="git-diff-header">
                <span className="git-commit-hash">{selectedCommitDiff.shortHash}</span>
                <span>{new Date(selectedCommitDiff.committedAt).toLocaleString()}</span>
              </div>
              <pre className="git-diff-body" aria-label="Commit diff">
                {renderDiff(selectedCommitDiff.diff)}
              </pre>
            </article>
          ) : (
            <p className="empty-note">Pick a commit from the list to inspect the patch.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function renderDiff(diff: string) {
  return diff.split("\n").map((line, index) => {
    const className =
      line.startsWith("+") && !line.startsWith("+++") ? "git-diff-line git-diff-line--add" :
      line.startsWith("-") && !line.startsWith("---") ? "git-diff-line git-diff-line--del" :
      line.startsWith("@@") ? "git-diff-line git-diff-line--hunk" :
      line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("rename ") ? "git-diff-line git-diff-line--meta" :
      "git-diff-line";
    return (
      <span className={className} key={`${index}-${line}`}>
        {line}
      </span>
    );
  });
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Git Integration could not complete that action.";
}
