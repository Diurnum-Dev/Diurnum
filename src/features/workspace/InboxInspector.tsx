// src/features/workspace/InboxInspector.tsx
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { LedgerStatus, SuggestedEntry } from "../../lib/workspace/types";
import { formatInboxAmount, formatInboxDate } from "./inboxFormat";
import { AccountCombobox } from "./AccountCombobox";

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

  // Transfers are approved/reverted as-is; the edit-account form never applies to them.
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
              ? `${formatInboxAmount(linkedRow.sourceAmount)} · ${linkedRow.description}`
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
              disabled={isSubmitting}
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
          <AccountCombobox
            id="ledger-account-input"
            ref={inputRef}
            value={ledgerAccount}
            onChange={setLedgerAccount}
            knownAccounts={knownAccounts}
            placeholder="Expenses:Software"
          />
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
