# Inbox Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Inbox screen to match `docs/screenshots/Inbox.png` — a dense grouped transaction table with a functional filter toolbar, a richer inspector, keyboard navigation, and status-bar shortcut hints.

**Architecture:** Split the monolithic `InboxPanel` into pure helper modules (filtering/grouping/formatting) plus three presentational components (`InboxToolbar`, `InboxInspector`, and the grouped table inside `InboxPanel`). `InboxPanel` orchestrates selection, filter state, and keyboard handling. `AppShell` gains a `statusHints` slot for the keyboard-shortcut footer text.

**Tech Stack:** React 18 + TypeScript, Vitest + @testing-library/react, plain CSS in `src/styles.css`. Design tokens per `DESIGN.md`.

**Spec:** `docs/superpowers/specs/2026-06-13-inbox-redesign-design.md`

**Commands:**
- Run one test file: `npx vitest run src/features/workspace/<file>.test.tsx`
- Run all tests: `npm test`
- Typecheck: `npm run typecheck`
- Build: `npm run build`

---

## File structure

- Create `src/features/workspace/inboxFilters.ts` — pure bucketing / option-building / filtering / grouping logic.
- Create `src/features/workspace/inboxFilters.test.ts` — unit tests for the above.
- Create `src/features/workspace/inboxFormat.ts` — date / amount formatters.
- Create `src/features/workspace/inboxFormat.test.ts` — unit tests for formatters.
- Create `src/features/workspace/InboxToolbar.tsx` — account/date selects + filter tabs.
- Create `src/features/workspace/InboxToolbar.test.tsx`.
- Create `src/features/workspace/InboxInspector.tsx` — inspector panel + approve/transfer/edit logic.
- Modify `src/features/workspace/InboxPanel.tsx` — orchestrator: header, toolbar, grouped table, inspector, selection, keyboard nav.
- Modify `src/features/workspace/InboxPanel.test.tsx` — grouping/filtering/keyboard/inspector tests.
- Modify `src/components/AppShell.tsx` — add `statusHints` prop + render slot.
- Modify `src/App.tsx` — pass `statusHints` for the inbox screen.
- Modify `src/styles.css` — replace the inbox CSS region; add `.status-bar-hints`.

`SuggestedEntryReview.tsx` / `SuggestedEntryDetail` are left in place but no longer imported by the Inbox.

---

## Task 1: Pure filtering / grouping helpers

**Files:**
- Create: `src/features/workspace/inboxFilters.ts`
- Test: `src/features/workspace/inboxFilters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/workspace/inboxFilters.test.ts`
Expected: FAIL — cannot resolve `./inboxFilters`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/workspace/inboxFilters.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/inboxFilters.ts src/features/workspace/inboxFilters.test.ts
git commit -m "feat: inbox filtering and grouping helpers"
```

---

## Task 2: Formatting helpers

**Files:**
- Create: `src/features/workspace/inboxFormat.ts`
- Test: `src/features/workspace/inboxFormat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/workspace/inboxFormat.test.ts
import { describe, expect, it } from "vitest";
import { formatInboxAmount, formatInboxDate, invertAmount } from "./inboxFormat";

