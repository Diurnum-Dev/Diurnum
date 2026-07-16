import { describe, expect, test } from "vitest";
import { buildAiAssistGroups } from "./aiAssistGroups";
import type { AiAssistPassState, SuggestedEntry } from "../../lib/workspace/types";

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

function pass(overrides: Partial<AiAssistPassState> = {}): AiAssistPassState {
  return {
    passId: "pass-1",
    status: "complete",
    totalRows: 3,
    processedRows: 3,
    suggestions: [],
    proposedRules: [],
    ...overrides,
  };
}

describe("buildAiAssistGroups", () => {
  test("groups suggested rows by account and partitions needs-eye", () => {
    const entries = [
      entry("row-1", "WEB PMTS Autobooks, Inc. WEB", "-0.50"),
      entry("row-2", "SQSP* CMPGNS#232", "-10.66"),
      entry("row-3", "Mobile Deposit", "2500.00"),
    ];
    const state = pass({
      suggestions: [
        { statementRowId: "row-1", status: "suggested", ledgerAccount: "Expenses:Software", payee: "Autobooks", narration: "Fee", confidence: 0.93, explanation: "ok" },
        { statementRowId: "row-2", status: "suggested", ledgerAccount: "Expenses:Software", payee: "Squarespace", narration: null, confidence: 0.9, explanation: null },
        { statementRowId: "row-3", status: "needsEye", ledgerAccount: null, payee: null, narration: null, confidence: null, explanation: "AI unsure — deposit source?" },
      ],
      proposedRules: [
        { id: "rule-1", sourceAccount: "Assets:Bank:Checking", matchText: "Autobooks", ledgerAccount: "Expenses:Software", matchedRowCount: 1 },
      ],
    });

    const { groups, needsEye } = buildAiAssistGroups(entries, state);

    expect(groups).toHaveLength(1);
    expect(groups[0].ledgerAccount).toBe("Expenses:Software");
    expect(groups[0].rows.map((row) => row.payee)).toEqual(["Autobooks", "Squarespace"]);
    expect(groups[0].net).toBeCloseTo(-11.16);
    expect(groups[0].rules).toHaveLength(1);
    expect(needsEye).toHaveLength(1);
    expect(needsEye[0].payee).toBe("Mobile Deposit");
    expect(needsEye[0].failed).toBe(false);
  });

  test("failed suggestions land in needs-eye flagged as failed", () => {
    const entries = [entry("row-1", "A", "-1.00")];
    const state = pass({
      suggestions: [
        { statementRowId: "row-1", status: "failed", ledgerAccount: null, payee: null, narration: null, confidence: null, explanation: "Adapter call failed" },
      ],
    });
    const { groups, needsEye } = buildAiAssistGroups(entries, state);
    expect(groups).toHaveLength(0);
    expect(needsEye[0].failed).toBe(true);
  });

  test("suggestions for rows no longer pending are ignored", () => {
    const state = pass({
      suggestions: [
        { statementRowId: "gone", status: "suggested", ledgerAccount: "Expenses:Software", payee: null, narration: null, confidence: 0.9, explanation: null },
      ],
    });
    const { groups, needsEye } = buildAiAssistGroups([], state);
    expect(groups).toHaveLength(0);
    expect(needsEye).toHaveLength(0);
  });

  test("sorts groups deterministically and drops orphan rules", () => {
    const entries = [
      entry("row-1", "One", "not-an-amount"),
      entry("row-2", "Two", "2.00"),
      entry("row-3", "Three", "3.00"),
      entry("row-4", "Four", "4.00"),
      entry("row-5", "Five", "5.00"),
    ];
    const state = pass({
      suggestions: [
        { statementRowId: "row-1", status: "suggested", ledgerAccount: "Expenses:B", payee: null },
        { statementRowId: "row-2", status: "suggested", ledgerAccount: "Expenses:A", payee: null },
        { statementRowId: "row-3", status: "suggested", ledgerAccount: "Expenses:B", payee: null },
        { statementRowId: "row-4", status: "suggested", ledgerAccount: "Expenses:C", payee: null },
        { statementRowId: "row-5", status: "suggested", ledgerAccount: null, payee: null },
      ],
      proposedRules: [
        { id: "orphan", sourceAccount: "Assets:Bank:Checking", matchText: "Missing", ledgerAccount: "Expenses:Missing", matchedRowCount: 1 },
      ],
    });

    const { groups, needsEye } = buildAiAssistGroups(entries, state);

    expect(groups.map((group) => group.ledgerAccount)).toEqual([
      "Expenses:B",
      "Expenses:A",
      "Expenses:C",
    ]);
    expect(groups.find((group) => group.ledgerAccount === "Expenses:B")?.net).toBe(3);
    expect(groups.flatMap((group) => group.rules)).toEqual([]);
    expect(needsEye.map((row) => row.statementRowId)).toEqual(["row-5"]);
  });
});
