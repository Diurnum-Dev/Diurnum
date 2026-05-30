export type WorkspaceCreateInput = {
  businessName: string;
  baseCurrency: "USD";
  booksStartDate: string;
  parentDirectory: string;
};

export type SourceAccountKind = "bank" | "creditCard";

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
  memoColumn?: string | null;
  referenceIdColumn?: string | null;
  payeeColumn?: string | null;
  categoryColumn?: string | null;
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

export type SuggestedEntry = {
  kind: "standard" | "transfer";
  statementRowId: string;
  postedDate: string;
  description: string;
  sourceAccount: string;
  sourceAmount: string;
  sourceFileName: string;
  importFingerprint: string;
  linkedStatementRow?: LinkedStatementRow | null;
  suggestedLedgerAccount?: string | null;
  categorizationRuleId?: string | null;
  aiSuggestion?: AiSuggestion | null;
};

export type AiSuggestion = {
  ledgerAccount?: string | null;
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

export type AiContextDisclosure = {
  adapterConfigured: boolean;
  fieldsSent: string[];
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
