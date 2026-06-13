// src/features/workspace/inboxFilters.ts
import type { SuggestedEntry } from "../../lib/workspace/types";

export type InboxBucket = "pending" | "matched" | "transfers";
export type InboxTab = "all" | "pending" | "matched" | "transfers";

export type MonthOption = { value: string; label: string };
export type InboxFilter = { account: string; month: string; tab: InboxTab };
export type InboxGroups = { needsReview: SuggestedEntry[]; matched: SuggestedEntry[] };

export function bucketOf(entry: SuggestedEntry): InboxBucket {
  if (entry.kind === "transfer") return "transfers";
  return entry.suggestedLedgerAccount ? "matched" : "pending";
}

export function bucketCounts(entries: SuggestedEntry[]): Record<InboxBucket, number> {
  const counts: Record<InboxBucket, number> = { pending: 0, matched: 0, transfers: 0 };
  for (const entry of entries) {
    counts[bucketOf(entry)] += 1;
  }
  return counts;
}

export function accountOptions(entries: SuggestedEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.sourceAccount))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function monthOptions(entries: SuggestedEntry[]): MonthOption[] {
  const months = new Map<string, string>();
  for (const entry of entries) {
    const value = entry.postedDate.slice(0, 7);
    if (value.length === 7 && !months.has(value)) {
      months.set(value, formatMonthLabel(value));
    }
  }
  return Array.from(months, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.value < b.value ? 1 : -1,
  );
}

export function formatMonthLabel(value: string): string {
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function filterEntries(entries: SuggestedEntry[], filter: InboxFilter): SuggestedEntry[] {
  return entries.filter((entry) => {
    if (filter.account !== "all" && entry.sourceAccount !== filter.account) return false;
    if (filter.month !== "all" && entry.postedDate.slice(0, 7) !== filter.month) return false;
    if (filter.tab !== "all" && bucketOf(entry) !== filter.tab) return false;
    return true;
  });
}

export function groupEntries(entries: SuggestedEntry[]): InboxGroups {
  const needsReview: SuggestedEntry[] = [];
  const matched: SuggestedEntry[] = [];
  for (const entry of entries) {
    if (bucketOf(entry) === "matched") {
      matched.push(entry);
    } else {
      needsReview.push(entry);
    }
  }
  return { needsReview, matched };
}
