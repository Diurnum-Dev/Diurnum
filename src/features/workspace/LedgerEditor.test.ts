import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alignTransactionAmounts,
  completionLinePrefixAtCursor,
  validationErrorsForFile,
} from "./LedgerEditor";

describe("Ledger Editor rename boundary", () => {
  it("does not call account rename APIs from its save flow", () => {
    const source = readFileSync("src/features/workspace/LedgerEditor.tsx", "utf8");
    expect(source).not.toContain("previewAccountRename");
    expect(source).not.toContain("renameAccount");
  });
});

describe("validationErrorsForFile", () => {
  // These strings are the exact format the Rust validator emits. If that format
  // drifts, the underline silently disappears — hence the verbatim fixtures.
  const errors = [
    "transactions/2026-05.bean:11 Transaction does not balance: postings sum to -11.00 USD, expected 0.00.",
    "transactions/2026-05.bean:12 Transaction does not balance: postings sum to -11.00 USD, expected 0.00.",
    "accounts.bean:4 Invalid currency 'EUR' — only USD is supported.",
  ];

  it("underlines every posting line of an unbalanced transaction in the open file", () => {
    expect(validationErrorsForFile(errors, "transactions/2026-05.bean")).toEqual([
      {
        line: 11,
        message: "Transaction does not balance: postings sum to -11.00 USD, expected 0.00.",
      },
      {
        line: 12,
        message: "Transaction does not balance: postings sum to -11.00 USD, expected 0.00.",
      },
    ]);
  });

  it("ignores errors belonging to other files", () => {
    expect(validationErrorsForFile(errors, "accounts.bean")).toEqual([
      { line: 4, message: "Invalid currency 'EUR' — only USD is supported." },
    ]);
  });

  it("maps a missing-currency error to its posting line", () => {
    const missingCurrency = [
      "transactions/2026-05.bean:11 Posting amount '66' is missing a currency — expected '66 USD'.",
    ];

    expect(validationErrorsForFile(missingCurrency, "transactions/2026-05.bean")).toEqual([
      { line: 11, message: "Posting amount '66' is missing a currency — expected '66 USD'." },
    ]);
  });
});

describe("alignTransactionAmounts", () => {
  it("aligns decimal columns inside transaction blocks", () => {
    const contents = [
      '2026-01-02 * "Client" "Payment"',
      "  Assets:Bank:Checking  1000.00 USD",
      "  Income:Services  -1000.00 USD",
      "",
    ].join("\n");

    expect(alignTransactionAmounts(contents, 1)).toBe(
      [
        '2026-01-02 * "Client" "Payment"',
        "  Assets:Bank:Checking  1000.00 USD",
        "  Income:Services       -1000.00 USD",
        "",
      ].join("\n"),
    );
  });

  it("does not reformat the active line while the user is editing it", () => {
    const contents = [
      '2026-01-02 * "Client" "Payment"',
      "  Assets:Bank:Checking  1000.00 USD",
      "  Income:Services  -1000.00 USD",
    ].join("\n");

    expect(alignTransactionAmounts(contents, 3)).toBe(contents);
  });
});

describe("completionLinePrefixAtCursor", () => {
  it("detects a date trigger at the end of the current line", () => {
    const contents = "include \"accounts.bean\"\n2026-05-08 ";

    expect(completionLinePrefixAtCursor(contents, contents.length)).toBe("2026-05-08 ");
  });

  it("detects a partial transaction description for completion updates", () => {
    const contents = '2026-05-08 * "Soft';

    expect(completionLinePrefixAtCursor(contents, contents.length)).toBe('2026-05-08 * "Soft');
  });

  it("does not trigger in the middle of a line", () => {
    const contents = '2026-05-08 * "Software"';

    expect(completionLinePrefixAtCursor(contents, "2026-05-08 ".length)).toBeNull();
  });
});
