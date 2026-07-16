import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { AiAssistPassState, SuggestedEntry } from "../../lib/workspace/types";
import { AiAssistReview } from "./AiAssistReview";

function entry(id: string, description: string, amount: string): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: id,
    postedDate: "2026-05-06",
    description,
    sourceAccount: "Assets:Bank:Checking",
    sourceAmount: amount,
    sourceFileName: "checking.csv",
    importFingerprint: `fp-${id}`,
    pendingAtImport: false,
  };
}

const entries = [
  entry("row-1", "WEB PMTS Autobooks, Inc. WEB", "-0.50"),
  entry("row-2", "SQSP* CMPGNS#232", "-10.66"),
  entry("row-3", "FEE 122111 GUSTO CCD", "-65.02"),
  entry("row-4", "Mobile Deposit", "2500.00"),
];

const pass: AiAssistPassState = {
  passId: "pass-1",
  status: "complete",
  totalRows: 4,
  processedRows: 4,
  suggestions: [
    {
      statementRowId: "row-1",
      status: "suggested",
      ledgerAccount: "Expenses:Software",
      payee: "Autobooks",
      narration: "Fee",
      confidence: 0.93,
      explanation: null,
    },
    {
      statementRowId: "row-2",
      status: "suggested",
      ledgerAccount: "Expenses:Software",
      payee: "Squarespace",
      narration: null,
      confidence: 0.9,
      explanation: null,
    },
    {
      statementRowId: "row-3",
      status: "suggested",
      ledgerAccount: "Expenses:Payroll",
      payee: "Gusto",
      narration: null,
      confidence: 0.88,
      explanation: null,
    },
    {
      statementRowId: "row-4",
      status: "needsEye",
      ledgerAccount: null,
      payee: null,
      narration: null,
      confidence: null,
      explanation: "AI unsure — deposit source?",
    },
  ],
  proposedRules: [
    {
      id: "rule-1",
      sourceAccount: "Assets:Bank:Checking",
      matchText: "Autobooks",
      ledgerAccount: "Expenses:Software",
      matchedRowCount: 1,
    },
  ],
};

function renderReview(overrides: Partial<Parameters<typeof AiAssistReview>[0]> = {}) {
  const onApprove = vi.fn();
  const onEditRow = vi.fn();
  const view = render(
    <AiAssistReview
      pass={pass}
      entries={entries}
      onApprove={onApprove}
      onDismiss={() => undefined}
      onRetry={() => undefined}
      onEditRow={onEditRow}
      {...overrides}
    />,
  );
  return { ...view, onApprove, onEditRow };
}

