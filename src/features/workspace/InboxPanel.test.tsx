// src/features/workspace/InboxPanel.test.tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboxPanel } from "./InboxPanel";
import type { AiAssistPassState, SuggestedEntry } from "../../lib/workspace/types";

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

const aiAssistPass: AiAssistPassState = {
  passId: "pass-1",
  status: "complete",
  totalRows: 1,
  processedRows: 1,
  suggestions: [
    {
      statementRowId: "needs-1",
      status: "suggested",
      ledgerAccount: "Expenses:Travel",
      payee: "Lyft",
      narration: null,
      confidence: 0.9,
      explanation: null,
    },
  ],
  proposedRules: [],
};

function aiAssist(overrides: Record<string, unknown> = {}) {
  return {
    pass: null,
    adapterConfigured: true,
    running: false,
    disclosure: { adapterConfigured: true, fieldsSent: ["Chart of Accounts"] },
    onStart: vi.fn(),
    onApprove: vi.fn(async () => undefined),
    onDismiss: vi.fn(async () => undefined),
    onRetry: vi.fn(async () => undefined),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
}

describe("InboxPanel", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });

  it("AI Assist button starts a pass after disclosure acknowledgment", () => {
    localStorage.removeItem("diurnum.aiAssist.disclosureAcknowledged");
    const onStart = vi.fn();
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ onStart })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /AI Assist/ }));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText(/Chart of Accounts/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Run AI Assist/ }));
    expect(onStart).toHaveBeenCalled();
    expect(localStorage.getItem("diurnum.aiAssist.disclosureAcknowledged")).toBe("true");
  });

  it("renders review mode when a pass is active", () => {
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ pass: aiAssistPass })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    expect(screen.getByRole("heading", { name: /Sign & approve/ })).toBeTruthy();
    expect(screen.queryByLabelText("Transaction inspector")).toBeNull();
  });

  it("exits review to edit a selected row and can return to the same pass", () => {
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ pass: aiAssistPass })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Lyft.*was: LYFT \*RIDE/ }));

    expect(screen.queryByLabelText("AI Assist review")).toBeNull();
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Ledger Account")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Review AI Assist/ }));
    expect(screen.getByLabelText("AI Assist review")).toBeTruthy();
  });

  it("toggles between review and the Inbox from the toolbar without dismissing the pass", () => {
    const onDismiss = vi.fn(async () => undefined);
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ pass: aiAssistPass, onDismiss })}
      />,
    );

    // Reviewing by default; the toolbar button offers a way back to the Inbox.
    expect(screen.getByLabelText("AI Assist review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /View Inbox/ }));

    // Back in the Inbox list, and the pass was kept (not dismissed).
    expect(screen.queryByLabelText("AI Assist review")).toBeNull();
    expect(screen.getByLabelText("Transaction inspector")).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();

    // The same button jumps straight back into the same pass.
    fireEvent.click(screen.getByRole("button", { name: /Review AI Assist/ }));
    expect(screen.getByLabelText("AI Assist review")).toBeTruthy();
  });

  it("clears filters so an edited review row remains selected and visible", () => {
    const inactiveAssist = aiAssist();
    const { rerender } = render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={inactiveAssist}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Matched/ }));

    rerender(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={{ ...inactiveAssist, pass: aiAssistPass }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lyft.*was: LYFT \*RIDE/ }));

    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Ledger Account")).toBeTruthy();
  });

  it("cancels disclosure without acknowledging or starting", () => {
    const onStart = vi.fn();
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ onStart })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /AI Assist/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onStart).not.toHaveBeenCalled();
    expect(localStorage.getItem("diurnum.aiAssist.disclosureAcknowledged")).toBeNull();
    expect(screen.queryByLabelText("AI Assist disclosure")).toBeNull();
  });

  it("unconfigured adapter shows setup state", () => {
    const onOpenSettings = vi.fn();
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ adapterConfigured: false, onOpenSettings })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Set up AI Assist/ }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("keeps the AI Assist toolbar entry point in an empty Inbox", () => {
    render(
      <InboxPanel
        suggestedEntries={[]}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist()}
      />,
    );

    expect(screen.getByRole("button", { name: /AI Assist.*0 pending/ })).toBeTruthy();
  });

  it("shows a disabled categorizing affordance while a pass is running", () => {
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({
          pass: { ...aiAssistPass, status: "running", processedRows: 0 },
          running: true,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Categorizing… 0/1" })).toBeDisabled();
  });

  it("preserves review mode when approval fails", async () => {
    const onApprove = vi.fn(async () => {
      throw new Error("approval failed");
    });
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ pass: aiAssistPass, onApprove })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve 1 entry/ }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    expect(screen.getByLabelText("AI Assist review")).toBeTruthy();
  });

  it("disables signing actions while an AI Assist mutation is busy", () => {
    render(
      <InboxPanel
        suggestedEntries={entries}
        ledgerStatus="valid"
        onApprove={vi.fn()}
        aiAssist={aiAssist({ pass: aiAssistPass, actionBusy: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    expect(screen.getByRole("button", { name: /Approve 1 entry/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dismiss results" })).toBeDisabled();
  });

  it("lists pending and matched rows with category chips", () => {
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    const lyft = screen.getByRole("button", { name: /LYFT \*RIDE/ });
    const openai = screen.getByRole("button", { name: /OPENAI \*CHATGPT/ });
    expect(lyft).toBeInTheDocument();
    expect(openai).toBeInTheDocument();
    // The redesigned Inbox distinguishes buckets with per-row chips, not section
    // headings: an uncategorized pending row vs. a rule-matched account.
    expect(within(lyft).getByText("Uncategorized")).toBeInTheDocument();
    expect(within(openai).getByText("Expenses:Software")).toBeInTheDocument();
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

    // Rows are a single date-sorted list: LYFT, OPENAI, Transfer. The first
    // row starts selected.
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves selection up with the k key", async () => {
    const user = userEvent.setup();
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    // LYFT is selected by default; press j to move down to OPENAI, then k to
    // move back up to LYFT.
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ })).toHaveAttribute(
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
