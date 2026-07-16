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

function rowCheckbox(payee: string, amount: string, date = "May 6") {
  return screen.getByRole("checkbox", { name: `${payee}, ${date}, ${amount}` });
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

  test("row checkbox names disambiguate duplicate payees by date and amount", () => {
    const duplicate = {
      ...entry("row-5", "SECOND AUTOBOOKS", "-1.25"),
      postedDate: "2026-05-07",
    };
    renderReview({
      entries: [...entries, duplicate],
      pass: {
        ...pass,
        totalRows: 5,
        processedRows: 5,
        suggestions: [
          ...pass.suggestions,
          {
            statementRowId: "row-5",
            status: "suggested",
            ledgerAccount: "Expenses:Software",
            payee: "Autobooks",
            narration: null,
            confidence: 0.9,
            explanation: null,
          },
        ],
      },
    });

    expect(rowCheckbox("Autobooks", "−$0.50")).toBeTruthy();
    expect(rowCheckbox("Autobooks", "−$1.25", "May 7")).toBeTruthy();
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
    fireEvent.click(rowCheckbox("Autobooks", "−$0.50"));
    fireEvent.click(rowCheckbox("Squarespace", "−$10.66"));
    fireEvent.click(screen.getByRole("button", { name: /Sign & approve/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve 1 entr/ }));
    const selection = onApprove.mock.calls[0][0];
    expect(selection.entries).toHaveLength(1);
    expect(selection.rules).toHaveLength(0);
  });

  test("needs-eye rows start unchecked and rows without an account cannot be checked", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: /Needs your eye/ }));
    const checkbox = rowCheckbox("Mobile Deposit", "+$2500.00") as HTMLInputElement;
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

    const firstRowCheckbox = rowCheckbox("Autobooks", "−$0.50");
    firstRowCheckbox.focus();
    fireEvent.keyDown(firstRowCheckbox, { key: "j" });
    fireEvent.keyDown(firstRowCheckbox, { key: " " });
    expect(rowCheckbox("Squarespace", "−$10.66")).not.toBeChecked();
    fireEvent.keyDown(firstRowCheckbox, { key: "e" });
    expect(onEditRow).toHaveBeenCalledWith("row-2");
    fireEvent.keyDown(root, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Expenses:Payroll" })).toBeTruthy();
  });

  test("rule checkbox disables and unchecks when every group row is excluded", () => {
    renderReview();
    const rule = screen.getByRole("checkbox", {
      name: "Include rule Autobooks to Expenses:Software",
    });
    expect(rule).toBeChecked();
    fireEvent.click(rowCheckbox("Autobooks", "−$0.50"));
    fireEvent.click(rowCheckbox("Squarespace", "−$10.66"));
    expect(rule).not.toBeChecked();
    expect(rule).toBeDisabled();
    fireEvent.click(rowCheckbox("Autobooks", "−$0.50"));
    expect(rule).toBeChecked();
    expect(rule).not.toBeDisabled();
  });

  test("a new pass resets row and rule choices to their defaults", () => {
    const { rerender } = renderReview();
    const firstPassRoot = screen.getByRole("region", { name: "AI Assist review" });
    fireEvent.click(rowCheckbox("Autobooks", "−$0.50"));
    expect(rowCheckbox("Autobooks", "−$0.50")).not.toBeChecked();

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

    expect(screen.getByRole("region", { name: "AI Assist review" })).not.toBe(
      firstPassRoot,
    );
    expect(rowCheckbox("Autobooks", "−$0.50")).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Include rule Autobooks to Expenses:Software",
      }),
    ).toBeChecked();
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

  test("partial pass reordering preserves the selected row in the current group", () => {
    const initialEntries = [
      ...entries,
      entry("row-5", "Software extra", "-12.00"),
      entry("row-6", "RIPPLING PAYROLL", "-80.00"),
    ];
    const initialPass: AiAssistPassState = {
      ...pass,
      status: "running",
      totalRows: 6,
      processedRows: 6,
      suggestions: [
        ...pass.suggestions,
        {
          statementRowId: "row-5",
          status: "suggested",
          ledgerAccount: "Expenses:Software",
          payee: "Software extra",
          narration: null,
          confidence: 0.9,
          explanation: null,
        },
        {
          statementRowId: "row-6",
          status: "suggested",
          ledgerAccount: "Expenses:Payroll",
          payee: "Rippling",
          narration: null,
          confidence: 0.9,
          explanation: null,
        },
      ],
    };
    const { rerender } = renderReview({ pass: initialPass, entries: initialEntries });
    fireEvent.click(screen.getByRole("button", { name: /Looks right/ }));
    const root = screen.getByRole("region", { name: "AI Assist review" });
    fireEvent.keyDown(root, { key: "j" });
    expect(screen.getByText("Selected row Rippling, 2 of 2")).toBeTruthy();

    const officeEntries = [
      entry("row-7", "Office one", "-1.00"),
      entry("row-8", "Office two", "-2.00"),
      entry("row-9", "Office three", "-3.00"),
      entry("row-10", "Office four", "-4.00"),
    ];
    const reorderedPass: AiAssistPassState = {
      ...initialPass,
      totalRows: 10,
      processedRows: 10,
      suggestions: [
        ...initialPass.suggestions,
        ...officeEntries.map((officeEntry) => ({
          statementRowId: officeEntry.statementRowId,
          status: "suggested" as const,
          ledgerAccount: "Expenses:Office",
          payee: officeEntry.description,
          narration: null,
          confidence: 0.9,
          explanation: null,
        })),
      ],
    };
    rerender(
      <AiAssistReview
        pass={reorderedPass}
        entries={[...initialEntries, ...officeEntries]}
        onApprove={() => undefined}
        onDismiss={() => undefined}
        onRetry={() => undefined}
        onEditRow={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Expenses:Payroll" })).toBeTruthy();
    expect(screen.getByText("Selected row Rippling, 2 of 2")).toBeTruthy();
  });
});
