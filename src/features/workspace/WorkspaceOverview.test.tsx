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

  it("shows recent Snapshots and restores the selected Snapshot", async () => {
    const user = userEvent.setup();
    const onRestoreSnapshot = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkspaceOverview
        workspace={workspace}
        snapshots={[
          {
            id: "snapshot-1",
            createdAt: "2026-05-30T12:00:00Z",
            reason: "approval",
            affectedFiles: ["main.bean", "transactions/2026-05.bean"],
            relativePath: ".diurnum/snapshots/snapshot-1",
          },
        ]}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
        onRestoreSnapshot={onRestoreSnapshot}
      />,
    );

    expect(screen.getByRole("heading", { name: "Recent Snapshots" })).toBeInTheDocument();
    expect(screen.getByText("Approval Snapshot")).toBeInTheDocument();
    expect(screen.getByText("main.bean, transactions/2026-05.bean")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(onRestoreSnapshot).toHaveBeenCalledWith("snapshot-1");
  });

  it("offers Snapshot recovery when the ledger is invalid", () => {
    render(
      <WorkspaceOverview
        workspace={{
          ...workspace,
          ledgerStatus: "invalid",
          ledgerValidation: {
            status: "invalid",
            errors: ["main.bean:1 Invalid directive."],
          },
        }}
        snapshots={[
          {
            id: "snapshot-1",
            createdAt: "2026-05-30T12:00:00Z",
            reason: "daily",
            affectedFiles: ["main.bean"],
            relativePath: ".diurnum/snapshots/snapshot-1",
          },
        ]}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
        onRestoreSnapshot={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Restore from a recent Snapshot" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Daily Snapshot")).toBeInTheDocument();
  });

  it("loads MVP Reports from the overview", async () => {
    const user = userEvent.setup();
    const onLoadReports = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkspaceOverview
        activeScreen="reports"
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

  it("keeps inherited MVP panels reachable from shell screens", () => {
    render(
      <WorkspaceOverview
        activeScreen="settings"
        workspace={workspace}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
        onAddSourceAccount={vi.fn()}
        onConfigureAiAdapter={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add Source Account" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Optional local suggestions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "User-confirmed rules" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Import Statement Rows" }),
    ).not.toBeInTheDocument();
  });

  it("shows CSV import only on the Import screen", () => {
    render(
      <WorkspaceOverview
        activeScreen="import"
        workspace={workspace}
        onReveal={vi.fn()}
        onOpenAnother={vi.fn()}
        onImportStatementRows={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Import Statement Rows" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Workspace files")).not.toBeInTheDocument();
  });

});
