import { useEffect, useMemo, useState } from "react";
import type { LedgerStatus, SuggestedEntry } from "../../lib/workspace/types";
import { SuggestedEntryDetail } from "./SuggestedEntryReview";

type InboxPanelProps = {
  suggestedEntries: SuggestedEntry[];
  ledgerStatus: LedgerStatus;
  onApprove: (input: {
    statementRowId: string;
    ledgerAccount: string;
  }) => Promise<void> | void;
  onApproveTransfer?: (input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) => Promise<void> | void;
};

export function InboxPanel({
  suggestedEntries,
  ledgerStatus,
  onApprove,
  onApproveTransfer,
}: InboxPanelProps) {
  const [selectedStatementRowId, setSelectedStatementRowId] = useState<string | null>(
    suggestedEntries[0]?.statementRowId ?? null,
  );

  const selectedEntry = useMemo(() => {
    if (suggestedEntries.length === 0) return null;
    return (
      suggestedEntries.find((entry) => entry.statementRowId === selectedStatementRowId) ??
      suggestedEntries[0]
    );
  }, [suggestedEntries, selectedStatementRowId]);

  useEffect(() => {
    if (suggestedEntries.length === 0) {
      setSelectedStatementRowId(null);
      return;
    }
    if (!selectedEntry) {
      setSelectedStatementRowId(suggestedEntries[0].statementRowId);
    }
  }, [suggestedEntries, selectedEntry]);

  const pendingCount = suggestedEntries.length;
  const pendingAtImportCount = suggestedEntries.filter((entry) => entry.pendingAtImport).length;
  const transferCount = suggestedEntries.filter((entry) => entry.kind === "transfer").length;
  const matchedByRulesCount = suggestedEntries.filter(
    (entry) => entry.kind === "standard" && Boolean(entry.suggestedLedgerAccount),
  ).length;

  return (
    <section className="inbox-panel" aria-labelledby="inbox-title">
      <header className="page-header inbox-header">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1 id="inbox-title">Inbox</h1>
          <p className="page-subtitle">
            <span className="pill-count">{pendingCount}</span> pending
            <span className="dot-sep">·</span>
            <span className="pill-count">{matchedByRulesCount}</span> matched by rules
            <span className="dot-sep">·</span>
            <span className="pill-count">{transferCount}</span> possible transfer
          </p>
        </div>
        <div className="inbox-summary">
          <span>{pendingCount} pending rows</span>
          <span>{pendingAtImportCount} pending at import</span>
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
        <div className="inbox-layout">
          <section className="inbox-list-col" aria-labelledby="inbox-list-title">
            <div className="inbox-list-head">
              <span id="inbox-list-title">Pending</span>
              <span>{pendingCount} transactions · needs your review</span>
            </div>
            <div className="inbox-list" role="list" aria-label="Pending Statement Rows">
              {suggestedEntries.map((entry) => {
                const selected = entry.statementRowId === selectedEntry?.statementRowId;
                return (
                  <button
                    key={entry.statementRowId}
                    className={`inbox-row ${selected ? "selected" : ""}`}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedStatementRowId(entry.statementRowId)}
                  >
                    <span className="inbox-row-date">{formatInboxDate(entry.postedDate)}</span>
                    <span className="inbox-row-desc">{entry.description}</span>
                    <span className="inbox-row-amount">{formatInboxAmount(entry.sourceAmount)}</span>
                    <span className="inbox-row-source">{entry.sourceAccount}</span>
                    <span className="inbox-row-badges">
                      {entry.pendingAtImport ? (
                        <span className="pending-at-import-badge">Pending at import</span>
                      ) : null}
                      {entry.kind === "transfer" ? (
                        <span className="inbox-chip inbox-chip--transfer">Transfer Match</span>
                      ) : entry.suggestedLedgerAccount ? (
                        <span className="inbox-chip inbox-chip--rule">Rule suggestion</span>
                      ) : entry.aiSuggestion ? (
                        <span className="inbox-chip inbox-chip--ai">AI suggestion</span>
                      ) : (
                        <span className="inbox-chip inbox-chip--plain">Needs review</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="inbox-inspector" aria-label="Transaction inspector">
            {selectedEntry ? (
              <>
                <div className="inbox-inspector-head">
                  <div className="insp-eyebrow">Pending · Selected</div>
                  <div className="inbox-inspector-amount">
                    {formatInboxAmount(selectedEntry.sourceAmount)}
                  </div>
                  <div className="inbox-inspector-title">{selectedEntry.description}</div>
                  <div className="inbox-inspector-meta">
                    {formatInboxDate(selectedEntry.postedDate)} · {selectedEntry.sourceAccount} ·{" "}
                    {selectedEntry.sourceFileName}
                  </div>
                </div>

                <SuggestedEntryDetail
                  entry={selectedEntry}
                  ledgerStatus={ledgerStatus}
                  onApprove={onApprove}
                  onApproveTransfer={onApproveTransfer}
                />
              </>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}

function formatInboxDate(postedDate: string): string {
  const date = new Date(`${postedDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return postedDate;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatInboxAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  const absolute = Math.abs(parsed).toFixed(2);
  return parsed > 0 ? `+$${absolute}` : `−$${absolute}`;
}
