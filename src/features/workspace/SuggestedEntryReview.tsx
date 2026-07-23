import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { LedgerStatus, SuggestedEntry } from "../../lib/workspace/types";
import { AccountCombobox } from "./AccountCombobox";

type SuggestedEntryReviewProps = {
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

export function SuggestedEntryReview({
  suggestedEntries,
  ledgerStatus,
  onApprove,
  onApproveTransfer,
}: SuggestedEntryReviewProps) {
  if (suggestedEntries.length === 0) {
    return null;
  }

  return (
    <section className="suggested-entry-review" aria-labelledby="suggested-entry-review-title">
      <div className="section-heading">
        <p className="eyebrow">Suggested Entries</p>
        <h2 id="suggested-entry-review-title">Review and Approve</h2>
      </div>

      <div className="suggested-entry-list">
        {suggestedEntries.map((entry) => (
          <SuggestedEntryDetail
            key={entry.statementRowId}
            entry={entry}
            ledgerStatus={ledgerStatus}
            onApprove={onApprove}
            onApproveTransfer={onApproveTransfer}
          />
        ))}
      </div>
    </section>
  );
}

export function SuggestedEntryDetail({
  entry,
  ledgerStatus,
  knownAccounts = [],
  onApprove,
  onApproveTransfer,
  onRevertTransfer,
}: {
  entry: SuggestedEntry;
  ledgerStatus: LedgerStatus;
  knownAccounts?: string[];
  onApprove: (input: {
    statementRowId: string;
    ledgerAccount: string;
  }) => Promise<void> | void;
  onApproveTransfer?: (input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) => Promise<void> | void;
  onRevertTransfer?: (input: { statementRowId: string }) => Promise<void> | void;
}) {
  const [ledgerAccount, setLedgerAccount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const balancingAmount = invertAmount(entry.sourceAmount);
  const approvalBlocked = ledgerStatus === "invalid";
  const isTransfer = entry.kind === "transfer";
  const linkedRow = entry.linkedStatementRow;
  const isNewAccount =
    ledgerAccount.trim().length > 0 && !knownAccounts.includes(ledgerAccount.trim());

  useEffect(() => {
    if (entry.suggestedLedgerAccount) {
      setLedgerAccount(entry.suggestedLedgerAccount);
    }
  }, [entry.statementRowId, entry.suggestedLedgerAccount]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (approvalBlocked) return;

    setIsSubmitting(true);
    try {
      await onApprove({
        statementRowId: entry.statementRowId,
        ledgerAccount: ledgerAccount.trim(),
      });
      setLedgerAccount("");
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

  return (
    <article className="suggested-entry-card">
      <div>
        <div className="suggested-entry-heading">
          <p className="eyebrow">{isTransfer ? "Transfer Match" : "Entry Preview"}</p>
          {entry.pendingAtImport ? (
            <span className="pending-at-import-badge">Pending at import</span>
          ) : null}
        </div>
        <h3>{entry.description}</h3>
        <p>{entry.postedDate}</p>
        {entry.suggestedLedgerAccount ? (
          <p className="rule-suggestion">
            {entry.aiSuggestion ? "AI suggestion" : "Rule suggestion"}:{" "}
            {entry.suggestedLedgerAccount}
          </p>
        ) : null}
        {entry.aiSuggestion ? (
          <div className="ai-suggestion">
            <p>{entry.aiSuggestion.explanation || "Adapter returned a suggestion."}</p>
            {typeof entry.aiSuggestion.confidence === "number" ? (
              <p>Confidence: {Math.round(entry.aiSuggestion.confidence * 100)}%</p>
            ) : null}
            {entry.aiSuggestion.needsHumanAttention ? (
              <p>Needs human attention</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="journal-detail">
        <p className="eyebrow">Journal Detail</p>
        {isTransfer ? (
          <dl>
            <div>
              <dt>{entry.sourceAccount}</dt>
              <dd>
                {entry.sourceAmount} USD - {entry.description}
              </dd>
            </div>
            <div>
              <dt>{linkedRow?.sourceAccount || "Matched Source Account"}</dt>
              <dd>
                {linkedRow
                  ? `${linkedRow.sourceAmount} USD - ${linkedRow.description}`
                  : "Awaiting matching row"}
              </dd>
            </div>
          </dl>
        ) : (
          <dl>
            <div>
              <dt>{entry.sourceAccount}</dt>
              <dd>{entry.sourceAmount} USD</dd>
            </div>
            <div>
              <dt>{ledgerAccount || "Selected Ledger Account"}</dt>
              <dd>{balancingAmount} USD</dd>
            </div>
          </dl>
        )}
      </div>

      {isTransfer ? (
        <div>
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
      ) : (
        <form className="workspace-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="ledger-account-input">Ledger Account</label>
            <AccountCombobox
              id="ledger-account-input"
              value={ledgerAccount}
              onChange={setLedgerAccount}
              knownAccounts={knownAccounts}
              placeholder="Expenses:Software"
            />
            {isNewAccount ? (
              <span className="new-account-hint">New account — will be created on approval</span>
            ) : null}
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={approvalBlocked || !ledgerAccount.trim() || isSubmitting}
          >
            {approvalBlocked ? "Approval blocked" : "Approve Entry"}
          </button>
        </form>
      )}
    </article>
  );
}

function invertAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0.00";
  }
  return (-parsed).toFixed(2);
}
