export type WorkspaceCreateInput = {
  businessName: string;
  baseCurrency: "USD";
  booksStartDate: string;
  parentDirectory: string;
};

export type SourceAccountKind = "bank" | "creditCard" | "other";

export type AddSourceAccountInput = {
  workspaceRootPath: string;
  kind: SourceAccountKind;
  name: string;
  openingBalance?: string | null;
};

export type CsvSourceMappingInput = {
  postedDateColumn: string;
  descriptionColumn: string;
  amountColumn?: string | null;
  debitColumn?: string | null;
  creditColumn?: string | null;
  /** Column whose value indicates transaction direction (e.g. "Transaction Type"). */
  transactionTypeColumn?: string | null;
  /** Value in `transactionTypeColumn` that marks a debit row (default: "Debit"). */
  debitTypeValue?: string | null;
  statusColumn?: string | null;
  checkNumberColumn?: string | null;
  memoColumn?: string | null;
  referenceIdColumn?: string | null;
  payeeColumn?: string | null;
  categoryColumn?: string | null;
  dateFormat?: string | null;
};

export type CsvImportInput = {
  workspaceRootPath: string;
  sourceAccount: string;
  sourceFileName: string;
  csvContents: string;
  mapping?: CsvSourceMappingInput | null;
};

export type CsvImportResult = {
  sourceAccount: string;
  importedCount: number;
  skippedDuplicateCount: number;
};

export type CsvImportAnalysisInput = {
  workspaceRootPath: string;
  sourceAccount?: string | null;
  sourceFileName: string;
  csvContents: string;
};

export type CsvImportColumnAnalysis = {
  header: string;
  sampleValue: string;
  diurnumField?: string | null;
  status: string;
  required: boolean;
};

export type CsvImportPreviewRow = {
  postedDate: string;
  description: string;
  signedAmount: string;
  status?: string | null;
  duplicate: boolean;
};

export type CsvImportAnalysis = {
  fileName: string;
  rowCount: number;
  delimiter: string;
  encoding: string;
  autoDetected: boolean;
  requiredFieldCount: number;
  requiredMappedCount: number;
  likelyDuplicateCount: number;
  importableRowCount: number;
  skippedRowCount: number;
  columns: CsvImportColumnAnalysis[];
  previewRows: CsvImportPreviewRow[];
  mapping: CsvSourceMappingInput;
  blockedReason?: string | null;
};

export type SuggestedEntry = {
  kind: "standard" | "transfer";
  statementRowId: string;
  postedDate: string;
  description: string;
  sourceAccount: string;
  sourceAmount: string;
  sourceFileName: string;
  importFingerprint: string;
  pendingAtImport: boolean;
  linkedStatementRow?: LinkedStatementRow | null;
  suggestedLedgerAccount?: string | null;
  categorizationRuleId?: string | null;
  aiSuggestion?: AiSuggestion | null;
};

export type AiSuggestion = {
  ledgerAccount?: string | null;
  sourceAccount?: string | null;
  sourceAmount?: string | null;
  payee?: string | null;
  narration?: string | null;
  confidence?: number | null;
  explanation?: string | null;
  needsHumanAttention: boolean;
};

export type LinkedStatementRow = {
  statementRowId: string;
  postedDate: string;
  description: string;
  sourceAccount: string;
  sourceAmount: string;
  sourceFileName: string;
  importFingerprint: string;
};

export type ApproveSuggestedEntryInput = {
  workspaceRootPath: string;
  statementRowId: string;
  ledgerAccount: string;
};

export type ApproveTransferEntryInput = {
  workspaceRootPath: string;
  statementRowId: string;
  linkedStatementRowId: string;
};

export type BrokenProvenance = {
  statementRowId: string;
  diurnumEntryId?: string | null;
  reason: string;
};

