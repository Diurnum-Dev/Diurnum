// src/features/workspace/InboxToolbar.tsx
import type { ReactNode } from "react";
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
  action?: ReactNode;
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
  action,
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

      <div className="inbox-toolbar-actions">
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
        {action}
      </div>
    </div>
  );
}
