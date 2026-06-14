// src/features/workspace/InboxPanel.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxPanel } from "./InboxPanel";
import type { SuggestedEntry } from "../../lib/workspace/types";

function entry(overrides: Partial<SuggestedEntry>): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: "row",
    postedDate: "2026-05-08",
    description: "TEST",
    sourceAccount: "Assets:Bank:Chase",
    sourceAmount: "-10.00",
    sourceFileName: "chase.csv",
    importFingerprint: "fp",
    pendingAtImport: false,
    linkedStatementRow: null,
    suggestedLedgerAccount: null,
    categorizationRuleId: null,
    aiSuggestion: null,
    ...overrides,
  };
}

const entries: SuggestedEntry[] = [
  entry({
    statementRowId: "needs-1",
    description: "LYFT *RIDE",
    suggestedLedgerAccount: null,
  }),
  entry({
    statementRowId: "matched-1",
    description: "OPENAI *CHATGPT",
    sourceAmount: "-20.00",
    suggestedLedgerAccount: "Expenses:Software",
  }),
  entry({
    statementRowId: "transfer-1",
    description: "Transfer to savings",
    kind: "transfer",
    sourceAmount: "-1500.00",
    linkedStatementRow: {
      statementRowId: "transfer-2",
      postedDate: "2026-05-08",
      description: "Transfer from checking",
      sourceAccount: "Assets:Bank:Ally",
      sourceAmount: "1500.00",
      sourceFileName: "ally.csv",
      importFingerprint: "fp2",
    },
  }),
];

describe("InboxPanel", () => {
  it("groups rows into needs-review and matched", () => {
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    expect(screen.getByText(/needs your review/)).toBeInTheDocument();
    expect(screen.getByText(/auto-posted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ })).toBeInTheDocument();
  });

  it("filters by tab", async () => {
    const user = userEvent.setup();
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: /Matched/ }));
    expect(screen.queryByRole("button", { name: /LYFT \*RIDE/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ })).toBeInTheDocument();
  });

  it("accepts the selected matched entry from the inspector", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={onApprove} />);

    await user.click(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ }));
    const inspector = screen.getByLabelText("Transaction inspector");
    await user.click(within(inspector).getByRole("button", { name: "Accept" }));

    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "matched-1",
      ledgerAccount: "Expenses:Software",
    });
  });

  it("approves a transfer match from the inspector", async () => {
    const user = userEvent.setup();
    const onApproveTransfer = vi.fn().mockResolvedValue(undefined);
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        onApproveTransfer={onApproveTransfer}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Transfer to savings/ }));
    await user.click(screen.getByRole("button", { name: "Approve Transfer" }));
    expect(onApproveTransfer).toHaveBeenCalledWith({
      statementRowId: "transfer-1",
      linkedStatementRowId: "transfer-2",
    });
  });

  it("moves the selection with the j key", async () => {
    const user = userEvent.setup();
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    // First entry in flat order (needs-review group first) starts selected.
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /Transfer to savings/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves selection up with the k key", async () => {
    const user = userEvent.setup();
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    // LYFT is selected by default; press j to move down, then k to move back up.
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /Transfer to savings/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard("k");
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("enters edit mode on the selected standard entry with the e key", async () => {
    const user = userEvent.setup();
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    // Click the matched entry — its inspector shows the suggestion card (Accept button), not the edit form.
    await user.click(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ }));
    expect(screen.queryByLabelText("Ledger Account")).toBeNull();

    // Press e to open the edit form.
    await user.keyboard("e");
    expect(screen.getByLabelText("Ledger Account")).toBeInTheDocument();
  });

  it("advances to the next row, not the top, when the selected row leaves the Inbox", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />,
    );

    // Select the middle row, then simulate it being approved (parent drops it).
    await user.click(screen.getByRole("button", { name: /Transfer to savings/ }));
    const remaining = entries.filter((entry) => entry.statementRowId !== "transfer-1");
    rerender(<InboxPanel suggestedEntries={remaining} ledgerStatus="valid" onApprove={vi.fn()} />);

    expect(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("approves the selected matched entry with the Enter key", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={onApprove} />);

    // Select the matched entry.
    await user.click(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ }));

    // Press Enter to approve.
    await user.keyboard("{Enter}");
    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "matched-1",
      ledgerAccount: "Expenses:Software",
    });
  });
});
