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
    recentLedgerFiles: [],
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
    onOpenRecentFile: vi.fn(),
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
    // Settings is reached via the nav list; the sidebar footer is intentionally
    // empty (no account/user UI — local-first).
    expect(screen.getByRole("button", { name: /Settings/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Workspace" })).not.toBeInTheDocument();
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

  it("shows recent ledger files and opens the file when clicked", async () => {
    const user = userEvent.setup();
    const onOpenRecentFile = vi.fn();

    renderShell({
      recentLedgerFiles: ["2026-05.bean", "accounts.bean"],
      onOpenRecentFile,
    });

    expect(screen.getByRole("button", { name: /2026-05\.bean/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accounts\.bean/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /2026-05\.bean/ }));
    expect(onOpenRecentFile).toHaveBeenCalledWith("2026-05.bean");
  });

  it("hides the Recent group when there are no recent files", () => {
    renderShell({ recentLedgerFiles: [] });
    expect(screen.queryByText("Recent")).not.toBeInTheDocument();
  });

  it("keeps the sidebar footer empty (no account/user UI)", () => {
    renderShell();
    expect(screen.queryByRole("button", { name: "Open Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Workspace" })).not.toBeInTheDocument();
  });

  it("renders the sidebar title-bar drag region for the hidden title bar", () => {
    renderShell();
    expect(
      document.querySelector(".sidebar-titlebar[data-tauri-drag-region]"),
    ).not.toBeNull();
  });

  it("omits the full-width top drag strip on the ledger screen", () => {
    renderShell({ activeScreen: "ledger" });
    expect(document.querySelector(".window-drag-strip")).toBeNull();
  });

  it("renders the full-width top drag strip on non-ledger screens", () => {
    renderShell({ activeScreen: "inbox" });
    expect(
      document.querySelector(".window-drag-strip[data-tauri-drag-region]"),
    ).not.toBeNull();
  });
});
