import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell, type RecentWorkspace } from "./AppShell";

const recentWorkspaces: RecentWorkspace[] = [
  {
    path: "/Users/ryenski/Books/Acme Studio",
    displayName: "Acme Studio",
    lastOpenedAt: "2026-05-30T12:00:00Z",
    exists: true,
  },
  {
    path: "/Users/ryenski/Books/Missing Shop",
    displayName: "Missing Shop",
    lastOpenedAt: "2026-05-29T12:00:00Z",
    exists: false,
  },
];

function renderShell(
  overrides: Partial<Parameters<typeof AppShell>[0]> = {},
) {
  const props: Parameters<typeof AppShell>[0] = {
    workspaceName: "Acme Studio",
    activeScreen: "ledger",
    pendingInboxCount: 3,
    recentWorkspaces,
    gitStatus: {
      isRepository: false,
      branchName: null,
      uncommittedChangesCount: 0,
    },
    gitWarning: null,
    ledgerStatus: "valid",
    ledgerErrorCount: 0,
    statusContext: "main.bean",
    switcherOpen: false,
    onToggleSwitcher: vi.fn(),
    onNavigate: vi.fn(),
    onOpenRecentWorkspace: vi.fn(),
    onRemoveRecentWorkspace: vi.fn(),
    onOpenExistingWorkspace: vi.fn(),
    onCloseWorkspace: vi.fn(),
    children: <div>Workspace content</div>,
    ...overrides,
  };

  render(<AppShell {...props} />);
  return props;
}

describe("AppShell", () => {
  it("renders Workspace navigation, active state, Inbox badge, and status bar", () => {
    renderShell();

    expect(screen.getByRole("button", { name: /Acme Studio/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ledger/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /Inbox 3/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Settings/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Close Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Git/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Workspace status")).toHaveTextContent("main.bean");
    expect(screen.getByLabelText("Workspace status")).toHaveTextContent("Valid");
  });

  it("shows Git navigation and uncommitted state only for Git Workspaces", () => {
    renderShell({
      activeScreen: "git",
      statusContext: "Git",
      gitStatus: {
        isRepository: true,
        branchName: "main",
        uncommittedChangesCount: 2,
      },
      gitWarning: "Pre-commit hook failed.",
    });

    expect(screen.getByRole("button", { name: /Git/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByLabelText("Workspace status")).toHaveTextContent("2 uncommitted");
    expect(screen.getByLabelText("Workspace status")).toHaveTextContent(
      "Pre-commit hook failed.",
    );
  });

  it("lists recent Workspaces, disables missing folders, removes missing recents, and opens existing", async () => {
    const user = userEvent.setup();
    const onOpenRecentWorkspace = vi.fn();
    const onRemoveRecentWorkspace = vi.fn();
    const onOpenExistingWorkspace = vi.fn();

    renderShell({
      switcherOpen: true,
      onOpenRecentWorkspace,
      onRemoveRecentWorkspace,
      onOpenExistingWorkspace,
    });

    await user.click(screen.getByRole("menuitem", { name: /Acme Studio/ }));
    expect(onOpenRecentWorkspace).toHaveBeenCalledWith(
      "/Users/ryenski/Books/Acme Studio",
    );

    expect(screen.getByRole("menuitem", { name: /Missing Shop/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Remove from recents" }));
    expect(onRemoveRecentWorkspace).toHaveBeenCalledWith(
      "/Users/ryenski/Books/Missing Shop",
    );

    await user.click(screen.getByRole("menuitem", { name: "Open existing..." }));
    expect(onOpenExistingWorkspace).toHaveBeenCalledOnce();
  });

  it("closes the current Workspace from the sidebar footer", async () => {
    const user = userEvent.setup();
    const onCloseWorkspace = vi.fn();

    renderShell({ onCloseWorkspace });

    await user.click(screen.getByRole("button", { name: "Close Workspace" }));

    expect(onCloseWorkspace).toHaveBeenCalledOnce();
  });

  it("renders window drag regions for the hidden title bar", () => {
    renderShell();
    expect(
      document.querySelector(".sidebar-titlebar[data-tauri-drag-region]"),
    ).not.toBeNull();
    expect(
      document.querySelector(".window-drag-strip[data-tauri-drag-region]"),
    ).not.toBeNull();
  });
});
