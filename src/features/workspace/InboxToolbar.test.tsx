// src/features/workspace/InboxToolbar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxToolbar } from "./InboxToolbar";

const baseProps = {
  accounts: ["Assets:Bank:Ally", "Assets:Bank:Chase"],
  account: "all",
  months: [{ value: "2026-05", label: "May 2026" }],
  month: "all",
  tab: "all" as const,
  counts: { all: 36, pending: 4, matched: 31, transfers: 1 },
};

describe("InboxToolbar", () => {
  it("renders tab counts and fires tab changes", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(
      <InboxToolbar
        {...baseProps}
        onAccountChange={vi.fn()}
        onMonthChange={vi.fn()}
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveTextContent("4");
    await user.click(screen.getByRole("tab", { name: /Transfers/ }));
    expect(onTabChange).toHaveBeenCalledWith("transfers");
  });

  it("fires account and month changes", async () => {
    const user = userEvent.setup();
    const onAccountChange = vi.fn();
    const onMonthChange = vi.fn();
    render(
      <InboxToolbar
        {...baseProps}
        onAccountChange={onAccountChange}
        onMonthChange={onMonthChange}
        onTabChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Account"), "Assets:Bank:Chase");
    expect(onAccountChange).toHaveBeenCalledWith("Assets:Bank:Chase");

    await user.selectOptions(screen.getByLabelText("Dates"), "2026-05");
    expect(onMonthChange).toHaveBeenCalledWith("2026-05");
  });
});
