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
  recentLedgerFiles: string[];
  gitStatus: WorkspaceGitStatus;
  gitWarning: string | null;
  ledgerStatus: LedgerStatus;
  ledgerErrorCount: number;
  statusContext: string;
  ledgerCursor?: { line: number; column: number } | null;
  switcherOpen: boolean;
  children: ReactNode;
  onToggleSwitcher: () => void;
  onNavigate: (screen: WorkspaceScreen) => void;
  onOpenRecentWorkspace: (path: string) => void;
  onRemoveRecentWorkspace: (path: string) => void;
  onOpenExistingWorkspace: () => void;
  onOpenRecentFile: (relativePath: string) => void;
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
  recentLedgerFiles,
  gitStatus,
  gitWarning,
  ledgerStatus,
  ledgerErrorCount,
  statusContext,
  ledgerCursor,
  switcherOpen,
  children,
  onToggleSwitcher,
  onNavigate,
  onOpenRecentWorkspace,
  onRemoveRecentWorkspace,
  onOpenExistingWorkspace,
  onOpenRecentFile,
}: AppShellProps) {
  const visibleNavItems = navItems.filter((item) => !item.gitOnly || gitStatus.isRepository);

  return (
    <div className="app-shell app-shell--workspace">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-titlebar" data-tauri-drag-region />
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

            {recentLedgerFiles.length > 0 ? (
              <>
                <div className="nav-caps nav-caps--recent">Recent</div>
                <div className="nav-group">
                  {recentLedgerFiles.map((filePath) => {
                    const basename = filePath.split("/").pop() ?? filePath;
                    return (
                      <button
                        className="nav-item nav-item--recent"
                        type="button"
                        key={filePath}
                        title={filePath}
                        onClick={() => onOpenRecentFile(filePath)}
                      >
                        <FileIcon />
                        <span className="label">{basename}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </nav>
        </div>

        {/*
          Sidebar footer intentionally empty. Diurnum is local-first with no
          account required, so there is no user/account UI here. This space is
          reserved for a future remote sync / web-service surface (account,
          sync status, sign-in). "Close Workspace" lives in the native app
          menu. See docs/adr/0002-sidebar-footer-reserved-for-sync.md.
        */}
      </aside>

      <main
        className={`shell-main${activeScreen === "inbox" || activeScreen === "ledger" ? " shell-main--fill" : ""}`}
      >
        {/* The ledger screen provides its own drag surfaces (tab drag zone,
            explorer header, sidebar top), so the full-width strip — which would
            overlay the top of the tabs — is omitted there. */}
        {activeScreen !== "ledger" ? (
          <div className="window-drag-strip" data-tauri-drag-region />
        ) : null}
        <div
          className={
            activeScreen === "inbox"
              ? "main-pane main-pane--fill"
              : activeScreen === "ledger"
                ? "main-pane main-pane--flush"
                : "main-pane"
          }
        >
          {children}
        </div>
        <footer className="status-bar" aria-label="Workspace status">
          {activeScreen === "ledger" ? (
            <>
              <span className="status-bar-item">{statusContext || "Ledger"}</span>
              {ledgerCursor ? (
                <>
                  <span className="status-sep">·</span>
                  <span className="status-bar-item">
                    Ln {ledgerCursor.line}, Col {ledgerCursor.column}
                  </span>
                </>
              ) : null}
              <span className="status-sep">·</span>
              {ledgerStatus === "valid" ? (
                <span className="status-bar-item status-valid">
                  <svg
                    className="status-check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  Valid
                </span>
              ) : (
                <span className="status-bar-item" style={{ color: "var(--color-destructive)" }}>
                  {ledgerErrorCount} errors
                </span>
              )}
              <span className="status-bar-spacer" />
              {gitStatus.isRepository && gitStatus.uncommittedChangesCount > 0 ? (
                <>
                  <span className="status-bar-item">
                    <span className="status-dirty-dot" />
                    {gitStatus.uncommittedChangesCount} uncommitted
                  </span>
                  <span className="status-sep">·</span>
                </>
              ) : null}
              <span className="status-bar-item">UTF-8</span>
              <span className="status-sep">·</span>
              <span className="status-bar-item">Beancount</span>
            </>
          ) : (
            <>
              <span>{statusContext}</span>
              <span className="status-bar-right">
                <span className={`ledger-status ledger-status--${ledgerStatus}`}>
                  {ledgerStatus === "valid" ? "Valid" : `${ledgerErrorCount} errors`}
                </span>
                {gitWarning ? <span className="status-warning">{gitWarning}</span> : null}
                {gitStatus.isRepository ? (
                  <span>
                    {gitStatus.uncommittedChangesCount > 0
                      ? `${gitStatus.uncommittedChangesCount} uncommitted`
                      : `Git clean${gitStatus.branchName ? ` - ${gitStatus.branchName}` : ""}`}
                  </span>
                ) : null}
              </span>
            </>
          )}
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

function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function truncatePath(path: string): string {
  if (path.length <= 34) return path;
  return `...${path.slice(-31)}`;
}
