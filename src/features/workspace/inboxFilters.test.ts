// src/features/workspace/inboxFilters.test.ts
import { describe, expect, it } from "vitest";
import type { SuggestedEntry } from "../../lib/workspace/types";
import {
  accountOptions,
  bucketCounts,
  bucketOf,
  filterEntries,
  groupEntries,
  monthOptions,
} from "./inboxFilters";

function entry(overrides: Partial<SuggestedEntry>): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: "row",
    postedDate: "2026-05-08",
    description: "TEST",
    sourceAccount: "Assets:Bank:Chase",
    sourceAmount: "-10.00",
    sourceFileName: "f.csv",
    importFingerprint: "fp",
    pendingAtImport: false,
    linkedStatementRow: null,
    suggestedLedgerAccount: null,
    categorizationRuleId: null,
    aiSuggestion: null,
    ...overrides,
  };
}

const pending = entry({ statementRowId: "p", suggestedLedgerAccount: null });
const matched = entry({ statementRowId: "m", suggestedLedgerAccount: "Expenses:Software" });
const transfer = entry({ statementRowId: "t", kind: "transfer" });

describe("bucketOf", () => {
  it("classifies entries into pending / matched / transfers", () => {
    expect(bucketOf(pending)).toBe("pending");
    expect(bucketOf(matched)).toBe("matched");
    expect(bucketOf(transfer)).toBe("transfers");
  });
});

describe("bucketCounts", () => {
  it("counts each mutually exclusive bucket", () => {
    expect(bucketCounts([pending, matched, transfer])).toEqual({
      pending: 1,
      matched: 1,
      transfers: 1,
    });
  });
});

describe("option builders", () => {
  it("lists distinct sorted accounts", () => {
    const entries = [
      entry({ sourceAccount: "Assets:Bank:Chase" }),
      entry({ sourceAccount: "Assets:Bank:Ally" }),
      entry({ sourceAccount: "Assets:Bank:Chase" }),
    ];
    expect(accountOptions(entries)).toEqual(["Assets:Bank:Ally", "Assets:Bank:Chase"]);
  });

  it("lists distinct months newest first", () => {
    const entries = [entry({ postedDate: "2026-04-02" }), entry({ postedDate: "2026-05-08" })];
    expect(monthOptions(entries).map((m) => m.value)).toEqual(["2026-05", "2026-04"]);
  });
});

describe("filterEntries", () => {
  const entries = [pending, matched, transfer];

  it("returns everything for the all tab and all account/month", () => {
    expect(filterEntries(entries, { account: "all", month: "all", tab: "all" })).toHaveLength(3);
  });

  it("filters by tab bucket", () => {
    expect(
      filterEntries(entries, { account: "all", month: "all", tab: "transfers" }),
    ).toEqual([transfer]);
  });

  it("filters by account and month", () => {
    const e = [
      entry({ statementRowId: "a", sourceAccount: "Assets:Bank:Ally", postedDate: "2026-05-01" }),
      entry({ statementRowId: "b", sourceAccount: "Assets:Bank:Chase", postedDate: "2026-04-01" }),
    ];
    expect(
      filterEntries(e, { account: "Assets:Bank:Ally", month: "2026-05", tab: "all" }).map(
        (x) => x.statementRowId,
      ),
    ).toEqual(["a"]);
  });
});

describe("groupEntries", () => {
  it("puts pending and transfers in needsReview, suggestions in matched", () => {
    const groups = groupEntries([pending, matched, transfer]);
    expect(groups.needsReview.map((e) => e.statementRowId)).toEqual(["p", "t"]);
    expect(groups.matched.map((e) => e.statementRowId)).toEqual(["m"]);
  });
});
