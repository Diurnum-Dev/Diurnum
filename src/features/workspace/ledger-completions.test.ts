import { describe, expect, it } from "vitest";
import { matchesAccount, filterAccounts } from "./ledger-completions";

describe("matchesAccount", () => {
  it("matches by direct substring (case-insensitive)", () => {
    expect(matchesAccount("Expenses:Utilities", "util")).toBe(true);
    expect(matchesAccount("Expenses:Utilities", "UTIL")).toBe(true);
  });

  it("matches by segment prefix: exp:util → Expenses:Utilities", () => {
    expect(matchesAccount("Expenses:Utilities", "exp:util")).toBe(true);
  });

  it("matches by partial segment: exp:u → Expenses:Utilities", () => {
    expect(matchesAccount("Expenses:Utilities", "exp:u")).toBe(true);
  });

  it("returns true for empty query", () => {
    expect(matchesAccount("Assets:Bank", "")).toBe(true);
  });

  it("returns false for non-matching segment", () => {
    expect(matchesAccount("Assets:Bank:Checking", "exp:util")).toBe(false);
  });
});

describe("filterAccounts", () => {
  const accounts = [
    "Assets:Bank:Checking",
    "Expenses:Utilities:Electric",
    "Expenses:Utilities:Water",
    "Income:Services",
  ];

  it("returns all accounts for empty query", () => {
    expect(filterAccounts(accounts, "")).toHaveLength(4);
  });

  it("returns segment-matched accounts", () => {
    expect(filterAccounts(accounts, "exp:util")).toEqual([
      "Expenses:Utilities:Electric",
      "Expenses:Utilities:Water",
    ]);
  });

  it("returns empty array for no match", () => {
    expect(filterAccounts(accounts, "xyz")).toHaveLength(0);
  });
});
