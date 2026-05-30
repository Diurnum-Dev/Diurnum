import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div>
          <div className="brand">Diurnum</div>
          <div className="sidebar-note">Local-First MVP</div>
        </div>
      </aside>
      <main className="main-pane">{children}</main>
    </div>
  );
}
