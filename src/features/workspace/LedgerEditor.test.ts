import { describe, expect, it } from "vitest";
import { alignTransactionAmounts, completionLinePrefixAtCursor } from "./LedgerEditor";

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
