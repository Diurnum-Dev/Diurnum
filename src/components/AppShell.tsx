import type { ReactNode } from "react";
import type { LedgerStatus, WorkspaceGitStatus } from "../lib/workspace/types";

export type WorkspaceScreen =
  | "ledger"
  | "inbox"
  | "reports"
  | "documents"
  | "import"
  | "git"
  | "settings";

export type RecentWorkspace = {
  path: string;
  displayName: string;
  lastOpenedAt: string;
  exists?: boolean;
};

type AppShellProps = {
  workspaceName: string;
  activeScreen: WorkspaceScreen;
  pendingInboxCount: number;
  recentWorkspaces: RecentWorkspace[];
  gitStatus: WorkspaceGitStatus;
  ledgerStatus: LedgerStatus;
  ledgerErrorCount: number;
  statusContext: string;
  switcherOpen: boolean;
  children: ReactNode;
  onToggleSwitcher: () => void;
  onNavigate: (screen: WorkspaceScreen) => void;
  onOpenRecentWorkspace: (path: string) => void;
  onRemoveRecentWorkspace: (path: string) => void;
  onOpenExistingWorkspace: () => void;
};

const navItems: Array<{
  screen: WorkspaceScreen;
  label: string;
  icon: string;
  gitOnly?: boolean;
}> = [
  { screen: "ledger", label: "Ledger", icon: "M4 5h10M4 9h10M4 13h7" },
  { screen: "inbox", label: "Inbox", icon: "M3 5h12v7l-2 3H5l-2-3V5z" },
  { screen: "reports", label: "Reports", icon: "M4 13V7m4 6V4m4 9V9" },
  { screen: "documents", label: "Documents", icon: "M5 3h6l3 3v9H5V3z" },
  { screen: "import", label: "Import", icon: "M8 3v8m0 0 3-3m-3 3L5 8M4 14h8" },
  {
    screen: "git",
    label: "Git",
    icon: "M8 3v4m0 0 4 2m-4-2-4 2m0 0v4m8-4v4",
    gitOnly: true,
  },
  {
    screen: "settings",
    label: "Settings",
    icon: "M8 4v1m0 6v1M4 8H3m10 0h-1M5.2 5.2l.7.7m4.2 4.2.7.7m0-5.6-.7.7m-4.2 4.2-.7.7M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  },
];

export function AppShell({
  workspaceName,
  activeScreen,
  pendingInboxCount,
  recentWorkspaces,
  gitStatus,
  ledgerStatus,
  ledgerErrorCount,
  statusContext,
  switcherOpen,
  children,
  onToggleSwitcher,
  onNavigate,
  onOpenRecentWorkspace,
  onRemoveRecentWorkspace,
  onOpenExistingWorkspace,
}: AppShellProps) {
  const visibleNavItems = navItems.filter((item) => !item.gitOnly || gitStatus.isRepository);

  return (
    <div className="app-shell app-shell--workspace">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-stack">
          <div className="workspace-switcher">
            <button
              className="workspace-switcher-button"
              type="button"
              aria-expanded={switcherOpen}
              aria-haspopup="menu"
              onClick={onToggleSwitcher}
            >
              <span className="brand-mark">D</span>
              <span className="workspace-switcher-copy">
                <span className="workspace-switcher-name">{workspaceName}</span>
                <span className="workspace-switcher-subtitle">Workspace</span>
              </span>
              <span aria-hidden="true" className="workspace-switcher-chevron">
                v
              </span>
            </button>

            {switcherOpen ? (
              <div className="workspace-switcher-menu" role="menu">
                <div className="switcher-heading">Recent Workspaces</div>
                {recentWorkspaces.length > 0 ? (
                  recentWorkspaces.slice(0, 10).map((recent) => {
                    const exists = recent.exists !== false;
                    return (
                      <div
                        className={`recent-workspace ${exists ? "" : "recent-workspace--missing"}`}
                        key={recent.path}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!exists}
                          onClick={() => onOpenRecentWorkspace(recent.path)}
                        >
                          <span>{recent.displayName}</span>
                          <small>{truncatePath(recent.path)}</small>
                        </button>
                        {!exists ? (
                          <button
                            className="remove-recent-button"
                            type="button"
                            onClick={() => onRemoveRecentWorkspace(recent.path)}
                          >
                            Remove from recents
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-recents">No recent Workspaces</div>
                )}
                <button
                  className="open-existing-action"
                  type="button"
                  role="menuitem"
                  onClick={onOpenExistingWorkspace}
                >
                  Open existing...
                </button>
              </div>
            ) : null}
          </div>

          <nav aria-label="Workspace screens">
            <div className="nav-caps">Workspace</div>
            <div className="nav-group">
              {visibleNavItems.map((item) => (
                <button
                  className={`nav-item ${activeScreen === item.screen ? "active" : ""}`}
                  type="button"
                  key={item.screen}
                  aria-current={activeScreen === item.screen ? "page" : undefined}
                  onClick={() => onNavigate(item.screen)}
                >
                  <Icon path={item.icon} />
                  <span className="label">{item.label}</span>
                  {item.screen === "inbox" && pendingInboxCount > 0 ? (
                    <span className="count-badge">{pendingInboxCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="sidebar-footer">
          <button
            className="settings-gear"
            type="button"
            aria-label="Settings"
            onClick={() => onNavigate("settings")}
          >
            <Icon path="M8 4v1m0 6v1M4 8H3m10 0h-1M5.2 5.2l.7.7m4.2 4.2.7.7m0-5.6-.7.7m-4.2 4.2-.7.7M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
          </button>
        </div>
      </aside>

      <main className="shell-main">
        <div className="main-pane">{children}</div>
        <footer className="status-bar" aria-label="Workspace status">
          <span>{statusContext}</span>
          <span className="status-bar-right">
            <span className={`ledger-status ledger-status--${ledgerStatus}`}>
              {ledgerStatus === "valid" ? "Valid" : `${ledgerErrorCount} errors`}
            </span>
            {gitStatus.isRepository ? (
              <span>
                {gitStatus.uncommittedChangesCount > 0
                  ? `${gitStatus.uncommittedChangesCount} uncommitted`
                  : `Git clean${gitStatus.branchName ? ` - ${gitStatus.branchName}` : ""}`}
              </span>
            ) : null}
          </span>
        </footer>
      </main>
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none">
      <path
        d={path}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function truncatePath(path: string): string {
  if (path.length <= 34) return path;
  return `...${path.slice(-31)}`;
}
