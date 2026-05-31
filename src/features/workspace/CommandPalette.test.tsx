import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("filters commands and executes the selected option with the keyboard", async () => {
    const user = userEvent.setup();
    const ledger = vi.fn();
    const reports = vi.fn();
    const close = vi.fn();

    render(
      <CommandPalette
        open
        mode="commands"
        items={[
          {
            id: "ledger",
            label: "Go to Ledger",
            group: "Navigation",
            shortcut: "⌘1",
            iconPath: "M4 5h10M4 9h10M4 13h7",
            onSelect: ledger,
          },
          {
            id: "reports",
            label: "Go to Reports",
            group: "Navigation",
            iconPath: "M4 13V7m4 6V4m4 9V9",
            onSelect: reports,
          },
        ]}
        onClose={close}
        onPromptSubmit={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Search commands"), "reports");
    expect(screen.queryByRole("option", { name: /Go to Ledger/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Go to Reports/ })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(reports).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });

  it("submits prompt mode values with Enter", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();

    render(
      <CommandPalette
        open
        mode="prompt"
        items={[]}
        promptLabel="Commit with message"
        promptPlaceholder="Commit message"
        onClose={vi.fn()}
        onPromptSubmit={submit}
      />,
    );

    await user.type(screen.getByLabelText("Commit with message"), "diurnum: checkpoint");
    await user.keyboard("{Enter}");

    expect(submit).toHaveBeenCalledWith("diurnum: checkpoint");
  });
});
