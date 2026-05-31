import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategorizationRulesPanel } from "./CategorizationRulesPanel";

describe("CategorizationRulesPanel", () => {
  it("requires confirmation before creating an offered rule", async () => {
    const user = userEvent.setup();
    const onCreateRule = vi.fn().mockResolvedValue(undefined);

    render(
      <CategorizationRulesPanel
        workspaceRootPath="/tmp/Acme Studio"
        rules={[]}
        offer={{
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "Software",
          ledgerAccount: "Expenses:Software",
        }}
        onCreateRule={onCreateRule}
      />,
    );

    expect(screen.getByText("Assets:Bank:Operating-Checking")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create Rule" }));

    expect(onCreateRule).toHaveBeenCalledWith({
      sourceAccount: "Assets:Bank:Operating-Checking",
      matchText: "Software",
      ledgerAccount: "Expenses:Software",
    });
  });

  it("shows editable confirmed rules", async () => {
    const user = userEvent.setup();
    const onUpdateRule = vi.fn().mockResolvedValue(undefined);

    render(
      <CategorizationRulesPanel
        workspaceRootPath="/tmp/Acme Studio"
        rules={[
          {
            id: "rule-1",
            sourceAccount: "Assets:Bank:Operating-Checking",
            matchText: "Software",
            ledgerAccount: "Expenses:Software",
            enabled: true,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ]}
        onUpdateRule={onUpdateRule}
      />,
    );

    await user.clear(screen.getByLabelText("Match Text"));
    await user.type(screen.getByLabelText("Match Text"), "SaaS");
    await user.click(screen.getByRole("button", { name: "Save Rule" }));

    expect(onUpdateRule).toHaveBeenCalledWith({
      id: "rule-1",
      sourceAccount: "Assets:Bank:Operating-Checking",
      matchText: "SaaS",
      ledgerAccount: "Expenses:Software",
    });
  });
});
