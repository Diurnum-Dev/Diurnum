import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AiAdapterPanel,
} from "./AiAdapterPanel";
import { CategorizationRulesPanel } from "./CategorizationRulesPanel";
import { SourceAccountSetup } from "./SourceAccountSetup";
import type {
  AiAdapterConfig,
  AiContextDisclosure,
  CategorizationRule,
  CloseSourceAccountInput,
  DetectedAiAdapter,
  GitIdentitySummary,
  RenameSourceAccountInput,
  SnapshotSummary,
  SourceAccountSummary,
  SourceAccountKind,
  SourceMappingUpdateInput,
  UpdateGitIdentityInput,
  UpdateSourceAccountOpeningBalanceInput,
  WorkspaceMetadataUpdateInput,
  WorkspaceSummary,
} from "../../lib/workspace/types";
import type { CategorizationRuleOffer } from "./CategorizationRulesPanel";

type SettingsPanelProps = {
  workspace: WorkspaceSummary;
  sourceAccounts: SourceAccountSummary[];
  detectedAdapters: DetectedAiAdapter[];
  gitIdentity: GitIdentitySummary;
  aiAdapterConfig: AiAdapterConfig;
  aiContextDisclosure: AiContextDisclosure;
  categorizationRules: CategorizationRule[];
  categorizationRuleOffer?: CategorizationRuleOffer | null;
  snapshots: SnapshotSummary[];
  onReveal: () => void;
  onOpenAnother: () => void;
  onUpdateWorkspaceMetadata: (input: WorkspaceMetadataUpdateInput) => Promise<void> | void;
  onAddSourceAccount: (input: {
    kind: SourceAccountKind;
    name: string;
    openingBalance: string | null;
  }) => Promise<void> | void;
  onRenameSourceAccount: (input: RenameSourceAccountInput) => Promise<void> | void;
  onCloseSourceAccount: (input: CloseSourceAccountInput) => Promise<void> | void;
  onUpdateSourceAccountOpeningBalance: (
    input: UpdateSourceAccountOpeningBalanceInput,
  ) => Promise<void> | void;
  onSaveSourceMapping: (input: SourceMappingUpdateInput) => Promise<void> | void;
  onConfigureAiAdapter: (command: string | null) => Promise<void> | void;
  onTestAiAdapter: () => Promise<void> | void;
  onUpdateGitIdentity: (input: UpdateGitIdentityInput) => Promise<void> | void;
  onRestoreSnapshot: (snapshotId: string) => Promise<void> | void;
  onCreateCategorizationRule?: (input: CategorizationRuleOffer) => Promise<void> | void;
  onUpdateCategorizationRule?: (
    input: CategorizationRuleOffer & { id: string },
  ) => Promise<void> | void;
  onDisableCategorizationRule?: (
    input: { workspaceRootPath: string; id: string },
  ) => Promise<void> | void;
  onEnableCategorizationRule?: (
    input: { workspaceRootPath: string; id: string },
  ) => Promise<void> | void;
  onDeleteCategorizationRule?: (
    input: { workspaceRootPath: string; id: string },
  ) => Promise<void> | void;
  onDismissCategorizationRuleOffer?: () => void;
  onError?: (message: string | null) => void;
};

type SettingsSection =
  | "ai-adapter"
  | "updates"
  | "workspace"
  | "source-accounts"
  | "categorization-rules"
  | "git-identity"
  | "snapshots"
  | "privacy";

const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "ai-adapter", label: "AI Adapter" },
  { id: "updates", label: "Updates" },
  { id: "workspace", label: "Workspace" },
  { id: "source-accounts", label: "Source Accounts" },
  { id: "categorization-rules", label: "Categorization Rules" },
  { id: "git-identity", label: "Git Identity" },
  { id: "snapshots", label: "Snapshots" },
  { id: "privacy", label: "Privacy" },
];

