import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RenameAccountDialog } from "./RenameAccountDialog";
import type { AccountRenamePreview } from "../../lib/workspace/types";

const ROOT = "/tmp/Acme Studio";

function preview(overrides: Partial<AccountRenamePreview> = {}): AccountRenamePreview {
  return {
    oldAccount: "Expenses:Software",
    newAccount: "Expenses:Subscriptions:Software",
    merge: false,
    destinationExists: false,
    sourceAccount: false,
    changes: [
      {
        relativePath: "transactions/2026-01.bean",
        lines: [
          {
            lineNumber: 4,
            before: "  Expenses:Software  -10.00 USD",
            after: "  Expenses:Subscriptions:Software  -10.00 USD",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("RenameAccountDialog", () => {
  it("renders a live preview and confirms the rename", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn(async () => preview());
    const onRename = vi.fn(async () => undefined);

    render(
      <RenameAccountDialog
        workspaceRootPath={ROOT}
        knownAccounts={["Expenses:Software"]}
        onPreview={onPreview}
        onRename={onRename}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("New account full path"), "Expenses:Subscriptions:Software");
    await waitFor(() => expect(screen.getByText("transactions/2026-01.bean")).toBeInTheDocument());
    expect(screen.getByText(/Expenses:Software/)).toBeInTheDocument();
    expect(screen.getByText(/Expenses:Subscriptions:Software/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rename account" }));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith({
      workspaceRootPath: ROOT,
      oldAccount: "Expenses:Software",
      newAccount: "Expenses:Subscriptions:Software",
      merge: false,
    }));
  });

  it("offers merge when the destination already exists", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn(async (input: { merge: boolean }) =>
      preview({ destinationExists: true, merge: input.merge }),
    );
    const onRename = vi.fn(async () => undefined);

    render(
      <RenameAccountDialog
        workspaceRootPath={ROOT}
        knownAccounts={["Expenses:Software"]}
        onPreview={onPreview}
        onRename={onRename}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("New account full path"), "Expenses:Subscriptions:Software");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("already exists"));
    expect(screen.getByLabelText("Merge destination account")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Rename account" })).toBeDisabled();

    await user.click(screen.getByLabelText("Merge destination account"));
    await waitFor(() => expect(onPreview).toHaveBeenLastCalledWith({
      workspaceRootPath: ROOT,
      oldAccount: "Expenses:Software",
      newAccount: "Expenses:Subscriptions:Software",
      merge: true,
    }));
    await user.click(screen.getByRole("button", { name: "Rename account" }));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith({
      workspaceRootPath: ROOT,
      oldAccount: "Expenses:Software",
      newAccount: "Expenses:Subscriptions:Software",
      merge: true,
    }));
  });
});
