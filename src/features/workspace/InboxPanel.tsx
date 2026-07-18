// src/features/workspace/InboxPanel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AiAssistPassState,
  AiContextDisclosure,
  ApproveAiAssistBatchInput,
  LedgerStatus,
  SuggestedEntry,
} from "../../lib/workspace/types";
import { AiAssistReview } from "./AiAssistReview";
import { InboxInspector } from "./InboxInspector";
import { InboxToolbar } from "./InboxToolbar";
import {
  accountOptions,
  bucketCounts,
  filterEntries,
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
  aiAssist?: {
    pass: AiAssistPassState | null;
    adapterConfigured: boolean;
    running: boolean;
    actionBusy?: boolean;
    disclosure: AiContextDisclosure | null;
    onStart: () => void;
    onApprove: (selection: {
      entries: ApproveAiAssistBatchInput["entries"];
      rules: ApproveAiAssistBatchInput["rules"];
    }) => Promise<void>;
    onDismiss: () => Promise<void>;
    onRetry: () => Promise<void>;
    onOpenSettings: () => void;
  };
};

const AI_ASSIST_DISCLOSURE_KEY = "diurnum.aiAssist.disclosureAcknowledged";

export function InboxPanel({
  suggestedEntries,
  ledgerStatus,
  knownAccounts,
  onApprove,
  onApproveTransfer,
  onRevertTransfer,
  aiAssist,
}: InboxPanelProps) {
  const [account, setAccount] = useState("all");
  const [month, setMonth] = useState("all");
  const [tab, setTab] = useState<InboxTab>("all");
  const [selectedStatementRowId, setSelectedStatementRowId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [reviewExitPassId, setReviewExitPassId] = useState<string | null>(null);

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
  const activeReviewPass =
    aiAssist?.pass &&
    (aiAssist.pass.status === "running" || aiAssist.pass.status === "complete")
      ? aiAssist.pass
      : null;
  const reviewing = activeReviewPass?.passId !== reviewExitPassId && activeReviewPass !== null;

  function handleAiAssistClick() {
    if (!aiAssist) return;
    if (!aiAssist.adapterConfigured) {
      aiAssist.onOpenSettings();
      return;
    }
    if (activeReviewPass && reviewExitPassId === activeReviewPass.passId) {
      setReviewExitPassId(null);
      return;
    }
    if (activeReviewPass) return;
    if (readDisclosureAcknowledgment()) {
      aiAssist.onStart();
    } else {
      setDisclosureOpen(true);
    }
  }

  function confirmAiAssistDisclosure() {
    if (!aiAssist) return;
    acknowledgeDisclosure();
    setDisclosureOpen(false);
    aiAssist.onStart();
  }
  const ordered = useMemo(
    () => [...filtered].sort((a, b) => b.postedDate.localeCompare(a.postedDate)),
    [filtered],
  );

  // Remembers where the selection sat so that when an approved row leaves the
  // list, the Founder-Operator advances to the next item and keeps triaging
  // (ADR 0003) rather than jumping back to the top.
  const selectedIndexRef = useRef(0);

  const selectedEntry = useMemo(() => {
    const byId = ordered.find((entry) => entry.statementRowId === selectedStatementRowId);
    if (byId) return byId;
    if (ordered.length === 0) return null;
    const nextIndex = Math.min(selectedIndexRef.current, ordered.length - 1);
    return ordered[nextIndex] ?? ordered[0] ?? null;
  }, [ordered, selectedStatementRowId]);

  useEffect(() => {
    const index = ordered.findIndex(
      (entry) => entry.statementRowId === selectedEntry?.statementRowId,
    );
    if (index >= 0) selectedIndexRef.current = index;
  }, [ordered, selectedEntry]);

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
        if (
          selectedEntry.kind === "transfer" &&
          selectedEntry.linkedStatementRow &&
          onApproveTransfer &&
          ledgerStatus === "valid"
        ) {
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

  const header = (
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
  );

  const aiAssistAction = aiAssist ? (
    <button
      type="button"
      className="inbox-ai-assist-button"
      disabled={aiAssist.running || reviewing}
      onClick={handleAiAssistClick}
    >
      <span>
        {!aiAssist.adapterConfigured
          ? "Set up AI Assist"
          : aiAssist.running
            ? `Categorizing… ${aiAssist.pass?.processedRows ?? 0}/${aiAssist.pass?.totalRows ?? 0}`
            : activeReviewPass
              ? "Review AI Assist"
              : "AI Assist"}
      </span>
      {!aiAssist.running && !activeReviewPass ? (
        <small>{suggestedEntries.length} pending</small>
      ) : null}
    </button>
  ) : null;
  const inboxToolbar = (
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
      action={aiAssistAction}
    />
  );
  const disclosurePanel =
    disclosureOpen && aiAssist?.disclosure ? (
      <section className="ai-assist-disclosure" aria-label="AI Assist disclosure">
        <div>
          <p className="eyebrow">Before AI Assist runs</p>
          <h2>Review the context sent to your adapter</h2>
          <ul>
            {aiAssist.disclosure.fieldsSent.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
        <div className="ai-assist-disclosure-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setDisclosureOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={confirmAiAssistDisclosure}
          >
            Run AI Assist
          </button>
        </div>
      </section>
    ) : null;

  if (reviewing && activeReviewPass && aiAssist) {
    return (
      <section className="inbox-panel" aria-labelledby="inbox-title">
        {header}
        {inboxToolbar}
        <AiAssistReview
          pass={activeReviewPass}
          entries={suggestedEntries}
          onApprove={aiAssist.onApprove}
          onDismiss={aiAssist.onDismiss}
          onRetry={aiAssist.onRetry}
          busy={aiAssist.actionBusy}
          onEditRow={(statementRowId) => {
            setAccount("all");
            setMonth("all");
            setTab("all");
            setSelectedStatementRowId(statementRowId);
            setEditing(true);
            setReviewExitPassId(activeReviewPass.passId);
          }}
        />
      </section>
    );
  }

  return (
    <section className="inbox-panel" aria-labelledby="inbox-title">
      {suggestedEntries.length === 0 ? (
        <>
          {header}
          {aiAssist ? inboxToolbar : null}
          {disclosurePanel}
          <section className="inbox-empty-state" aria-live="polite">
            <p className="eyebrow">Inbox</p>
            <h2>No pending Statement Rows</h2>
            <p>
              Imported rows will appear here when they are waiting for review. Approved rows
              disappear from the Inbox and return you to the Ledger Editor.
            </p>
          </section>
        </>
      ) : (
        <>
          <div className="inbox-layout">
            <div className="inbox-content-col">
              {header}
              {inboxToolbar}
              {disclosurePanel}

              <section className="inbox-list-col" aria-labelledby="inbox-list-title">
                <span id="inbox-list-title" className="sr-only">
                  Pending Statement Rows
                </span>
                <InboxGroup
                  entries={ordered}
                  selectedId={selectedEntry?.statementRowId ?? null}
                  onSelect={setSelectedStatementRowId}
                />
              </section>
            </div>

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

function readDisclosureAcknowledgment(): boolean {
  try {
    const storage = window.localStorage as Partial<Storage> | undefined;
    return storage?.getItem?.(AI_ASSIST_DISCLOSURE_KEY) === "true";
  } catch {
    return false;
  }
}

function acknowledgeDisclosure() {
  try {
    const storage = window.localStorage as Partial<Storage> | undefined;
    storage?.setItem?.(AI_ASSIST_DISCLOSURE_KEY, "true");
  } catch {
    // Storage can be unavailable in a hardened webview; the current run still proceeds.
  }
}

function InboxGroup({
  entries,
  selectedId,
  onSelect,
}: {
  entries: SuggestedEntry[];
  selectedId: string | null;
  onSelect: (statementRowId: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="inbox-group">
      <div className="inbox-table">
        {entries.map((entry) => {
          const selected = entry.statementRowId === selectedId;
          return (
            <button
              key={entry.statementRowId}
              type="button"
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
