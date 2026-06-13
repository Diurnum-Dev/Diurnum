// src/features/workspace/InboxInspector.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxInspector } from "./InboxInspector";
import type { SuggestedEntry } from "../../lib/workspace/types";

function entry(overrides: Partial<SuggestedEntry>): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: "row-1",
    postedDate: "2026-05-08",
    description: "OPENAI *CHATGPT",
    sourceAccount: "Assets:Bank:Chase",
    sourceAmount: "-20.00",
    sourceFileName: "chase-may-26-08:14",
    importFingerprint: "fp",
    pendingAtImport: false,
    linkedStatementRow: null,
    suggestedLedgerAccount: "Expenses:Software",
    categorizationRuleId: "rule-1",
    aiSuggestion: {
      ledgerAccount: "Expenses:Software",
      sourceAccount: null,
      sourceAmount: null,
      payee: "OpenAI",
      narration: null,
      confidence: 0.96,
      explanation: "Matches 4 prior OPENAI charges.",
      needsHumanAttention: false,
    },
    ...overrides,
  };
}

describe("InboxInspector", () => {
  it("shows the suggestion card and accepts in one click", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <InboxInspector
        entry={entry({})}
        ledgerStatus="valid"
        editing={false}
        onEditingChange={vi.fn()}
        onApprove={onApprove}
      />,
    );

    expect(screen.getByText("96% confident")).toBeInTheDocument();
    expect(screen.getByText("Matches 4 prior OPENAI charges.")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("chase-may-26-08:14")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "row-1",
      ledgerAccount: "Expenses:Software",
    });
  });

  it("reveals the edit form when editing", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <InboxInspector
        entry={entry({})}
        ledgerStatus="valid"
        editing
        onEditingChange={vi.fn()}
        onApprove={onApprove}
      />,
    );

    const input = screen.getByLabelText("Ledger Account");
    await user.clear(input);
    await user.type(input, "Expenses:AI");
    await user.click(screen.getByRole("button", { name: "Approve Entry" }));
    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "row-1",
      ledgerAccount: "Expenses:AI",
    });
  });

  it("approves a matched transfer", async () => {
    const user = userEvent.setup();
    const onApproveTransfer = vi.fn().mockResolvedValue(undefined);
    render(
      <InboxInspector
        entry={entry({
          statementRowId: "row-2",
          kind: "transfer",
          suggestedLedgerAccount: null,
          aiSuggestion: null,
          linkedStatementRow: {
            statementRowId: "row-3",
            postedDate: "2026-05-08",
            description: "Transfer in",
            sourceAccount: "Assets:Bank:Ally",
            sourceAmount: "20.00",
            sourceFileName: "ally.csv",
            importFingerprint: "fp2",
          },
        })}
        ledgerStatus="valid"
        editing={false}
        onEditingChange={vi.fn()}
        onApprove={vi.fn()}
        onApproveTransfer={onApproveTransfer}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Approve Transfer" }));
    expect(onApproveTransfer).toHaveBeenCalledWith({
      statementRowId: "row-2",
      linkedStatementRowId: "row-3",
    });
  });
});
