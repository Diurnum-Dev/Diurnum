import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxPanel } from "./InboxPanel";
import type { SuggestedEntry } from "../../lib/workspace/types";

const suggestedEntries: SuggestedEntry[] = [
  {
    kind: "standard",
    statementRowId: "row-1",
    postedDate: "2026-05-08",
    description: "OPENAI *CHATGPT",
    sourceAccount: "Assets:Bank:Chase Checking",
    sourceAmount: "-20.00",
    sourceFileName: "checking.csv",
    importFingerprint: "checking-1",
    pendingAtImport: true,
    suggestedLedgerAccount: "Expenses:Software",
    linkedStatementRow: null,
    categorizationRuleId: "rule-1",
    aiSuggestion: null,
  },
  {
    kind: "transfer",
    statementRowId: "row-2",
    postedDate: "2026-05-08",
    description: "Transfer to savings",
    sourceAccount: "Assets:Bank:Chase Checking",
    sourceAmount: "-1500.00",
    sourceFileName: "checking.csv",
    importFingerprint: "checking-2",
    pendingAtImport: false,
    linkedStatementRow: {
      statementRowId: "row-3",
      postedDate: "2026-05-08",
      description: "Transfer from checking",
      sourceAccount: "Assets:Bank:Ally Savings",
      sourceAmount: "1500.00",
      sourceFileName: "savings.csv",
      importFingerprint: "savings-1",
    },
    suggestedLedgerAccount: null,
    categorizationRuleId: null,
    aiSuggestion: null,
  },
];

describe("InboxPanel", () => {
  it("shows pending rows, pending-at-import badges, and row selection", async () => {
    const user = userEvent.setup();

    render(
      <InboxPanel
        suggestedEntries={suggestedEntries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getAllByText("Pending at import")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Transfer to savings/ }));

    expect(screen.getByRole("button", { name: "Approve Transfer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Transfer to savings/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("submits the selected standard entry and transfer match approvals", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const onApproveTransfer = vi.fn().mockResolvedValue(undefined);

    render(
      <InboxPanel
        suggestedEntries={suggestedEntries}
        ledgerStatus="valid"
        onApprove={onApprove}
        onApproveTransfer={onApproveTransfer}
      />,
    );

    await user.click(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ }));
    await user.clear(screen.getByLabelText("Ledger Account"));
    await user.type(screen.getByLabelText("Ledger Account"), "Expenses:Software");
    await user.click(screen.getByRole("button", { name: "Approve Entry" }));

    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "row-1",
      ledgerAccount: "Expenses:Software",
    });

    await user.click(screen.getByRole("button", { name: /Transfer to savings/ }));
    await user.click(screen.getByRole("button", { name: "Approve Transfer" }));

    expect(onApproveTransfer).toHaveBeenCalledWith({
      statementRowId: "row-2",
      linkedStatementRowId: "row-3",
    });
  });
});