export type CategorizationRule = {
  id: string;
  sourceAccount: string;
  matchText: string;
  ledgerAccount: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCategorizationRuleInput = {
  workspaceRootPath: string;
  sourceAccount: string;
  matchText: string;
  ledgerAccount: string;
};

export type UpdateCategorizationRuleInput = CreateCategorizationRuleInput & {
  id: string;
};

export type AiAdapterConfig = {
  command?: string | null;
};

export type ConfigureAiAdapterInput = {
  workspaceRootPath: string;
  command?: string | null;
};

export type TestAiAdapterInput = {
  workspaceRootPath: string;
};

export type AiContextDisclosure = {
  adapterConfigured: boolean;
  fieldsSent: string[];
};

export type WorkspaceMetadataUpdateInput = {
  workspaceRootPath: string;
  businessName: string;
  booksStartDate: string;
};

export type SourceAccountStatus = "open" | "closed";

export type SourceAccountSummary = {
  accountName: string;
  kind: SourceAccountKind;
  status: SourceAccountStatus;
  currency: string;
  openingBalance: string | null;
  sourceMapping: CsvSourceMappingInput | null;
  documentsFolder: string;
};

export type SourceMappingSummary = {
  sourceAccount: string;
  mapping: CsvSourceMappingInput;
  updatedAt: string;
};

export type SourceMappingUpdateInput = {
  workspaceRootPath: string;
  sourceAccount: string;
  mapping: CsvSourceMappingInput;
};

export type RenameSourceAccountInput = {
  workspaceRootPath: string;
  sourceAccount: string;
  newName: string;
  openingBalance?: string | null;
};

export type CloseSourceAccountInput = {
  workspaceRootPath: string;
  sourceAccount: string;
};

export type UpdateSourceAccountOpeningBalanceInput = {
  workspaceRootPath: string;
  sourceAccount: string;
  openingBalance?: string | null;
};

export type GitIdentitySummary = {
  isRepository: boolean;
  localName: string | null;
  localEmail: string | null;
  globalName: string | null;
  globalEmail: string | null;
  warning: string | null;
};

export type UpdateGitIdentityInput = {
  workspaceRootPath: string;
  localName?: string | null;
  localEmail?: string | null;
};

export type DetectedAiAdapter = {
  name: string;
  command: string;
  available: boolean;
  commandPath?: string | null;
};

export type GitWorkingTreeEntry = {
  path: string;
  originalPath?: string | null;
  status: string;
  statusLabel: string;
  isStaged: boolean;
  isUntracked: boolean;
};

export type GitCommitSummary = {
  hash: string;
  shortHash: string;
  committedAt: string;
  summary: string;
};

export type GitCommitDiff = GitCommitSummary & {
  diff: string;
};

export type GitPanelState = {
  isRepository: boolean;
  branchName: string | null;
  uncommittedChangesCount: number;
  workingTree: GitWorkingTreeEntry[];
  recentCommits: GitCommitSummary[];
  warning: string | null;
  hookOutput: string | null;
};

export type CommitGitChangesInput = {
  workspaceRootPath: string;
  message: string;
  paths: string[];
};

export type GitCommitResult = {
  committed: boolean;
  commitHash: string | null;
  warning: string | null;
  hookOutput: string | null;
};

export type ReportsInput = {
  workspaceRootPath: string;
  periodStart: string;
  periodEnd: string;
};

export type SnapshotReason = "approval" | "daily" | "preRestore";

export type SnapshotSummary = {
  id: string;
  createdAt: string;
  reason: SnapshotReason;
  affectedFiles: string[];
  relativePath: string;
};

export type RestoreSnapshotInput = {
  workspaceRootPath: string;
  snapshotId: string;
};

export type SaveLedgerFileInput = {
  workspaceRootPath: string;
  relativePath: string;
  contents: string;
  expectedModifiedAt?: number | null;
};

export type LedgerEditorTabSession = {
  relativePath: string;
  cursor: number;
  scrollTop: number;
};

export type LedgerEditorSession = {
  openTabs: LedgerEditorTabSession[];
  activeTab: string;
  recentlyClosedTabs: LedgerEditorTabSession[];
};

export type LedgerEditorState = {
  files: string[];
  session: LedgerEditorSession;
};

export type ReadLedgerFileInput = {
  workspaceRootPath: string;
  relativePath: string;
};

export type LedgerFileSnapshot = {
  relativePath: string;
  contents: string;
  modifiedAt: number;
};

export type SaveLedgerEditorSessionInput = {
  workspaceRootPath: string;
  session: LedgerEditorSession;
};

export type PredictiveEntryCompletionSource = "rule" | "history" | "aiAdapter";

export type PredictiveEntryCompletionInput = {
  workspaceRootPath: string;
  linePrefix: string;
};

export type PredictiveEntryCompletion = {
  insertText: string;
  source: PredictiveEntryCompletionSource;
  ledgerAccount?: string | null;
  sourceAccount?: string | null;
  sourceAmount?: string | null;
};

export type DocumentsStateInput = {
  workspaceRootPath: string;
  selectedFolder?: string | null;
};

export type DocumentPreviewKind = "pdf" | "image" | "text" | "unsupported";

export type DocumentFolderSummary = {
  relativePath: string;
  name: string;
  depth: number;
  isSourceAccountFolder: boolean;
  absolutePath: string;
};

export type DocumentFileSummary = {
  relativePath: string;
  name: string;
  modifiedAt: string;
  sizeBytes: number;
  kind: DocumentPreviewKind;
  absolutePath: string;
};

export type DocumentsState = {
  folders: DocumentFolderSummary[];
  selectedFolder: string;
  files: DocumentFileSummary[];
};

export type CreateDocumentFolderInput = {
  workspaceRootPath: string;
  parentRelativePath?: string | null;
  name: string;
};

export type ImportDocumentFileInput = {
  workspaceRootPath: string;
  targetFolder: string;
  fileName: string;
  bytes: number[];
};

export type RenameDocumentEntryInput = {
  workspaceRootPath: string;
  relativePath: string;
  newName: string;
};

export type DeleteDocumentEntryInput = {
  workspaceRootPath: string;
  relativePath: string;
};

export type ReadDocumentPreviewInput = {
  workspaceRootPath: string;
  relativePath: string;
};

export type DocumentPreview = {
  relativePath: string;
  fileName: string;
  kind: DocumentPreviewKind;
  mimeType?: string | null;
  textContent?: string | null;
  bytes?: number[] | null;
  absolutePath: string;
};

export type WorkspacePathStatus = {
  path: string;
  exists: boolean;
};

export type WorkspaceGitStatus = {
  isRepository: boolean;
  branchName?: string | null;
  uncommittedChangesCount: number;
};

export type AccountAmount = {
  account: string;
  amount: number;
};

export type IncomeStatementReport = {
  income: AccountAmount[];
  expenses: AccountAmount[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
};

export type BalanceSheetReport = {
  assets: AccountAmount[];
  liabilities: AccountAmount[];
  equity: AccountAmount[];
  retainedEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
};

export type MvpReports = {
  periodStart: string;
  periodEnd: string;
  incomeStatement: IncomeStatementReport;
  expenseBreakdown: AccountAmount[];
  sourceAccountBalances: AccountAmount[];
  balanceSheet: BalanceSheetReport;
};

export type WorkspaceManifest = {
  schemaVersion: 1;
  appCreated: true;
  business: {
    name: string;
    baseCurrency: "USD";
    booksStartDate: string;
  };
  layout: {
    mainFile: "main.bean";
    accountsFile: "accounts.bean";
    openingBalancesFile: "opening-balances.bean";
    transactionsDirectory: "transactions";
    documentsDirectory: "documents";
    importsDirectory: "imports";
    appDirectory: ".diurnum";
    sqliteFile: ".diurnum/diurnum.sqlite";
  };
  createdAt: string;
  updatedAt: string;
};

export type LedgerStatus = "valid" | "invalid";

export type WorkspaceSummary = {
  rootPath: string;
  businessName: string;
  baseCurrency: "USD";
  booksStartDate: string;
  ledgerStatus: LedgerStatus;
  ledgerValidation: LedgerValidationSummary;
};

export type LedgerValidationSummary = {
  status: LedgerStatus;
  errors: string[];
};

export type WorkspaceErrorCode =
  | "invalidBusinessName"
  | "invalidBooksStartDate"
  | "invalidCurrency"
  | "directoryAlreadyExists"
  | "notAppCreatedWorkspace"
  | "missingManifest"
  | "missingLedgerFile"
  | "invalidLedger"
  | "io"
  | "sqlite";

export type WorkspaceError = {
  code: WorkspaceErrorCode;
  message: string;
};
