import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceOverview } from "./WorkspaceOverview";
import type { WorkspaceSummary } from "../../lib/workspace/types";

const workspace: WorkspaceSummary = {
  rootPath: "/tmp/Acme Studio",
  businessName: "Acme Studio",
  baseCurrency: "USD",
  booksStartDate: "2026-01-01",
  ledgerStatus: "valid",
  ledgerValidation: {
    status: "valid",
    errors: [],
  },
};

describe("WorkspaceOverview", () => {
  it("shows Workspace details and required files", () => {
    render(
      <WorkspaceOverview
        workspace={workspace}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Acme Studio" })).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("/tmp/Acme Studio")).toBeInTheDocument();
    expect(screen.getByText("main.bean")).toBeInTheDocument();
    expect(screen.getByText("accounts.bean")).toBeInTheDocument();
    expect(screen.getByText("opening-balances.bean")).toBeInTheDocument();
    expect(screen.getByText(".diurnum/workspace.json")).toBeInTheDocument();
    expect(screen.getByText(".diurnum/diurnum.sqlite")).toBeInTheDocument();
  });

  it("runs reveal and open another callbacks", async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    const onOpenAnother = vi.fn();

    render(
      <WorkspaceOverview
        workspace={workspace}
        onReveal={onReveal}
        onOpenAnother={onOpenAnother}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reveal Workspace" }));
    await user.click(screen.getByRole("button", { name: "Open Another Workspace" }));

    expect(onReveal).toHaveBeenCalledOnce();
    expect(onOpenAnother).toHaveBeenCalledOnce();
  });

  it("runs ledger validation when requested", async () => {
    const user = userEvent.setup();
    const onValidate = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkspaceOverview
        workspace={workspace}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
        onValidate={onValidate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Recheck Ledger" }));

    expect(onValidate).toHaveBeenCalledOnce();
  });

  it("renders errors", () => {
    render(
      <WorkspaceOverview
        workspace={workspace}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
        error="Could not reveal Workspace."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not reveal Workspace.");
  });

  it("shows Invalid Ledger State details and blocks unsafe future actions", () => {
    render(
      <WorkspaceOverview
        workspace={{
          ...workspace,
          ledgerStatus: "invalid",
          ledgerValidation: {
            status: "invalid",
            errors: ["accounts.bean:1 Invalid currency EUR."],
          },
        }}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid Ledger State");
    expect(screen.getByText("accounts.bean:1 Invalid currency EUR.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approval blocked" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "MVP Reports blocked" })).toBeDisabled();
  });

  it("shows broken provenance separately from ledger validation", () => {
    render(
      <WorkspaceOverview
        workspace={workspace}
        brokenProvenance={[
          {
            statementRowId: "row-1",
            diurnumEntryId: "entry-1",
            reason: "Diurnum Entry Metadata is missing or changed.",
          },
        ]}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Broken Provenance");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Diurnum Entry Metadata is missing or changed.",
    );
    expect(screen.getByText("Ledger valid")).toBeInTheDocument();
  });

  it("loads MVP Reports from the overview", async () => {
    const user = userEvent.setup();
    const onLoadReports = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkspaceOverview
        workspace={workspace}
        reports={{
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          incomeStatement: {
            income: [{ account: "Income:Services", amount: 1200 }],
            expenses: [],
            totalIncome: 1200,
            totalExpenses: 0,
            netIncome: 1200,
          },
          expenseBreakdown: [],
          sourceAccountBalances: [],
          balanceSheet: {
            assets: [],
            liabilities: [],
            equity: [],
            retainedEarnings: 1200,
            totalAssets: 1200,
            totalLiabilities: 0,
            totalEquity: 1200,
          },
        }}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
        onLoadReports={onLoadReports}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Run Reports" }));

    expect(onLoadReports).toHaveBeenCalledWith({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
    expect(screen.getByText("Income Statement")).toBeInTheDocument();
  });
});
