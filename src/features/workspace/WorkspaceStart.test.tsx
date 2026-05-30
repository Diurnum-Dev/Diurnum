import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceStart } from "./WorkspaceStart";

describe("WorkspaceStart", () => {
  it("offers blank, example, and open existing Workspace actions", async () => {
    const user = userEvent.setup();
    const onCreateBlank = vi.fn();
    const onCreateExample = vi.fn();
    const onOpenExisting = vi.fn();

    render(
      <WorkspaceStart
        onCreateBlank={onCreateBlank}
        onCreateExample={onCreateExample}
        onOpenExisting={onOpenExisting}
        onOpenRecentWorkspace={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /New blank workspace/ }));
    await user.click(screen.getByRole("button", { name: /Example workspace/ }));
    await user.click(screen.getByRole("button", { name: /Open existing workspace/ }));

    expect(onCreateBlank).toHaveBeenCalledOnce();
    expect(onCreateExample).toHaveBeenCalledOnce();
    expect(onOpenExisting).toHaveBeenCalledOnce();
  });

  it("shows up to five recent Workspaces", async () => {
    const user = userEvent.setup();
    const onOpenRecentWorkspace = vi.fn();

    render(
      <WorkspaceStart
        recentWorkspaces={Array.from({ length: 6 }, (_, index) => ({
          path: `/tmp/workspace-${index + 1}`,
          displayName: `Workspace ${index + 1}`,
          lastOpenedAt: `2026-05-${30 - index}T12:00:00Z`,
          exists: true,
        }))}
        onCreateBlank={vi.fn()}
        onCreateExample={vi.fn()}
        onOpenExisting={vi.fn()}
        onOpenRecentWorkspace={onOpenRecentWorkspace}
      />,
    );

    expect(screen.getByRole("heading", { name: "Recent Workspaces" })).toBeInTheDocument();
    expect(screen.getByText("Workspace 1")).toBeInTheDocument();
    expect(screen.getByText("Workspace 5")).toBeInTheDocument();
    expect(screen.queryByText("Workspace 6")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Workspace 1/ }));
    expect(onOpenRecentWorkspace).toHaveBeenCalledWith("/tmp/workspace-1");
  });

  it("renders errors", () => {
    render(
      <WorkspaceStart
        onCreateBlank={vi.fn()}
        onCreateExample={vi.fn()}
        onOpenExisting={vi.fn()}
        onOpenRecentWorkspace={vi.fn()}
        error="This folder is not a Diurnum workspace."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This folder is not a Diurnum workspace.",
    );
    expect(screen.getByText("Your books are stored locally. No account required.")).toBeInTheDocument();
  });
});
