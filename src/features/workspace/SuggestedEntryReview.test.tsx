import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SuggestedEntryReview } from "./SuggestedEntryReview";
import type { SuggestedEntry } from "../../lib/workspace/types";

const suggestedEntries: SuggestedEntry[] = [
  {
    kind: "standard",
    statementRowId: "row-1",
    postedDate: "2026-01-04",
    description: "Software",
    sourceAccount: "Assets:Bank:Operating-Checking",
    sourceAmount: "-29.99",
    sourceFileName: "checking.csv",
    importFingerprint: "fingerprint-1",
    pendingAtImport: false,
  },
];

describe("SuggestedEntryReview", () => {
  it("shows Entry Preview, Journal Detail, and approves selected Ledger Account", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);

    render(
      <SuggestedEntryReview
        suggestedEntries={suggestedEntries}
        ledgerStatus="valid"
        onApprove={onApprove}
      />,
    );

    expect(screen.getByText("Entry Preview")).toBeInTheDocument();
    expect(screen.getByText("Journal Detail")).toBeInTheDocument();
    expect(screen.getByText("Assets:Bank:Operating-Checking")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Ledger Account"), "Expenses:Software");
    await user.click(screen.getByRole("button", { name: "Approve Entry" }));

    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "row-1",
      ledgerAccount: "Expenses:Software",
    });
  });

  it("blocks approval during Invalid Ledger State", () => {
    render(
      <SuggestedEntryReview
        suggestedEntries={suggestedEntries}
        ledgerStatus="invalid"
        onApprove={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Approval blocked" })).toBeDisabled();
  });

  it("prefills deterministic rule suggestions", () => {
    render(
      <SuggestedEntryReview
        suggestedEntries={[
          {
            ...suggestedEntries[0],
            suggestedLedgerAccount: "Expenses:Software",
            categorizationRuleId: "rule-1",
          },
        ]}
        ledgerStatus="valid"
        onApprove={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Ledger Account")).toHaveValue("Expenses:Software");
    expect(screen.getByText("Rule suggestion: Expenses:Software")).toBeInTheDocument();
  });

  it("shows AI suggestions without approving them automatically", () => {
    render(
      <SuggestedEntryReview
        suggestedEntries={[
          {
            ...suggestedEntries[0],
            suggestedLedgerAccount: "Expenses:Software",
            aiSuggestion: {
              ledgerAccount: "Expenses:Software",
              payee: "Vendor",
              narration: "Software",
              confidence: 0.91,
              explanation: "Matched software vendor.",
              needsHumanAttention: false,
            },
          },
        ]}
        ledgerStatus="valid"
        onApprove={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Ledger Account")).toHaveValue("Expenses:Software");
    expect(screen.getByText("AI suggestion: Expenses:Software")).toBeInTheDocument();
    expect(screen.getByText("Matched software vendor.")).toBeInTheDocument();
    expect(screen.getByText("Confidence: 91%")).toBeInTheDocument();
  });

  it("shows a matched transfer and approves both linked Statement Rows", async () => {
    const user = userEvent.setup();
    const onApproveTransfer = vi.fn().mockResolvedValue(undefined);

    render(
      <SuggestedEntryReview
        suggestedEntries={[
          {
            kind: "transfer",
            statementRowId: "row-1",
            postedDate: "2026-01-04",
            description: "Credit card payment",
            sourceAccount: "Assets:Bank:Operating-Checking",
            sourceAmount: "-100.00",
            sourceFileName: "checking.csv",
            importFingerprint: "checking-fingerprint",
            pendingAtImport: false,
            linkedStatementRow: {
              statementRowId: "row-2",
              postedDate: "2026-01-04",
              description: "Payment received",
              sourceAccount: "Liabilities:CreditCards:Business-Card",
              sourceAmount: "100.00",
              sourceFileName: "card.csv",
              importFingerprint: "card-fingerprint",
            },
          },
        ]}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        onApproveTransfer={onApproveTransfer}
      />,
    );

    expect(screen.getByText("Transfer Match")).toBeInTheDocument();
    expect(screen.getByText("Liabilities:CreditCards:Business-Card")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve Transfer" }));

    expect(onApproveTransfer).toHaveBeenCalledWith({
      statementRowId: "row-1",
      linkedStatementRowId: "row-2",
    });
  });

  it("shows one-sided transfer suggestions without allowing approval", () => {
    render(
      <SuggestedEntryReview
        suggestedEntries={[
          {
            kind: "transfer",
            statementRowId: "row-1",
            postedDate: "2026-01-04",
            description: "Transfer to savings",
            sourceAccount: "Assets:Bank:Operating-Checking",
            sourceAmount: "-100.00",
            sourceFileName: "checking.csv",
            importFingerprint: "checking-fingerprint",
            pendingAtImport: false,
            linkedStatementRow: null,
          },
        ]}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        onApproveTransfer={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Needs matching row" })).toBeDisabled();
  });
});
