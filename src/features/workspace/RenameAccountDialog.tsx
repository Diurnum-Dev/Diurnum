import { useEffect, useState } from "react";
import type {
  AccountRenamePreview,
  RenameAccountInput,
} from "../../lib/workspace/types";
import { AccountCombobox } from "./AccountCombobox";

type RenameAccountDialogProps = {
  workspaceRootPath: string;
  knownAccounts: string[];
  onPreview: (input: RenameAccountInput) => Promise<AccountRenamePreview>;
  onRename: (input: RenameAccountInput) => Promise<void>;
  onClose: () => void;
};

export function RenameAccountDialog({
  workspaceRootPath,
  knownAccounts,
  onPreview,
  onRename,
  onClose,
}: RenameAccountDialogProps) {
  const [oldAccount, setOldAccount] = useState(knownAccounts[0] ?? "");
  const [newAccount, setNewAccount] = useState("");
  const [merge, setMerge] = useState(false);
  const [preview, setPreview] = useState<AccountRenamePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!oldAccount.trim() || !newAccount.trim() || oldAccount.trim() === newAccount.trim()) {
      setPreview(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void onPreview({
      workspaceRootPath,
      oldAccount: oldAccount.trim(),
      newAccount: newAccount.trim(),
      merge,
    })
      .then((nextPreview) => {
        if (!cancelled) setPreview(nextPreview);
      })
      .catch((caught) => {
        if (!cancelled) {
          setPreview(null);
          setError(messageFromError(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [merge, newAccount, oldAccount, onPreview, workspaceRootPath]);

  const destinationExists =
    preview?.destinationExists === true ||
    error?.toLowerCase().includes("account already exists") === true;
  const canConfirm = preview !== null && !loading && (!destinationExists || merge) && !confirming;

  async function handleSubmit() {
    if (!canConfirm) return;
    setConfirming(true);
    setError(null);
    try {
      await onRename({
        workspaceRootPath,
        oldAccount: oldAccount.trim(),
        newAccount: newAccount.trim(),
        merge,
      });
      onClose();
    } catch (caught) {
      setError(messageFromError(caught));
      setConfirming(false);
    }
  }

  return (
    <div className="rename-account-overlay" role="presentation" onClick={onClose}>
      <section
        className="rename-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-account-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rename-account-header">
          <div>
            <p className="eyebrow">Workspace action</p>
            <h1 id="rename-account-title">Rename Ledger Account</h1>
            <p className="settings-copy">
              Update every exact account reference in the Workspace. Manual Ledger Editor saves do not rename accounts.
            </p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose} aria-label="Close rename dialog">
            ×
          </button>
        </div>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        <form onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
          <div className="rename-account-fields">
            <label>
              Old account
              <AccountCombobox
                id="rename-old-account"
                value={oldAccount}
                onChange={setOldAccount}
                knownAccounts={knownAccounts}
                placeholder="Choose an account"
              />
            </label>
            <label>
              New account full path
              <input
                id="rename-new-account"
                value={newAccount}
                onChange={(event) => setNewAccount(event.target.value)}
                placeholder="Expenses:Subscriptions:Software"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="rename-account-preview" aria-live="polite">
            <div className="section-heading">
              <p className="eyebrow">Reviewable Diff</p>
              <h2>References to update</h2>
            </div>
            {loading ? <p className="settings-note">Loading preview…</p> : null}
            {!loading && preview && preview.changes.length === 0 ? (
              <p className="settings-note">No references found in the Workspace.</p>
            ) : null}
            {!loading && preview ? (
              <div className="rename-account-changes">
                {preview.changes.map((change) => (
                  <article className="rename-account-file" key={change.relativePath}>
                    <strong>{change.relativePath}</strong>
                    {change.lines.length > 0 ? (
                      <div className="rename-account-lines">
                        {change.lines.map((line) => (
                          <div className="rename-account-line" key={`${change.relativePath}:${line.lineNumber}`}>
                            <span className="rename-account-line-number">{line.lineNumber}</span>
                            <code className="rename-account-before">− {line.before}</code>
                            <code className="rename-account-after">+ {line.after}</code>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="settings-note">Related Workspace records will be updated.</p>
                    )}
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          {destinationExists ? (
            <div className="rename-account-merge-warning" role="alert">
              <strong>{newAccount.trim()} already exists.</strong>
              <span>Choose Merge to consolidate the two accounts.</span>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={merge}
                  onChange={(event) => setMerge(event.target.checked)}
                />
                <span>Merge destination account</span>
              </label>
            </div>
          ) : null}

          <div className="action-row">
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={!canConfirm}>
              {confirming ? "Renaming…" : "Rename account"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function messageFromError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Diurnum could not preview or rename that account.";
}
