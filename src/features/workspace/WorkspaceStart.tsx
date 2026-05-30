import type { RecentWorkspace } from "../../components/AppShell";

type WorkspaceStartProps = {
  recentWorkspaces?: RecentWorkspace[];
  onCreateBlank: () => void;
  onCreateExample: () => void;
  onOpenExisting: () => void;
  onOpenRecentWorkspace: (path: string) => void;
  error?: string | null;
};

export function WorkspaceStart({
  recentWorkspaces = [],
  onCreateBlank,
  onCreateExample,
  onOpenExisting,
  onOpenRecentWorkspace,
  error,
}: WorkspaceStartProps) {
  const visibleRecents = recentWorkspaces.slice(0, 5);

  return (
    <section className="workspace-start welcome-screen" aria-labelledby="workspace-start-title">
      <div className="welcome-content">
        <div className="welcome-brand" aria-label="Diurnum">
          <span className="brand-mark">D</span>
          <span className="welcome-brand-name">Diurnum</span>
        </div>

        <div className="welcome-heading">
          <p className="eyebrow">Local-first books</p>
          <h1 id="workspace-start-title">Open your accounting Workspace</h1>
          <p className="intro">
            Create a local Workspace, open one from disk, or continue where you
            left off.
          </p>
        </div>

        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <div className="welcome-cards" aria-label="Workspace start options">
          <button className="welcome-card" type="button" onClick={onCreateBlank}>
            <span className="welcome-card-icon" aria-hidden="true">
              +
            </span>
            <span>
              <strong>New blank workspace</strong>
              <small>Start clean with an empty App-Created Workspace.</small>
            </span>
          </button>
          <button className="welcome-card" type="button" onClick={onCreateExample}>
            <span className="welcome-card-icon" aria-hidden="true">
              *
            </span>
            <span>
              <strong>Example workspace</strong>
              <small>Use the example template in the New Workspace flow.</small>
            </span>
          </button>
          <button className="welcome-card" type="button" onClick={onOpenExisting}>
            <span className="welcome-card-icon" aria-hidden="true">
              ^
            </span>
            <span>
              <strong>Open existing workspace</strong>
              <small>Choose a folder that Diurnum already created.</small>
            </span>
          </button>
        </div>

        {visibleRecents.length > 0 ? (
          <section className="welcome-recents" aria-labelledby="welcome-recents-title">
            <h2 id="welcome-recents-title">Recent Workspaces</h2>
            <div className="welcome-recent-list">
              {visibleRecents.map((workspace) => {
                const exists = workspace.exists !== false;
                return (
                  <button
                    className="welcome-recent"
                    type="button"
                    key={workspace.path}
                    disabled={!exists}
                    onClick={() => onOpenRecentWorkspace(workspace.path)}
                  >
                    <span>
                      <strong>{workspace.displayName}</strong>
                      <small>{truncatePath(workspace.path)}</small>
                    </span>
                    <small>{formatRecentTime(workspace.lastOpenedAt)}</small>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <p className="welcome-footnote">Your books are stored locally. No account required.</p>
      </div>
    </section>
  );
}

function truncatePath(path: string): string {
  if (path.length <= 48) return path;
  return `...${path.slice(-45)}`;
}

function formatRecentTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
