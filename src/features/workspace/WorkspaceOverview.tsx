import type {
  AiAdapterConfig,
  AiContextDisclosure,
  CategorizationRule,
  CsvSourceMappingInput,
  BrokenProvenance,
  MvpReports,
  SnapshotSummary,
  SuggestedEntry,
  WorkspaceSummary,
} from "../../lib/workspace/types";
import type { WorkspaceScreen } from "../../components/AppShell";
import { AiAdapterPanel } from "./AiAdapterPanel";
import {
  CategorizationRulesPanel,
  type CategorizationRuleOffer,
} from "./CategorizationRulesPanel";
import { CsvImportSetup } from "./CsvImportSetup";
import { MvpReportsPanel } from "./MvpReportsPanel";
import { SourceAccountSetup } from "./SourceAccountSetup";
import type { SourceAccountKind } from "../../lib/workspace/types";
import { SuggestedEntryReview } from "./SuggestedEntryReview";

type WorkspaceOverviewProps = {
  activeScreen?: WorkspaceScreen;
  workspace: WorkspaceSummary;
  suggestedEntries?: SuggestedEntry[];
  brokenProvenance?: BrokenProvenance[];
  categorizationRules?: CategorizationRule[];
  categorizationRuleOffer?: CategorizationRuleOffer | null;
  aiAdapterConfig?: AiAdapterConfig;
  aiContextDisclosure?: AiContextDisclosure;
  reports?: MvpReports | null;
  snapshots?: SnapshotSummary[];
  onReveal: () => void;
  onOpenAnother: () => void;
  onValidate?: () => void | Promise<void>;
  onRestoreSnapshot?: (snapshotId: string) => Promise<void> | void;
  onAddSourceAccount?: (input: {
    kind: SourceAccountKind;
    name: string;
    openingBalance: string | null;
  }) => Promise<void> | void;
  onImportStatementRows?: (input: {
    sourceAccount: string;
    sourceFileName: string;
    csvContents: string;
    mapping: CsvSourceMappingInput;
  }) => Promise<void> | void;
  onApproveSuggestedEntry?: (input: {
    statementRowId: string;
    ledgerAccount: string;
  }) => Promise<void> | void;
  onApproveTransferEntry?: (input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) => Promise<void> | void;
  onCreateCategorizationRule?: (input: CategorizationRuleOffer) => Promise<void> | void;
  onUpdateCategorizationRule?: (
    input: CategorizationRuleOffer & { id: string },
  ) => Promise<void> | void;
  onDismissCategorizationRuleOffer?: () => void;
  onConfigureAiAdapter?: (command: string | null) => Promise<void> | void;
  onLoadReports?: (input: {
    periodStart: string;
    periodEnd: string;
  }) => Promise<void> | void;
  error?: string | null;
};

const workspaceFiles = [
  "main.bean",
  "accounts.bean",
  "opening-balances.bean",
  ".diurnum/workspace.json",
  ".diurnum/diurnum.sqlite",
];

