import { useState } from "react";
import type { FormEvent } from "react";
import type { CategorizationRule } from "../../lib/workspace/types";

export type CategorizationRuleOffer = {
  sourceAccount: string;
  matchText: string;
  ledgerAccount: string;
};

type CategorizationRulesPanelProps = {
  workspaceRootPath: string;
  rules: CategorizationRule[];
  offer?: CategorizationRuleOffer | null;
  onCreateRule?: (input: CategorizationRuleOffer) => Promise<void> | void;
  onUpdateRule?: (
    input: CategorizationRuleOffer & { id: string },
  ) => Promise<void> | void;
  onDisableRule?: (input: { workspaceRootPath: string; id: string }) => Promise<void> | void;
  onEnableRule?: (input: { workspaceRootPath: string; id: string }) => Promise<void> | void;
  onDeleteRule?: (input: { workspaceRootPath: string; id: string }) => Promise<void> | void;
  onDismissOffer?: () => void;
};

export function CategorizationRulesPanel({
  workspaceRootPath,
  rules,
  offer,
  onCreateRule,
  onUpdateRule,
  onDisableRule,
  onEnableRule,
  onDeleteRule,
  onDismissOffer,
}: CategorizationRulesPanelProps) {
  return (
    <section className="categorization-rules" aria-labelledby="categorization-rules-title">
      <div className="section-heading">
        <p className="eyebrow">Categorization Rules</p>
        <h2 id="categorization-rules-title">User-confirmed rules</h2>
      </div>

      {offer ? (
        <div className="rule-offer">
          <dl>
            <div>
              <dt>Source Account</dt>
              <dd>{offer.sourceAccount}</dd>
            </div>
            <div>
              <dt>Match Text</dt>
              <dd>{offer.matchText}</dd>
            </div>
            <div>
              <dt>Ledger Account</dt>
              <dd>{offer.ledgerAccount}</dd>
            </div>
          </dl>
          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => onCreateRule?.(offer)}
            >
              Create Rule
            </button>
            <button className="secondary-button" type="button" onClick={onDismissOffer}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {rules.length > 0 ? (
        <div className="rule-list">
          {rules.map((rule) => (
            <CategorizationRuleEditor
              key={rule.id}
              workspaceRootPath={workspaceRootPath}
              rule={rule}
              onUpdateRule={onUpdateRule}
              onDisableRule={onDisableRule}
              onEnableRule={onEnableRule}
              onDeleteRule={onDeleteRule}
            />
          ))}
        </div>
      ) : (
        <p className="empty-note">No confirmed rules yet.</p>
      )}
    </section>
  );
}

function CategorizationRuleEditor({
  rule,
  workspaceRootPath,
  onUpdateRule,
  onDisableRule,
  onEnableRule,
  onDeleteRule,
}: {
  workspaceRootPath: string;
  rule: CategorizationRule;
  onUpdateRule?: (
    input: CategorizationRuleOffer & { id: string },
  ) => Promise<void> | void;
  onDisableRule?: (input: { workspaceRootPath: string; id: string }) => Promise<void> | void;
  onEnableRule?: (input: { workspaceRootPath: string; id: string }) => Promise<void> | void;
  onDeleteRule?: (input: { workspaceRootPath: string; id: string }) => Promise<void> | void;
}) {
  const [sourceAccount, setSourceAccount] = useState(rule.sourceAccount);
  const [matchText, setMatchText] = useState(rule.matchText);
  const [ledgerAccount, setLedgerAccount] = useState(rule.ledgerAccount);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onUpdateRule) return;

    setIsSubmitting(true);
    try {
      await onUpdateRule({
        id: rule.id,
        sourceAccount: sourceAccount.trim(),
        matchText: matchText.trim(),
        ledgerAccount: ledgerAccount.trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="rule-card" onSubmit={handleSubmit}>
      <div className="rule-card-header">
        <div>
          <strong>{rule.matchText}</strong>
          <small>{rule.enabled ? "Enabled" : "Disabled"}</small>
        </div>
        <span className={`rule-status ${rule.enabled ? "enabled" : "disabled"}`}>
          {rule.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <label>
        Source Account
        <input
          value={sourceAccount}
          onChange={(event) => setSourceAccount(event.target.value)}
        />
      </label>
      <label>
        Match Text
        <input value={matchText} onChange={(event) => setMatchText(event.target.value)} />
      </label>
      <label>
        Ledger Account
        <input
          value={ledgerAccount}
          onChange={(event) => setLedgerAccount(event.target.value)}
        />
      </label>
      <div className="action-row">
        <button
          className="secondary-button"
          type="submit"
          disabled={
            isSubmitting || !sourceAccount.trim() || !matchText.trim() || !ledgerAccount.trim()
          }
        >
          Save Rule
        </button>
        {rule.enabled ? (
          <button
            className="ghost-button"
            type="button"
            onClick={() => void onDisableRule?.({ workspaceRootPath, id: rule.id })}
          >
            Disable
          </button>
        ) : (
          <button
            className="ghost-button"
            type="button"
            onClick={() => void onEnableRule?.({ workspaceRootPath, id: rule.id })}
          >
            Enable
          </button>
        )}
        <button
          className="ghost-button"
          type="button"
          onClick={() => void onDeleteRule?.({ workspaceRootPath, id: rule.id })}
        >
          Delete
        </button>
      </div>
    </form>
  );
}