const SETTINGS_PREFS_KEY = "diurnum.settings.v1";

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    workspace,
    sourceAccounts,
    detectedAdapters,
    gitIdentity,
    aiAdapterConfig,
    aiContextDisclosure,
    categorizationRules,
    categorizationRuleOffer,
    snapshots,
    onReveal,
    onOpenAnother,
    onUpdateWorkspaceMetadata,
    onAddSourceAccount,
    onRenameSourceAccount,
    onCloseSourceAccount,
    onUpdateSourceAccountOpeningBalance,
    onSaveSourceMapping,
    onConfigureAiAdapter,
    onTestAiAdapter,
    onUpdateGitIdentity,
    onRestoreSnapshot,
    onCreateCategorizationRule,
    onUpdateCategorizationRule,
    onDisableCategorizationRule,
    onEnableCategorizationRule,
    onDeleteCategorizationRule,
    onDismissCategorizationRuleOffer,
    onError,
  } = props;

  const [activeSection, setActiveSection] = useState<SettingsSection>("ai-adapter");
  const [updatePrefs, setUpdatePrefs] = useState(loadUpdatePrefs);
  const [workspaceName, setWorkspaceName] = useState(workspace.businessName);
  const [booksStartDate, setBooksStartDate] = useState(workspace.booksStartDate);
  const [gitName, setGitName] = useState(gitIdentity.localName ?? "");
  const [gitEmail, setGitEmail] = useState(gitIdentity.localEmail ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [privacyCrashReporting, setPrivacyCrashReporting] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [customAdapterCommand, setCustomAdapterCommand] = useState(
    aiAdapterConfig.command ?? "",
  );
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    setWorkspaceName(workspace.businessName);
    setBooksStartDate(workspace.booksStartDate);
  }, [workspace.businessName, workspace.booksStartDate]);

  useEffect(() => {
    setGitName(gitIdentity.localName ?? "");
    setGitEmail(gitIdentity.localEmail ?? "");
  }, [gitIdentity.localName, gitIdentity.localEmail]);

  useEffect(() => {
    setCustomAdapterCommand(aiAdapterConfig.command ?? "");
  }, [aiAdapterConfig.command]);

  useEffect(() => {
    saveUpdatePrefs(updatePrefs);
  }, [updatePrefs]);

  async function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    try {
      await onUpdateWorkspaceMetadata({
        workspaceRootPath: workspace.rootPath,
        businessName: workspaceName.trim(),
        booksStartDate: booksStartDate.trim(),
      });
      setStatusNote("Workspace metadata updated.");
    } catch (error) {
      setLocalError(messageFromError(error));
    }
  }

  async function handleGitIdentitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    try {
      await onUpdateGitIdentity({
        workspaceRootPath: workspace.rootPath,
        localName: gitName.trim() || null,
        localEmail: gitEmail.trim() || null,
      });
      setStatusNote("Git identity saved.");
    } catch (error) {
      setLocalError(messageFromError(error));
    }
  }

  async function handleAdapterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    try {
      await onConfigureAiAdapter(customAdapterCommand.trim() || null);
      setStatusNote("AI adapter updated.");
    } catch (error) {
      setLocalError(messageFromError(error));
    }
  }

  async function handleTestAdapter() {
    setLocalError(null);
    try {
      await onTestAiAdapter();
      setTestResult("Adapter returned a structured response.");
    } catch (error) {
      setTestResult(null);
      setLocalError(messageFromError(error));
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="settings-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 id="settings-title">Workspace configuration</h1>
        </div>
        <div className="settings-header-actions">
          <button className="secondary-button" type="button" onClick={onOpenAnother}>
            Open Another Workspace
          </button>
          <button className="primary-button" type="button" onClick={onReveal}>
            Show in Finder
          </button>
        </div>
      </div>

      {localError ? (
        <div className="error-banner" role="alert">
          {localError}
        </div>
      ) : null}

      {statusNote ? <p className="settings-note">{statusNote}</p> : null}

      <div className="settings-layout">
        <aside className="settings-subnav" aria-label="Settings sections">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={section.id === activeSection ? "active" : ""}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </aside>

        <div className="settings-content">
          {activeSection === "ai-adapter" ? (
            <section className="settings-section" aria-labelledby="ai-adapter-title">
              <div className="section-heading">
                <p className="eyebrow">AI Adapter</p>
                <h2 id="ai-adapter-title">Optional local suggestions</h2>
                <p className="settings-copy">
                  Diurnum auto-detects local adapters on launch and only sends curated
                  ledger context when you ask it to.
                </p>
              </div>

              <div className="adapter-list">
                {detectedAdapters.map((adapter) => (
                  <label className={`adapter-row ${adapter.available ? "" : "disabled"}`} key={adapter.command}>
                    <input
                      type="radio"
                      name="adapter"
                      checked={customAdapterCommand.trim() === adapter.command}
                      disabled={!adapter.available}
                      onChange={() => setCustomAdapterCommand(adapter.command)}
                    />
                    <span className="adapter-meta">
                      <strong>{adapter.name}</strong>
                      <small>{adapter.commandPath ?? "Not found on PATH"}</small>
                    </span>
                    <span className={`adapter-status ${adapter.available ? "available" : "missing"}`}>
                      {adapter.available ? "Available" : "Not found"}
                    </span>
                  </label>
                ))}
              </div>

              <AiAdapterPanel
                config={aiAdapterConfig}
                disclosure={aiContextDisclosure}
                onConfigure={onConfigureAiAdapter}
                onTest={handleTestAdapter}
                detectedAdapters={detectedAdapters}
              />

              {testResult ? <p className="settings-note">{testResult}</p> : null}
            </section>
          ) : null}

          {activeSection === "updates" ? (
            <section className="settings-section" aria-labelledby="updates-title">
              <div className="section-heading">
                <p className="eyebrow">Updates</p>
                <h2 id="updates-title">Update preferences</h2>
              </div>
              <dl className="settings-dl">
                <div>
                  <dt>Current version</dt>
                  <dd>{APP_VERSION}</dd>
                </div>
                <div>
                  <dt>Check for updates on launch</dt>
                  <dd>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={updatePrefs.checkOnLaunch}
                        onChange={(event) =>
                          setUpdatePrefs({ ...updatePrefs, checkOnLaunch: event.target.checked })
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  </dd>
                </div>
              </dl>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setUpdatePrefs({
                      ...updatePrefs,
                      lastCheckedAt: new Date().toISOString(),
                    })
                  }
                >
                  Check now
                </button>
                {updatePrefs.lastCheckedAt ? (
                  <span className="settings-note">
                    Last checked {new Date(updatePrefs.lastCheckedAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeSection === "workspace" ? (
            <section className="settings-section" aria-labelledby="workspace-settings-title">
              <div className="section-heading">
                <p className="eyebrow">Workspace</p>
                <h2 id="workspace-settings-title">Workspace metadata</h2>
              </div>

              <form className="workspace-form" onSubmit={handleWorkspaceSubmit}>
                <label>
                  Workspace display name
                  <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
                </label>
                <label>
                  Books start date
                  <input
                    type="date"
                    value={booksStartDate}
                    onChange={(event) => setBooksStartDate(event.target.value)}
                  />
                </label>
                <label>
                  Base currency
                  <input value={workspace.baseCurrency} disabled />
                </label>
                <label>
                  Workspace path
                  <input value={workspace.rootPath} disabled />
                </label>
                <div className="action-row">
                  <button className="primary-button" type="submit">
                    Save Workspace
                  </button>
                  <button className="secondary-button" type="button" onClick={onReveal}>
                    Show in Finder
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {activeSection === "source-accounts" ? (
            <section className="settings-section" aria-labelledby="source-accounts-title">
              <div className="section-heading">
                <p className="eyebrow">Source Accounts</p>
                <h2 id="source-accounts-title">Source Accounts and source mappings</h2>
              </div>

              <div className="settings-stack">
                <SourceAccountSetup onAddSourceAccount={onAddSourceAccount} />

                <div className="source-account-list">
                  {sourceAccounts.map((account) => (
                    <SourceAccountEditor
                      key={account.accountName}
                      workspaceRootPath={workspace.rootPath}
                      account={account}
                      onRename={onRenameSourceAccount}
                      onClose={onCloseSourceAccount}
                      onUpdateOpeningBalance={onUpdateSourceAccountOpeningBalance}
                      onSaveMapping={onSaveSourceMapping}
                    />
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "categorization-rules" ? (
            <section className="settings-section" aria-labelledby="categorization-rules-title">
              <CategorizationRulesPanel
                workspaceRootPath={workspace.rootPath}
                rules={categorizationRules}
                offer={categorizationRuleOffer}
                onCreateRule={onCreateCategorizationRule}
                onUpdateRule={onUpdateCategorizationRule}
                onDisableRule={onDisableCategorizationRule}
                onEnableRule={onEnableCategorizationRule}
                onDeleteRule={onDeleteCategorizationRule}
                onDismissOffer={onDismissCategorizationRuleOffer}
              />
            </section>
          ) : null}

          {activeSection === "git-identity" ? (
            <section className="settings-section" aria-labelledby="git-identity-title">
              <div className="section-heading">
                <p className="eyebrow">Git Identity</p>
                <h2 id="git-identity-title">Local identity for commits</h2>
              </div>
              {!gitIdentity.isRepository ? (
                <p className="empty-note">Git Identity appears only when the Workspace is a git repository.</p>
              ) : (
                <form className="workspace-form" onSubmit={handleGitIdentitySubmit}>
                  <label>
                    Local name
                    <input value={gitName} onChange={(event) => setGitName(event.target.value)} />
                  </label>
                  <label>
                    Local email
                    <input value={gitEmail} onChange={(event) => setGitEmail(event.target.value)} />
                  </label>
                  {gitIdentity.warning ? <p className="settings-warning">{gitIdentity.warning}</p> : null}
                  <div className="action-row">
                    <button className="primary-button" type="submit">
                      Save Identity
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : null}

          {activeSection === "snapshots" ? (
            <section className="settings-section" aria-labelledby="snapshots-title">
              <div className="section-heading">
                <p className="eyebrow">Snapshots</p>
                <h2 id="snapshots-title">Recent snapshots</h2>
              </div>
              {snapshots.length > 0 ? (
                <div className="snapshot-list">
                  {snapshots.slice(0, 10).map((snapshot) => (
                    <article className="snapshot-item" key={snapshot.id}>
                      <div>
                        <strong>{formatSnapshotReason(snapshot.reason)}</strong>
                        <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                        <small>{snapshot.affectedFiles.join(", ")}</small>
                      </div>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onRestoreSnapshot(snapshot.id)}
                      >
                        Restore
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No snapshots available yet.</p>
              )}
            </section>
          ) : null}

          {activeSection === "privacy" ? (
            <section className="settings-section" aria-labelledby="privacy-title">
              <div className="section-heading">
                <p className="eyebrow">Privacy</p>
                <h2 id="privacy-title">Crash reporting and policy</h2>
              </div>
              <p className="settings-copy">
                Diurnum keeps accounting data local. Crash reporting stays off by default.
              </p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={privacyCrashReporting}
                  onChange={(event) => setPrivacyCrashReporting(event.target.checked)}
                />
                <span>Enable crash reporting</span>
              </label>
              <p className="settings-note">Crash reporting is disabled until you turn it on.</p>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SourceAccountEditor({
  workspaceRootPath,
  account,
  onRename,
  onClose,
  onUpdateOpeningBalance,
  onSaveMapping,
}: {
  workspaceRootPath: string;
  account: SourceAccountSummary;
  onRename: (input: RenameSourceAccountInput) => Promise<void> | void;
  onClose: (input: CloseSourceAccountInput) => Promise<void> | void;
  onUpdateOpeningBalance: (input: UpdateSourceAccountOpeningBalanceInput) => Promise<void> | void;
  onSaveMapping: (input: SourceMappingUpdateInput) => Promise<void> | void;
}) {
  const [name, setName] = useState(account.accountName.split(":").pop() ?? account.accountName);
  const [openingBalance, setOpeningBalance] = useState(account.openingBalance ?? "");
  const [mapping, setMapping] = useState(account.sourceMapping);

  useEffect(() => {
    setName(account.accountName.split(":").pop() ?? account.accountName);
    setOpeningBalance(account.openingBalance ?? "");
    setMapping(account.sourceMapping);
  }, [account]);

  return (
    <article className="source-account-card">
      <div className="source-account-card-header">
        <div>
          <strong>{account.accountName}</strong>
          <small>
            {account.kind} · {account.status} · {account.currency}
          </small>
        </div>
        <span className="pill-count">{account.documentsFolder}</span>
      </div>

      <div className="source-account-grid">
        <label>
          Display name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Opening balance
          <input
            inputMode="decimal"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
          />
        </label>
      </div>

      <div className="action-row">
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            void onRename({
              workspaceRootPath,
              sourceAccount: account.accountName,
              newName: name,
              openingBalance: openingBalance.trim() || null,
            })
          }
        >
          Save
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            void onUpdateOpeningBalance({
              workspaceRootPath,
              sourceAccount: account.accountName,
              openingBalance: openingBalance.trim() || null,
            })
          }
        >
          Update balance
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => void onClose({ workspaceRootPath, sourceAccount: account.accountName })}
        >
          Close
        </button>
      </div>

      <div className="source-mapping-editor">
        <p className="eyebrow">Source mapping</p>
        {mapping ? (
          <SourceMappingEditor
            workspaceRootPath={workspaceRootPath}
            accountName={account.accountName}
            mapping={mapping}
            onSave={onSaveMapping}
          />
        ) : (
          <p className="empty-note">No saved mapping yet.</p>
        )}
      </div>
    </article>
  );
}

function SourceMappingEditor({
  workspaceRootPath,
  accountName,
  mapping,
  onSave,
}: {
  workspaceRootPath: string;
  accountName: string;
  mapping: NonNullable<SourceAccountSummary["sourceMapping"]>;
  onSave: (input: SourceMappingUpdateInput) => Promise<void> | void;
}) {
  const [postedDateColumn, setPostedDateColumn] = useState(mapping.postedDateColumn);
  const [descriptionColumn, setDescriptionColumn] = useState(mapping.descriptionColumn);
  const [amountColumn, setAmountColumn] = useState(mapping.amountColumn ?? "");
  const [debitColumn, setDebitColumn] = useState(mapping.debitColumn ?? "");
  const [creditColumn, setCreditColumn] = useState(mapping.creditColumn ?? "");
  const [transactionTypeColumn, setTransactionTypeColumn] = useState(
    mapping.transactionTypeColumn ?? "",
  );
  const [debitTypeValue, setDebitTypeValue] = useState(mapping.debitTypeValue ?? "Debit");
  const [statusColumn, setStatusColumn] = useState(mapping.statusColumn ?? "");
  const [memoColumn, setMemoColumn] = useState(mapping.memoColumn ?? "");
  const [payeeColumn, setPayeeColumn] = useState(mapping.payeeColumn ?? "");

  return (
    <div className="source-mapping-grid">
      <label>
        Posted date
        <input value={postedDateColumn} onChange={(event) => setPostedDateColumn(event.target.value)} />
      </label>
      <label>
        Description
        <input value={descriptionColumn} onChange={(event) => setDescriptionColumn(event.target.value)} />
      </label>
      <label>
        Amount
        <input value={amountColumn} onChange={(event) => setAmountColumn(event.target.value)} />
      </label>
      <label>
        Debit
        <input value={debitColumn} onChange={(event) => setDebitColumn(event.target.value)} />
      </label>
      <label>
        Credit
        <input value={creditColumn} onChange={(event) => setCreditColumn(event.target.value)} />
      </label>
      <label>
        Transaction type
        <input
          value={transactionTypeColumn}
          onChange={(event) => setTransactionTypeColumn(event.target.value)}
        />
      </label>
      <label>
        Debit type value
        <input value={debitTypeValue} onChange={(event) => setDebitTypeValue(event.target.value)} />
      </label>
      <label>
        Status
        <input value={statusColumn} onChange={(event) => setStatusColumn(event.target.value)} />
      </label>
      <label>
        Memo
        <input value={memoColumn} onChange={(event) => setMemoColumn(event.target.value)} />
      </label>
      <label>
        Payee
        <input value={payeeColumn} onChange={(event) => setPayeeColumn(event.target.value)} />
      </label>
      <button
        className="secondary-button"
        type="button"
        onClick={() =>
          void onSave({
            workspaceRootPath,
            sourceAccount: accountName,
            mapping: {
              postedDateColumn,
              descriptionColumn,
              amountColumn: amountColumn.trim() || null,
              debitColumn: debitColumn.trim() || null,
              creditColumn: creditColumn.trim() || null,
              transactionTypeColumn: transactionTypeColumn.trim() || null,
              debitTypeValue: debitTypeValue.trim() || null,
              statusColumn: statusColumn.trim() || null,
              checkNumberColumn: null,
              memoColumn: memoColumn.trim() || null,
              referenceIdColumn: null,
              payeeColumn: payeeColumn.trim() || null,
              categoryColumn: null,
              dateFormat: null,
            },
          })
        }
      >
        Save mapping
      </button>
    </div>
  );
}

function loadUpdatePrefs(): { checkOnLaunch: boolean; lastCheckedAt: string | null } {
  try {
    const raw = window.localStorage.getItem(SETTINGS_PREFS_KEY);
    if (!raw) {
      return { checkOnLaunch: false, lastCheckedAt: null };
    }
    const parsed = JSON.parse(raw) as { checkOnLaunch?: boolean; lastCheckedAt?: string | null };
    return {
      checkOnLaunch: Boolean(parsed.checkOnLaunch),
      lastCheckedAt: typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : null,
    };
  } catch {
    return { checkOnLaunch: false, lastCheckedAt: null };
  }
}

function saveUpdatePrefs(prefs: { checkOnLaunch: boolean; lastCheckedAt: string | null }) {
  window.localStorage.setItem(SETTINGS_PREFS_KEY, JSON.stringify(prefs));
}

function messageFromError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Could not update Settings.";
}

function formatSnapshotReason(reason: SnapshotSummary["reason"]): string {
  switch (reason) {
    case "approval":
      return "Approval Snapshot";
    case "daily":
      return "Daily Snapshot";
    case "preRestore":
      return "Pre-restore Snapshot";
  }
}

const APP_VERSION = "0.1.0";