export function WorkspaceOverview({
  activeScreen = "ledger",
  workspace,
  suggestedEntries = [],
  brokenProvenance = [],
  categorizationRules = [],
  categorizationRuleOffer = null,
  aiAdapterConfig = { command: null },
  aiContextDisclosure = { adapterConfigured: false, fieldsSent: [] },
  reports = null,
  snapshots = [],
  onReveal,
  onOpenAnother,
  onValidate,
  onRestoreSnapshot,
  onAddSourceAccount,
  onImportStatementRows,
  onApproveSuggestedEntry,
  onApproveTransferEntry,
  onCreateCategorizationRule,
  onUpdateCategorizationRule,
  onDismissCategorizationRuleOffer,
  onConfigureAiAdapter,
  onLoadReports,
  error,
}: WorkspaceOverviewProps) {
  const showLedger = activeScreen === "ledger";
  const showInbox = activeScreen === "inbox";
  const showReports = activeScreen === "reports";
  const showDocuments = activeScreen === "documents";
  const showImport = activeScreen === "import";
  const showGit = activeScreen === "git";
  const showSettings = activeScreen === "settings";
  const showLedgerSafety =
    showLedger || showInbox || showReports || showImport || showSettings;

  return (
    <section className="overview" aria-labelledby="workspace-overview-title">
      <div className="overview-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="workspace-overview-title">{workspace.businessName}</h1>
        </div>
        <span className={`status-pill status-pill--${workspace.ledgerStatus}`}>
          Ledger {workspace.ledgerStatus}
        </span>
      </div>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      {workspace.ledgerStatus === "invalid" && showLedgerSafety ? (
        <section className="ledger-alert" role="alert" aria-labelledby="ledger-alert-title">
          <div>
            <p className="eyebrow">Invalid Ledger State</p>
            <h2 id="ledger-alert-title">Ledger Validation needs attention</h2>
            <p>
              Diurnum found validation errors in the Workspace ledger. You can
              inspect these files and edit them externally, but unsafe accounting
              actions stay blocked until validation passes.
            </p>
          </div>
          <ul>
            {workspace.ledgerValidation.errors.map((validationError) => (
              <li key={validationError}>{validationError}</li>
            ))}
          </ul>
          <div className="blocked-actions" aria-label="Blocked unsafe actions">
            <button className="secondary-button" type="button" disabled>
              Approval blocked
            </button>
            <button className="secondary-button" type="button" disabled>
              MVP Reports blocked
            </button>
          </div>
        </section>
      ) : null}

      {snapshots.length > 0 && (showLedger || showSettings) ? (
        <section
          className="snapshot-panel"
          role={workspace.ledgerStatus === "invalid" ? "dialog" : undefined}
          aria-labelledby={
            workspace.ledgerStatus === "invalid"
              ? "recovery-snapshots-title"
              : "snapshots-title"
          }
        >
          <div>
            <p className="eyebrow">
              {workspace.ledgerStatus === "invalid" ? "Recovery" : "Snapshots"}
            </p>
            <h2
              id={
                workspace.ledgerStatus === "invalid"
                  ? "recovery-snapshots-title"
                  : "snapshots-title"
              }
            >
              {workspace.ledgerStatus === "invalid"
                ? "Restore from a recent Snapshot"
                : "Recent Snapshots"}
            </h2>
            <p>
              Diurnum keeps restorable copies of Workspace ledger files before
              risky mutations and on the first valid open each day.
            </p>
          </div>
          <ul>
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <div>
                  <strong>{formatSnapshotReason(snapshot.reason)}</strong>
                  <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                  <small>{snapshot.affectedFiles.join(", ")}</small>
                </div>
                {onRestoreSnapshot ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onRestoreSnapshot(snapshot.id)}
                  >
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : workspace.ledgerStatus === "invalid" && (showLedger || showSettings) ? (
        <section
          className="snapshot-panel snapshot-panel--empty"
          role="dialog"
          aria-labelledby="recovery-snapshots-title"
        >
          <p className="eyebrow">Recovery</p>
          <h2 id="recovery-snapshots-title">No Snapshots available</h2>
          <p>
            Diurnum did not find a restorable Snapshot for this Workspace yet.
          </p>
        </section>
      ) : null}

      {brokenProvenance.length > 0 && showLedger ? (
        <section
          className="provenance-alert"
          role="status"
          aria-labelledby="provenance-alert-title"
        >
          <div>
            <p className="eyebrow">Broken Provenance</p>
            <h2 id="provenance-alert-title">Diurnum metadata needs attention</h2>
            <p>
              Ledger validation still passes, but Diurnum cannot match some
              Accounted Statement Rows back to their approved ledger entries.
            </p>
          </div>
          <ul>
            {brokenProvenance.map((item) => (
              <li key={item.statementRowId}>
                {item.statementRowId}: {item.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showLedger || showSettings ? (
        <dl className="detail-grid">
          <div>
            <dt>Base currency</dt>
            <dd>{workspace.baseCurrency}</dd>
          </div>
          <div>
            <dt>Books start date</dt>
            <dd>{workspace.booksStartDate}</dd>
          </div>
          <div className="wide">
            <dt>Workspace path</dt>
            <dd>{workspace.rootPath}</dd>
          </div>
        </dl>
      ) : null}

      {showLedger ? (
        <section className="file-list" aria-labelledby="workspace-files-title">
          <h2 id="workspace-files-title">Workspace files</h2>
          <ul>
            {workspaceFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {showSettings && onAddSourceAccount ? (
        <SourceAccountSetup onAddSourceAccount={onAddSourceAccount} />
      ) : null}

      {showImport && onImportStatementRows ? (
        <CsvImportSetup onImportStatementRows={onImportStatementRows} />
      ) : null}

      {showSettings && onConfigureAiAdapter ? (
        <AiAdapterPanel
          config={aiAdapterConfig}
          disclosure={aiContextDisclosure}
          onConfigure={onConfigureAiAdapter}
        />
      ) : null}

      {showInbox && onApproveSuggestedEntry ? (
        <SuggestedEntryReview
          suggestedEntries={suggestedEntries}
          ledgerStatus={workspace.ledgerStatus}
          onApprove={onApproveSuggestedEntry}
          onApproveTransfer={onApproveTransferEntry}
        />
      ) : null}

      {showSettings ? (
        <CategorizationRulesPanel
          rules={categorizationRules}
          offer={categorizationRuleOffer}
          onCreateRule={onCreateCategorizationRule}
          onUpdateRule={onUpdateCategorizationRule}
          onDismissOffer={onDismissCategorizationRuleOffer}
        />
      ) : null}

      {showReports && onLoadReports ? (
        <MvpReportsPanel
          ledgerStatus={workspace.ledgerStatus}
          reports={reports}
          defaultPeriodStart={workspace.booksStartDate}
          defaultPeriodEnd={defaultReportEndDate(workspace.booksStartDate)}
          onLoadReports={onLoadReports}
        />
      ) : null}

      {showDocuments ? (
        <section className="file-list" aria-labelledby="documents-title">
          <h2 id="documents-title">Documents</h2>
          <ul>
            <li>Workspace folder: {workspace.rootPath}</li>
            {workspaceFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {showGit ? (
        <section className="file-list" aria-labelledby="git-title">
          <h2 id="git-title">Git</h2>
          <ul>
            <li>Workspace folder: {workspace.rootPath}</li>
            <li>Ledger files are ready for external Git workflows.</li>
          </ul>
        </section>
      ) : null}

      {showLedger || showSettings ? (
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onReveal}>
            Reveal Workspace
          </button>
          {onValidate ? (
            <button className="secondary-button" type="button" onClick={onValidate}>
              Recheck Ledger
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={onOpenAnother}>
            Open Another Workspace
          </button>
        </div>
      ) : null}
    </section>
  );
}

function defaultReportEndDate(booksStartDate: string): string {
  const [year, month] = booksStartDate.split("-");
  if (!year || !month) return booksStartDate;
  const end = new Date(Number(year), Number(month), 0);
  return end.toISOString().slice(0, 10);
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
