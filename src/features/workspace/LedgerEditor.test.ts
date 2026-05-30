import { describe, expect, it } from "vitest";
import { alignTransactionAmounts } from "./LedgerEditor";

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