describe("formatInboxDate", () => {
  it("formats an ISO date as short month + day in UTC", () => {
    expect(formatInboxDate("2026-05-08")).toBe("May 8");
  });

  it("returns the raw value when unparseable", () => {
    expect(formatInboxDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatInboxAmount", () => {
  it("renders negative amounts with a minus sign", () => {
    expect(formatInboxAmount("-20.00")).toBe("−$20.00");
  });

  it("renders positive amounts with a plus sign", () => {
    expect(formatInboxAmount("3240")).toBe("+$3240.00");
  });
});

describe("invertAmount", () => {
  it("flips the sign", () => {
    expect(invertAmount("-20.00")).toBe("20.00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/workspace/inboxFormat.test.ts`
Expected: FAIL — cannot resolve `./inboxFormat`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/workspace/inboxFormat.ts
export function formatInboxDate(postedDate: string): string {
  const date = new Date(`${postedDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return postedDate;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatInboxAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  const absolute = Math.abs(parsed).toFixed(2);
  return parsed > 0 ? `+$${absolute}` : `−$${absolute}`;
}

export function invertAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0.00";
  }
  return (-parsed).toFixed(2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/workspace/inboxFormat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/inboxFormat.ts src/features/workspace/inboxFormat.test.ts
git commit -m "feat: inbox formatting helpers"
```

---

## Task 3: InboxToolbar component

**Files:**
- Create: `src/features/workspace/InboxToolbar.tsx`
- Test: `src/features/workspace/InboxToolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/workspace/InboxToolbar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxToolbar } from "./InboxToolbar";

const baseProps = {
  accounts: ["Assets:Bank:Ally", "Assets:Bank:Chase"],
  account: "all",
  months: [{ value: "2026-05", label: "May 2026" }],
  month: "all",
  tab: "all" as const,
  counts: { all: 36, pending: 4, matched: 31, transfers: 1 },
};

describe("InboxToolbar", () => {
  it("renders tab counts and fires tab changes", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(
      <InboxToolbar
        {...baseProps}
        onAccountChange={vi.fn()}
        onMonthChange={vi.fn()}
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveTextContent("4");
    await user.click(screen.getByRole("tab", { name: /Transfers/ }));
    expect(onTabChange).toHaveBeenCalledWith("transfers");
  });

  it("fires account and month changes", async () => {
    const user = userEvent.setup();
    const onAccountChange = vi.fn();
    const onMonthChange = vi.fn();
    render(
      <InboxToolbar
        {...baseProps}
        onAccountChange={onAccountChange}
        onMonthChange={onMonthChange}
        onTabChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Account"), "Assets:Bank:Chase");
    expect(onAccountChange).toHaveBeenCalledWith("Assets:Bank:Chase");

    await user.selectOptions(screen.getByLabelText("Dates"), "2026-05");
    expect(onMonthChange).toHaveBeenCalledWith("2026-05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/workspace/InboxToolbar.test.tsx`
Expected: FAIL — cannot resolve `./InboxToolbar`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/workspace/InboxToolbar.tsx
import type { InboxTab, MonthOption } from "./inboxFilters";

type InboxToolbarProps = {
  accounts: string[];
  account: string;
  onAccountChange: (value: string) => void;
  months: MonthOption[];
  month: string;
  onMonthChange: (value: string) => void;
  tab: InboxTab;
  onTabChange: (tab: InboxTab) => void;
  counts: Record<"all" | InboxTab, number>;
};

const tabDefs: Array<{ id: InboxTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "matched", label: "Matched" },
  { id: "transfers", label: "Transfers" },
];

export function InboxToolbar({
  accounts,
  account,
  onAccountChange,
  months,
  month,
  onMonthChange,
  tab,
  onTabChange,
  counts,
}: InboxToolbarProps) {
  return (
    <div className="inbox-toolbar">
      <div className="inbox-filters">
        <label className="inbox-filter">
          <span className="inbox-filter-label">Account</span>
          <select
            className="inbox-select"
            value={account}
            onChange={(event) => onAccountChange(event.target.value)}
          >
            <option value="all">All accounts</option>
            {accounts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="inbox-filter">
          <span className="inbox-filter-label">Dates</span>
          <select
            className="inbox-select"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
          >
            <option value="all">All dates</option>
            {months.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="inbox-tabs" role="tablist" aria-label="Filter transactions">
        {tabDefs.map((definition) => {
          const active = tab === definition.id;
          return (
            <button
              key={definition.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`inbox-tab ${active ? "inbox-tab--active" : ""}`}
              onClick={() => onTabChange(definition.id)}
            >
              {definition.label}
              <span className="inbox-tab-count">{counts[definition.id]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/workspace/InboxToolbar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/InboxToolbar.tsx src/features/workspace/InboxToolbar.test.tsx
git commit -m "feat: inbox filter toolbar"
```

---

## Task 4: InboxInspector component

**Files:**
- Create: `src/features/workspace/InboxInspector.tsx`
- Test: `src/features/workspace/InboxInspector.test.tsx`

This component owns the standard-entry approval form, the transfer match flow, and the read-only Posting / Source Record sections. Edit mode is controlled by the parent via `editing` / `onEditingChange` so the keyboard "E" shortcut (Task 5) can open it.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/workspace/InboxInspector.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxInspector } from "./InboxInspector";
import type { SuggestedEntry } from "../../lib/workspace/types";

function entry(overrides: Partial<SuggestedEntry>): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: "row-1",
    postedDate: "2026-05-08",
    description: "OPENAI *CHATGPT",
    sourceAccount: "Assets:Bank:Chase",
    sourceAmount: "-20.00",
    sourceFileName: "chase-may-26-08:14",
    importFingerprint: "fp",
    pendingAtImport: false,
    linkedStatementRow: null,
    suggestedLedgerAccount: "Expenses:Software",
    categorizationRuleId: "rule-1",
    aiSuggestion: {
      ledgerAccount: "Expenses:Software",
      sourceAccount: null,
      sourceAmount: null,
      payee: "OpenAI",
      narration: null,
      confidence: 0.96,
      explanation: "Matches 4 prior OPENAI charges.",
      needsHumanAttention: false,
    },
    ...overrides,
  };
}

describe("InboxInspector", () => {
  it("shows the suggestion card and accepts in one click", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <InboxInspector
        entry={entry({})}
        ledgerStatus="valid"
        editing={false}
        onEditingChange={vi.fn()}
        onApprove={onApprove}
      />,
    );

    expect(screen.getByText("96% confident")).toBeInTheDocument();
    expect(screen.getByText("Matches 4 prior OPENAI charges.")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("chase-may-26-08:14")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "row-1",
      ledgerAccount: "Expenses:Software",
    });
  });

  it("reveals the edit form when editing", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <InboxInspector
        entry={entry({})}
        ledgerStatus="valid"
        editing
        onEditingChange={vi.fn()}
        onApprove={onApprove}
      />,
    );

    const input = screen.getByLabelText("Ledger Account");
    await user.clear(input);
    await user.type(input, "Expenses:AI");
    await user.click(screen.getByRole("button", { name: "Approve Entry" }));
    expect(onApprove).toHaveBeenCalledWith({
      statementRowId: "row-1",
      ledgerAccount: "Expenses:AI",
    });
  });

  it("approves a matched transfer", async () => {
    const user = userEvent.setup();
    const onApproveTransfer = vi.fn().mockResolvedValue(undefined);
    render(
      <InboxInspector
        entry={entry({
          statementRowId: "row-2",
          kind: "transfer",
          suggestedLedgerAccount: null,
          aiSuggestion: null,
          linkedStatementRow: {
            statementRowId: "row-3",
            postedDate: "2026-05-08",
            description: "Transfer in",
            sourceAccount: "Assets:Bank:Ally",
            sourceAmount: "20.00",
            sourceFileName: "ally.csv",
            importFingerprint: "fp2",
          },
        })}
        ledgerStatus="valid"
        editing={false}
        onEditingChange={vi.fn()}
        onApprove={vi.fn()}
        onApproveTransfer={onApproveTransfer}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Approve Transfer" }));
    expect(onApproveTransfer).toHaveBeenCalledWith({
      statementRowId: "row-2",
      linkedStatementRowId: "row-3",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/workspace/InboxInspector.test.tsx`
Expected: FAIL — cannot resolve `./InboxInspector`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/workspace/InboxInspector.tsx
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { LedgerStatus, SuggestedEntry } from "../../lib/workspace/types";
import { formatInboxAmount, formatInboxDate, invertAmount } from "./inboxFormat";

type InboxInspectorProps = {
  entry: SuggestedEntry;
  ledgerStatus: LedgerStatus;
  knownAccounts?: string[];
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onApprove: (input: { statementRowId: string; ledgerAccount: string }) => Promise<void> | void;
  onApproveTransfer?: (input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) => Promise<void> | void;
  onRevertTransfer?: (input: { statementRowId: string }) => Promise<void> | void;
};

export function InboxInspector({
  entry,
  ledgerStatus,
  knownAccounts = [],
  editing,
  onEditingChange,
  onApprove,
  onApproveTransfer,
  onRevertTransfer,
}: InboxInspectorProps) {
  const [ledgerAccount, setLedgerAccount] = useState(entry.suggestedLedgerAccount ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const approvalBlocked = ledgerStatus === "invalid";
  const isTransfer = entry.kind === "transfer";
  const linkedRow = entry.linkedStatementRow;
  const suggestedAccount = entry.suggestedLedgerAccount ?? entry.aiSuggestion?.ledgerAccount ?? null;
  const isNewAccount =
    ledgerAccount.trim().length > 0 && !knownAccounts.includes(ledgerAccount.trim());

  useEffect(() => {
    setLedgerAccount(entry.suggestedLedgerAccount ?? "");
  }, [entry.statementRowId, entry.suggestedLedgerAccount]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  async function handleAccept() {
    if (approvalBlocked || !suggestedAccount) return;
    setIsSubmitting(true);
    try {
      await onApprove({ statementRowId: entry.statementRowId, ledgerAccount: suggestedAccount });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (approvalBlocked) return;
    setIsSubmitting(true);
    try {
      await onApprove({ statementRowId: entry.statementRowId, ledgerAccount: ledgerAccount.trim() });
      onEditingChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTransferApproval() {
    if (approvalBlocked || !linkedRow || !onApproveTransfer) return;
    setIsSubmitting(true);
    try {
      await onApproveTransfer({
        statementRowId: entry.statementRowId,
        linkedStatementRowId: linkedRow.statementRowId,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevertTransfer() {
    if (!onRevertTransfer) return;
    setIsSubmitting(true);
    try {
      await onRevertTransfer({ statementRowId: entry.statementRowId });
    } finally {
      setIsSubmitting(false);
    }
  }

  const showEditForm = !isTransfer && (editing || !suggestedAccount);
  const confidence = entry.aiSuggestion?.confidence;

  return (
    <div className="inbox-inspector-body">
      <div className="inbox-inspector-head">
        <div className="insp-eyebrow">Pending · Selected</div>
        <div className="inbox-inspector-amount">{formatInboxAmount(entry.sourceAmount)}</div>
        <div className="inbox-inspector-title">{entry.description}</div>
        <div className="inbox-inspector-meta">
          {formatInboxDate(entry.postedDate)} · {entry.sourceAccount}
        </div>
      </div>

      {isTransfer ? (
        <section className="inbox-suggestion-card" aria-label="Transfer match">
          <div className="inbox-suggestion-head">
            <span className="inbox-suggestion-badge">Transfer Match</span>
          </div>
          <div className="inbox-suggestion-account">
            {linkedRow ? linkedRow.sourceAccount : "Awaiting matching row"}
          </div>
          <p className="inbox-suggestion-explanation">
            {linkedRow
              ? `${linkedRow.sourceAmount} USD · ${linkedRow.description}`
              : "No counter-row found yet."}
          </p>
          <div className="inbox-suggestion-actions">
            <button
              className="primary-button"
              type="button"
              disabled={approvalBlocked || !linkedRow || !onApproveTransfer || isSubmitting}
              onClick={handleTransferApproval}
            >
              {approvalBlocked
                ? "Approval blocked"
                : linkedRow
                  ? "Approve Transfer"
                  : "Needs matching row"}
            </button>
            {!linkedRow && onRevertTransfer ? (
              <button
                className="secondary-button"
                type="button"
                disabled={isSubmitting}
                onClick={handleRevertTransfer}
              >
                Not a transfer — treat as expense
              </button>
            ) : null}
          </div>
        </section>
      ) : suggestedAccount && !editing ? (
        <section className="inbox-suggestion-card" aria-label="Suggestion">
          <div className="inbox-suggestion-head">
            <span className="inbox-suggestion-badge">
              {entry.aiSuggestion ? "AI Suggestion" : "Rule Suggestion"}
            </span>
            {typeof confidence === "number" ? (
              <span className="inbox-suggestion-confidence">
                {Math.round(confidence * 100)}% confident
              </span>
            ) : null}
          </div>
          <div className="inbox-suggestion-account">{suggestedAccount}</div>
          {entry.aiSuggestion?.explanation ? (
            <p className="inbox-suggestion-explanation">{entry.aiSuggestion.explanation}</p>
          ) : null}
          <div className="inbox-suggestion-actions">
            <button
              className="primary-button"
              type="button"
              disabled={approvalBlocked || isSubmitting}
              onClick={handleAccept}
            >
              {approvalBlocked ? "Approval blocked" : "Accept"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onEditingChange(true)}
            >
              Edit
            </button>
          </div>
        </section>
      ) : null}

      {showEditForm ? (
        <form className="inbox-edit-form" onSubmit={handleSubmit}>
          <label htmlFor="ledger-account-input">Ledger Account</label>
          <input
            id="ledger-account-input"
            ref={inputRef}
            list="known-accounts"
            value={ledgerAccount}
            onChange={(event) => setLedgerAccount(event.target.value)}
            placeholder="Expenses:Software"
          />
          <datalist id="known-accounts">
            {knownAccounts.map((account) => (
              <option key={account} value={account} />
            ))}
          </datalist>
          {isNewAccount ? (
            <span className="new-account-hint">New account — will be created on approval</span>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={approvalBlocked || !ledgerAccount.trim() || isSubmitting}
          >
            {approvalBlocked ? "Approval blocked" : "Approve Entry"}
          </button>
        </form>
      ) : null}

      {!isTransfer ? (
        <section className="inbox-posting" aria-label="Posting">
          <p className="inbox-section-label">Posting</p>
          <InspectorField label="Payee" value={entry.aiSuggestion?.payee || entry.description} />
          <div className="inbox-field">
            <span className="inbox-field-label">Narration</span>
            {entry.aiSuggestion?.narration ? (
              <span className="inbox-field-value">{entry.aiSuggestion.narration}</span>
            ) : (
              <span className="inbox-field-value inbox-field-placeholder">Add a note…</span>
            )}
          </div>
          <div className="inbox-field">
            <span className="inbox-field-label">Category</span>
            {suggestedAccount ? (
              <span className="inbox-chip inbox-chip--rule">{suggestedAccount}</span>
            ) : (
              <span className="inbox-chip inbox-chip--uncategorized">Uncategorized</span>
            )}
          </div>
          <InspectorField label="Counter Account" value={entry.sourceAccount} />
        </section>
      ) : null}

      <section className="inbox-source-record" aria-label="Source record">
        <p className="inbox-section-label">Source Record</p>
        <InspectorField label="Statement memo" value={entry.description} />
        <InspectorField label="Posted" value={entry.postedDate} mono />
        <InspectorField label="Import batch" value={entry.sourceFileName} mono />
        <InspectorField label="Statement ID" value={entry.statementRowId} mono />
      </section>
    </div>
  );
}

function InspectorField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="inbox-field">
      <span className="inbox-field-label">{label}</span>
      <span className={`inbox-field-value ${mono ? "inbox-field-value--mono" : ""}`}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/workspace/InboxInspector.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/InboxInspector.tsx src/features/workspace/InboxInspector.test.tsx
git commit -m "feat: inbox inspector panel"
```

---

## Task 5: Rewrite InboxPanel — header, toolbar, grouped table, selection, keyboard nav

**Files:**
- Modify: `src/features/workspace/InboxPanel.tsx` (full rewrite)
- Modify: `src/features/workspace/InboxPanel.test.tsx` (full rewrite)

- [ ] **Step 1: Replace the test file**

```tsx
// src/features/workspace/InboxPanel.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxPanel } from "./InboxPanel";
import type { SuggestedEntry } from "../../lib/workspace/types";

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

describe("InboxPanel", () => {
  it("groups rows into needs-review and matched", () => {
    render(<InboxPanel suggestedEntries={entries} ledgerStatus="valid" onApprove={vi.fn()} />);

    expect(screen.getByText(/needs your review/)).toBeInTheDocument();
    expect(screen.getByText(/auto-posted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OPENAI \*CHATGPT/ })).toBeInTheDocument();
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

    // First entry in flat order (needs-review group first) starts selected.
    expect(screen.getByRole("button", { name: /LYFT \*RIDE/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /Transfer to savings/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/workspace/InboxPanel.test.tsx`
Expected: FAIL — current `InboxPanel` has no tabs/groups/`Accept`/keyboard nav.

- [ ] **Step 3: Rewrite `InboxPanel.tsx`**

```tsx
// src/features/workspace/InboxPanel.tsx
import { useEffect, useMemo, useState } from "react";
import type { LedgerStatus, SuggestedEntry } from "../../lib/workspace/types";
import { InboxInspector } from "./InboxInspector";
import { InboxToolbar } from "./InboxToolbar";
import {
  accountOptions,
  bucketCounts,
  filterEntries,
  groupEntries,
  monthOptions,
  type InboxTab,
} from "./inboxFilters";
import { formatInboxAmount, formatInboxDate } from "./inboxFormat";

type InboxPanelProps = {
  suggestedEntries: SuggestedEntry[];
  ledgerStatus: LedgerStatus;
  knownAccounts?: string[];
  onApprove: (input: { statementRowId: string; ledgerAccount: string }) => Promise<void> | void;
  onApproveTransfer?: (input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) => Promise<void> | void;
  onRevertTransfer?: (input: { statementRowId: string }) => Promise<void> | void;
};

export function InboxPanel({
  suggestedEntries,
  ledgerStatus,
  knownAccounts,
  onApprove,
  onApproveTransfer,
  onRevertTransfer,
}: InboxPanelProps) {
  const [account, setAccount] = useState("all");
  const [month, setMonth] = useState("all");
  const [tab, setTab] = useState<InboxTab>("all");
  const [selectedStatementRowId, setSelectedStatementRowId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const accounts = useMemo(() => accountOptions(suggestedEntries), [suggestedEntries]);
  const months = useMemo(() => monthOptions(suggestedEntries), [suggestedEntries]);
  const totals = useMemo(() => bucketCounts(suggestedEntries), [suggestedEntries]);

  const scoped = useMemo(
    () => filterEntries(suggestedEntries, { account, month, tab: "all" }),
    [suggestedEntries, account, month],
  );
  const tabCounts = useMemo(() => {
    const counts = bucketCounts(scoped);
    return { all: scoped.length, ...counts };
  }, [scoped]);

  const filtered = useMemo(
    () => filterEntries(suggestedEntries, { account, month, tab }),
    [suggestedEntries, account, month, tab],
  );
  const groups = useMemo(() => groupEntries(filtered), [filtered]);
  const ordered = useMemo(
    () => [...groups.needsReview, ...groups.matched],
    [groups],
  );

  const selectedEntry = useMemo(
    () =>
      ordered.find((entry) => entry.statementRowId === selectedStatementRowId) ?? ordered[0] ?? null,
    [ordered, selectedStatementRowId],
  );

  useEffect(() => {
    setEditing(false);
  }, [selectedEntry?.statementRowId]);

  useEffect(() => {
    if (selectedEntry && selectedEntry.statementRowId !== selectedStatementRowId) {
      setSelectedStatementRowId(selectedEntry.statementRowId);
    }
  }, [selectedEntry, selectedStatementRowId]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || ordered.length === 0) return;
      const index = ordered.findIndex(
        (entry) => entry.statementRowId === selectedEntry?.statementRowId,
      );

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = ordered[Math.min(index + 1, ordered.length - 1)];
        if (next) setSelectedStatementRowId(next.statementRowId);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const previous = ordered[Math.max(index - 1, 0)];
        if (previous) setSelectedStatementRowId(previous.statementRowId);
      } else if (event.key === "e" && selectedEntry?.kind === "standard") {
        event.preventDefault();
        setEditing(true);
      } else if (event.key === "Enter" && selectedEntry) {
        const suggested =
          selectedEntry.suggestedLedgerAccount ?? selectedEntry.aiSuggestion?.ledgerAccount ?? null;
        if (selectedEntry.kind === "transfer" && selectedEntry.linkedStatementRow && onApproveTransfer) {
          event.preventDefault();
          void onApproveTransfer({
            statementRowId: selectedEntry.statementRowId,
            linkedStatementRowId: selectedEntry.linkedStatementRow.statementRowId,
          });
        } else if (selectedEntry.kind === "standard" && suggested && ledgerStatus === "valid") {
          event.preventDefault();
          void onApprove({ statementRowId: selectedEntry.statementRowId, ledgerAccount: suggested });
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ordered, selectedEntry, ledgerStatus, onApprove, onApproveTransfer]);

  return (
    <section className="inbox-panel" aria-labelledby="inbox-title">
      <header className="page-header inbox-header">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1 id="inbox-title">Inbox</h1>
          <p className="page-subtitle">
            <span className="pill-count">{totals.pending}</span> pending
            <span className="dot-sep">·</span>
            <span className="pill-count">{totals.matched}</span> matched by rules
            <span className="dot-sep">·</span>
            <span className="pill-count">{totals.transfers}</span> possible transfer
          </p>
        </div>
      </header>

      {suggestedEntries.length === 0 ? (
        <section className="inbox-empty-state" aria-live="polite">
          <p className="eyebrow">Inbox</p>
          <h2>No pending Statement Rows</h2>
          <p>
            Imported rows will appear here when they are waiting for review. Approved rows
            disappear from the Inbox and return you to the Ledger Editor.
          </p>
        </section>
      ) : (
        <>
          <InboxToolbar
            accounts={accounts}
            account={account}
            onAccountChange={setAccount}
            months={months}
            month={month}
            onMonthChange={setMonth}
            tab={tab}
            onTabChange={setTab}
            counts={tabCounts}
          />

          <div className="inbox-layout">
            <section className="inbox-list-col" aria-labelledby="inbox-list-title">
              <span id="inbox-list-title" className="sr-only">
                Pending Statement Rows
              </span>
              <InboxGroup
                title={`Pending · ${groups.needsReview.length} transactions · needs your review`}
                entries={groups.needsReview}
                selectedId={selectedEntry?.statementRowId ?? null}
                onSelect={setSelectedStatementRowId}
              />
              <InboxGroup
                title={`Matched by rules · ${groups.matched.length} transactions · auto-posted`}
                entries={groups.matched}
                selectedId={selectedEntry?.statementRowId ?? null}
                onSelect={setSelectedStatementRowId}
              />
            </section>

            <aside className="inbox-inspector" aria-label="Transaction inspector">
              {selectedEntry ? (
                <InboxInspector
                  entry={selectedEntry}
                  ledgerStatus={ledgerStatus}
                  knownAccounts={knownAccounts}
                  editing={editing}
                  onEditingChange={setEditing}
                  onApprove={onApprove}
                  onApproveTransfer={onApproveTransfer}
                  onRevertTransfer={onRevertTransfer}
                />
              ) : null}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function InboxGroup({
  title,
  entries,
  selectedId,
  onSelect,
}: {
  title: string;
  entries: SuggestedEntry[];
  selectedId: string | null;
  onSelect: (statementRowId: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="inbox-group">
      <div className="inbox-group-head">{title}</div>
      <div className="inbox-table" role="list">
        {entries.map((entry) => {
          const selected = entry.statementRowId === selectedId;
          return (
            <button
              key={entry.statementRowId}
              type="button"
              role="listitem"
              aria-pressed={selected}
              className={`inbox-row ${selected ? "inbox-row--selected" : ""}`}
              onClick={() => onSelect(entry.statementRowId)}
            >
              <span className="inbox-row-date">{formatInboxDate(entry.postedDate)}</span>
              <span className="inbox-row-desc">{entry.description}</span>
              <span className="inbox-row-tags">
                <CategoryChip entry={entry} />
                {entry.pendingAtImport ? (
                  <span className="pending-at-import-badge">Pending at import</span>
                ) : null}
              </span>
              <span className="inbox-row-amount">{formatInboxAmount(entry.sourceAmount)}</span>
              <span className="inbox-row-glyph" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChip({ entry }: { entry: SuggestedEntry }) {
  if (entry.kind === "transfer") {
    const target = entry.linkedStatementRow?.sourceAccount;
    return (
      <span className="inbox-chip inbox-chip--transfer">
        {target ? `Transfer → ${target}` : "Transfer"}
      </span>
    );
  }
  if (entry.suggestedLedgerAccount) {
    return <span className="inbox-chip inbox-chip--rule">{entry.suggestedLedgerAccount}</span>;
  }
  return <span className="inbox-chip inbox-chip--uncategorized">Uncategorized</span>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/workspace/InboxPanel.test.tsx`
Expected: PASS (all five cases).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/features/workspace/InboxPanel.tsx src/features/workspace/InboxPanel.test.tsx
git commit -m "feat: rebuild InboxPanel with toolbar, groups, and keyboard nav"
```

---

## Task 6: Status-bar shortcut hints

**Files:**
- Modify: `src/components/AppShell.tsx` (props type ~line 20-40; non-ledger status branch ~line 280-297)
- Modify: `src/App.tsx` (`<AppShell …>` props ~line 1310-1328)

- [ ] **Step 1: Add the `statusHints` prop to the type**

In `src/components/AppShell.tsx`, in `type AppShellProps`, add after the `ledgerCursor` line:

```tsx
  ledgerCursor?: { line: number; column: number } | null;
  statusHints?: ReactNode;
```

- [ ] **Step 2: Destructure the prop**

In the `AppShell(` parameter destructuring (where `statusContext`, `ledgerCursor` are listed, ~line 76-77), add:

```tsx
  statusContext,
  ledgerCursor,
  statusHints,
```

- [ ] **Step 3: Render the hints in the non-ledger status branch**

In `src/components/AppShell.tsx`, replace the non-ledger `else` branch body (currently):

```tsx
            <>
              <span>{statusContext}</span>
              <span className="status-bar-right">
```

with:

```tsx
            <>
              <span>{statusContext}</span>
              {statusHints ? <span className="status-bar-hints">{statusHints}</span> : null}
              <span className="status-bar-right">
```

- [ ] **Step 4: Pass the hints from App for the inbox screen**

In `src/App.tsx`, in the `<AppShell …>` element, add a prop after `ledgerCursor`:

```tsx
        statusContext={activeScreen === "ledger" ? ledgerActiveFile : statusContextFor(activeScreen)}
        ledgerCursor={activeScreen === "ledger" ? ledgerCursor : null}
        statusHints={activeScreen === "inbox" ? "⏎ Accept · J / K Navigate · E Edit" : null}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (`ReactNode` is already imported in `AppShell.tsx`; if not, add it to the existing `import type { ReactNode } …` / `react` import.)

- [ ] **Step 6: Commit**

```bash
git add src/components/AppShell.tsx src/App.tsx
git commit -m "feat: inbox keyboard-shortcut hints in status bar"
```

---

## Task 7: Styling

**Files:**
- Modify: `src/styles.css`

Replace the inbox CSS region and add new classes. The current inbox block runs from `.inbox-panel {` (line ~2207) through `.inbox-inspector-meta { … }` (line ~2410).

- [ ] **Step 1: Replace the inbox CSS block**

Select from the line `.inbox-panel {` through the closing `}` of `.inbox-inspector-meta` and replace the whole region with:

```css
.inbox-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 16px;
}

.inbox-header {
  margin-bottom: 0;
  padding-bottom: 4px;
}

.inbox-empty-state {
  display: grid;
  gap: 12px;
  max-width: 56ch;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-bg);
  padding: 20px;
}

.inbox-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.inbox-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.inbox-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.inbox-filter-label {
  font-weight: 600;
}

.inbox-select {
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 8px;
  font: inherit;
  font-size: 13px;
}

.inbox-select:focus-visible {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-bg);
}

.inbox-tabs {
  display: inline-flex;
  gap: 2px;
}

.inbox-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  padding: 0 10px;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: default;
}

.inbox-tab:hover {
  background: var(--color-bg-subtle);
}

.inbox-tab--active {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.inbox-tab-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-subtle);
}

.inbox-tab--active .inbox-tab-count {
  color: var(--color-accent);
}

.inbox-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.inbox-list-col,
.inbox-inspector {
  min-width: 0;
  min-height: 0;
}

.inbox-list-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.inbox-group-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-bg);
  padding: 8px 0 6px;
  color: var(--color-text-subtle);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inbox-table {
  display: flex;
  flex-direction: column;
}

.inbox-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto auto 18px;
  align-items: center;
  gap: 14px;
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  background: transparent;
  padding: 10px 8px;
  color: var(--color-text);
  text-align: left;
  cursor: default;
}

.inbox-row:hover {
  background: var(--color-bg-subtle);
}

.inbox-row--selected {
  background: var(--color-accent-bg);
}

.inbox-row-date {
  color: var(--color-text-subtle);
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
}

.inbox-row-desc {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
}

.inbox-row-tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.inbox-row-amount {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.inbox-row-glyph {
  display: inline-flex;
  color: var(--color-text-subtle);
}

.inbox-chip,
.pending-at-import-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  border-radius: 2px;
  padding: 1px 6px;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.pending-at-import-badge {
  border: 1px solid var(--color-highlight);
  background: var(--color-highlight-bg);
  color: var(--color-highlight-ink);
  font-family: inherit;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.inbox-chip--rule {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.inbox-chip--transfer,
.inbox-chip--uncategorized {
  background: var(--color-highlight-bg);
  color: var(--color-highlight-ink);
}

.inbox-inspector {
  border-left: 1px solid var(--color-border);
  padding-left: 20px;
  overflow-y: auto;
}

.inbox-inspector-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.inbox-inspector-head {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
}

.insp-eyebrow,
.inbox-section-label {
  color: var(--color-text-subtle);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inbox-inspector-amount {
  color: var(--color-text);
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 28px;
  font-weight: 600;
}

.inbox-inspector-title {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 14px;
  font-weight: 600;
}

.inbox-inspector-meta {
  color: var(--color-text-muted);
  font-size: 13px;
}

.inbox-suggestion-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-bg-subtle);
  padding: 14px;
}

.inbox-suggestion-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.inbox-suggestion-badge {
  color: var(--color-text-subtle);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inbox-suggestion-confidence {
  color: var(--color-accent);
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
}

.inbox-suggestion-account {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 14px;
  font-weight: 600;
}

.inbox-suggestion-explanation {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.inbox-suggestion-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.inbox-edit-form {
  display: grid;
  gap: 8px;
}

.inbox-edit-form label {
  color: var(--color-text-subtle);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inbox-posting,
.inbox-source-record {
  display: grid;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.inbox-field {
  display: grid;
  gap: 3px;
}

.inbox-field-label {
  color: var(--color-text-subtle);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inbox-field-value {
  font-size: 14px;
}

.inbox-field-value--mono {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
}

.inbox-field-placeholder {
  color: var(--color-text-subtle);
  font-style: italic;
}

.inbox-source-record .inbox-field {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
}

.inbox-source-record .inbox-field-value {
  text-align: right;
}
```

- [ ] **Step 2: Add the status-bar hints class**

Append near the end of `src/styles.css`:

```css
.status-bar-hints {
  margin-left: 16px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Verify the build compiles the CSS**

Run: `npm run build`
Expected: build succeeds (CSS is bundled; no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "style: dense inbox table, toolbar, and inspector chrome"
```

---

## Task 8: Full verification + visual check

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including the new inbox tests.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 3: Visual confirmation**

Launch the app (use the `run` skill or `npm run tauri dev`), open a workspace with pending imports, and confirm against `docs/screenshots/Inbox.png`:
- Toolbar with Account / Dates selects and All/Pending/Matched/Transfers tabs with counts.
- Two dense groups ("needs your review", "auto-posted") with mono rows, category chips (lapis for accounts, ochre for transfers/uncategorized), right-aligned amounts.
- Selected row in lapis-bg; inspector showing the suggestion card (badge + confidence + explanation + Accept/Edit), Posting fields, and Source Record.
- Status bar shows `⏎ Accept · J / K Navigate · E Edit` and no "Synced" text.
- Keyboard: J/K move selection, Enter accepts a suggested/matched row, E opens edit mode.

- [ ] **Step 4: Final commit (if any screenshots/docs updated)**

```bash
git add -A
git commit -m "chore: verify inbox redesign"
```

(Skip if there is nothing to commit.)

---

## Self-review notes

- **Spec coverage:** header counts (Task 5), toolbar account/date/tabs (Tasks 1, 3, 5), dense grouped table + chips (Tasks 1, 5, 7), inspector suggestion/posting/source-record + transfer + edit (Task 4), keyboard nav + status hints (Tasks 5, 6), tests (Tasks 1–5), styling (Task 7), honest-chrome exclusions: no sync text (Task 6), no masked numbers (Task 4 meta uses `sourceAccount` only). All covered.
- **Type consistency:** `InboxTab`, `MonthOption`, `InboxFilter`, `InboxGroups`, `bucketOf`, `bucketCounts`, `accountOptions`, `monthOptions`, `filterEntries`, `groupEntries` defined in Task 1 and used identically in Tasks 3 & 5. `counts: Record<"all" | InboxTab, number>` in Task 3 matches `{ all, ...bucketCounts }` built in Task 5. `InboxInspector` props (`editing`, `onEditingChange`, `onApprove`, `onApproveTransfer`, `onRevertTransfer`) match Task 5's usage.
- **Placeholders:** none — every code/CSS step is complete.