describe("AiAssistReview", () => {
  test("shows the first group card with rows checked and a rail", () => {
    renderReview();
    expect(screen.getByRole("heading", { name: "Expenses:Software" })).toBeTruthy();
    expect(screen.getByText(/was: WEB PMTS Autobooks/)).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.some((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/0 of 2 groups reviewed/)).toBeTruthy();
  });

  test("accepting a group advances and updates the rail", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Looks right/ }));
    expect(screen.getByRole("heading", { name: "Expenses:Payroll" })).toBeTruthy();
    expect(screen.getByText(/1 of 2 groups reviewed/)).toBeTruthy();
  });

  test("rail allows jumping straight to signing; approve reports checked selection", () => {
    const { onApprove } = renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve 3 entries/ }));
    expect(onApprove).toHaveBeenCalledWith({
      entries: [
        {
          statementRowId: "row-1",
          ledgerAccount: "Expenses:Software",
          payee: "Autobooks",
          narration: "Fee",
        },
        {
          statementRowId: "row-2",
          ledgerAccount: "Expenses:Software",
          payee: "Squarespace",
          narration: null,
        },
        {
          statementRowId: "row-3",
          ledgerAccount: "Expenses:Payroll",
          payee: "Gusto",
          narration: null,
        },
      ],
      rules: [
        {
          sourceAccount: "Assets:Bank:Checking",
          matchText: "Autobooks",
          ledgerAccount: "Expenses:Software",
        },
      ],
    });
  });

  test("unchecking a row excludes it and its lone-match rule", () => {
    const { onApprove } = renderReview();
    fireEvent.click(screen.getByRole("checkbox", { name: /Autobooks/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Squarespace/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve 1 entr/ }));
    const selection = onApprove.mock.calls[0][0];
    expect(selection.entries).toHaveLength(1);
    expect(selection.rules).toHaveLength(0);
  });

  test("needs-eye rows start unchecked and rows without an account cannot be checked", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Needs your eye/ }));
    const checkbox = screen.getByRole("checkbox", {
      name: /Mobile Deposit/,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByText(/AI unsure — deposit source\?/)).toBeTruthy();
  });

  test("running pass shows progress", () => {
    renderReview({ pass: { ...pass, status: "running", processedRows: 2 } });
    expect(screen.getByText(/2 of 4 categorized/)).toBeTruthy();
  });

  test("keyboard controls stay root-scoped and operate the selected row", () => {
    const { container, onEditRow } = renderReview();
    const root = container.querySelector(".ai-assist-review") as HTMLElement;
    expect(document.activeElement).toBe(root);

    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Expenses:Software" })).toBeTruthy();

    const firstRowCheckbox = screen.getByRole("checkbox", { name: "Autobooks" });
    firstRowCheckbox.focus();
    fireEvent.keyDown(firstRowCheckbox, { key: "j" });
    fireEvent.keyDown(firstRowCheckbox, { key: " " });
    expect(screen.getByRole("checkbox", { name: "Squarespace" })).not.toBeChecked();
    fireEvent.keyDown(firstRowCheckbox, { key: "e" });
    expect(onEditRow).toHaveBeenCalledWith("row-2");
    fireEvent.keyDown(root, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Expenses:Payroll" })).toBeTruthy();
  });

  test("rule checkbox disables and unchecks when every group row is excluded", () => {
    renderReview();
    const rule = screen.getByRole("checkbox", { name: /Include proposed rule 1/ });
    expect(rule).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Autobooks" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Squarespace" }));
    expect(rule).not.toBeChecked();
    expect(rule).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Autobooks" }));
    expect(rule).toBeChecked();
    expect(rule).not.toBeDisabled();
  });

  test("a new pass resets row and rule choices to their defaults", () => {
    const { rerender } = renderReview();
    fireEvent.click(screen.getByRole("checkbox", { name: "Autobooks" }));
    expect(screen.getByRole("checkbox", { name: "Autobooks" })).not.toBeChecked();

    rerender(
      <AiAssistReview
        pass={{ ...pass, passId: "pass-2" }}
        entries={entries}
        onApprove={() => undefined}
        onDismiss={() => undefined}
        onRetry={() => undefined}
        onEditRow={() => undefined}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Autobooks" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Include proposed rule 1/ })).toBeChecked();
  });

  test("partial pass updates preserve the current and reviewed group identities", () => {
    const { rerender } = renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Looks right/ }));
    expect(screen.getByRole("heading", { name: "Expenses:Payroll" })).toBeTruthy();

    const addedEntries = [
      ...entries,
      entry("row-5", "Office one", "-1.00"),
      entry("row-6", "Office two", "-2.00"),
      entry("row-7", "Office three", "-3.00"),
    ];
    const addedPass: AiAssistPassState = {
      ...pass,
      status: "running",
      totalRows: 7,
      processedRows: 7,
      suggestions: [
        ...pass.suggestions,
        ...["row-5", "row-6", "row-7"].map((statementRowId) => ({
          statementRowId,
          status: "suggested" as const,
          ledgerAccount: "Expenses:Office",
          payee: "Office supply",
          narration: null,
          confidence: 0.9,
          explanation: null,
        })),
      ],
    };
    rerender(
      <AiAssistReview
        pass={addedPass}
        entries={addedEntries}
        onApprove={() => undefined}
        onDismiss={() => undefined}
        onRetry={() => undefined}
        onEditRow={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Expenses:Payroll" })).toBeTruthy();
    const softwareStep = screen.getByRole("button", { name: "Expenses:Software" });
    expect(within(softwareStep).getByText("✓")).toBeTruthy();
  });
});
