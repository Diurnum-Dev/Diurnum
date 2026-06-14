import { test } from "@playwright/test";
import path from "path";

const OUT = "/tmp/diurnum-audit";
const REFERENCE_VIEWPORT = { width: 2048, height: 1536 };

function injectMockApi() {
  const workspace = {
    rootPath: "/tmp/Acme Studio",
    businessName: "Acme Studio",
    baseCurrency: "USD" as const,
    booksStartDate: "2026-01-01",
    ledgerStatus: "valid" as const,
    ledgerValidation: { status: "valid" as const, errors: [] },
  };
  (window as any).__DIURNUM_TEST_API__ = {
    async createWorkspace() { return workspace; },
    async openWorkspace() { return workspace; },
    async validateWorkspace() { return { status: "valid", errors: [] }; },
    async listSnapshots() { return []; },
    async restoreSnapshot() { return workspace; },
    async saveLedgerFile() { return { status: "valid", errors: [] }; },
    async getLedgerEditorState() {
      return {
        files: ["accounts.bean", "main.bean", "opening-balances.bean"],
        session: {
          activeTab: "main.bean",
          openTabs: [{ relativePath: "main.bean", cursor: 0, scrollTop: 0 }],
          recentlyClosedTabs: [],
        },
      };
    },
    async readLedgerFile({ relativePath }: { relativePath: string }) {
      return {
        relativePath,
        contents: relativePath === "main.bean"
          ? 'include "accounts.bean"\ninclude "opening-balances.bean"\n\n2026-01-15 * "Coffee Shop"\n  Expenses:Food  12.50 USD\n  Assets:Bank:Operating-Checking\n\n2026-02-01 * "OpenAI"\n  Expenses:Software  20.00 USD\n  Assets:Bank:Operating-Checking\n'
          : "1970-01-01 open Assets:Bank:Operating-Checking USD\n1970-01-01 open Expenses:Food USD\n1970-01-01 open Expenses:Software USD\n",
        modifiedAt: 1,
      };
    },
    async saveLedgerEditorSession(input: any) { return input.session; },
    async analyzeCsvImport() {
      return {
        fileName: "checking.csv",
        rowCount: 3,
        delimiter: "Comma",
        encoding: "UTF-8",
        autoDetected: true,
        requiredFieldCount: 3,
        requiredMappedCount: 3,
        likelyDuplicateCount: 0,
        importableRowCount: 3,
        skippedRowCount: 0,
        columns: ["Date", "Description", "Amount"],
        previewRows: [
          { Date: "2026-01-15", Description: "Coffee Shop", Amount: "-12.50" },
          { Date: "2026-02-01", Description: "OpenAI", Amount: "-20.00" },
        ],
        mapping: {
          postedDateColumn: "Date",
          descriptionColumn: "Description",
          amountColumn: "Amount",
          debitColumn: null,
          creditColumn: null,
          transactionTypeColumn: null,
          debitTypeValue: "Debit",
          statusColumn: null,
          checkNumberColumn: null,
          memoColumn: null,
          referenceIdColumn: null,
          payeeColumn: null,
          categoryColumn: null,
          dateFormat: null,
        },
        blockedReason: null,
      };
    },
    async getDocumentsState() {
      return {
        folders: [{ relativePath: "", name: "documents", depth: 0, isSourceAccountFolder: false, absolutePath: "/tmp/Acme Studio/documents" }],
        selectedFolder: "",
        files: [
          { relativePath: "invoice-jan.pdf", name: "invoice-jan.pdf", modifiedAt: "2026-01-15T10:00:00Z", sizeBytes: 50000, kind: "pdf", absolutePath: "/tmp/Acme Studio/documents/invoice-jan.pdf" },
        ],
      };
    },
    async createDocumentFolder() { return { relativePath: "receipts", name: "receipts", depth: 1, isSourceAccountFolder: false, absolutePath: "/tmp/Acme Studio/documents/receipts" }; },
    async importDocumentFile() { return { relativePath: "note.txt", name: "note.txt", modifiedAt: "2026-05-30T18:00:00Z", sizeBytes: 5, kind: "text", absolutePath: "/tmp/Acme Studio/documents/note.txt" }; },
    async renameDocumentEntry() {},
    async deleteDocumentEntry() {},
    async readDocumentPreview() { return { relativePath: "note.txt", fileName: "note.txt", kind: "text", mimeType: "text/plain", textContent: "hello", bytes: null, absolutePath: "/tmp/Acme Studio/documents/note.txt" }; },
    async getPredictiveEntryCompletion() { return null; },
    async inspectWorkspacePaths(paths: string[]) { return paths.map((p) => ({ path: p, exists: true })); },
    async getWorkspaceGitStatus() { return { isRepository: true, branchName: "main", uncommittedChangesCount: 2 }; },
    async getGitPanelState() {
      return {
        isRepository: true,
        branchName: "main",
        uncommittedChangesCount: 2,
        workingTree: [
          { path: "main.bean", status: "Modified", staged: false },
          { path: "accounts.bean", status: "Modified", staged: true },
        ],
        recentCommits: [
          { hash: "abc123", shortHash: "abc123", summary: "Initial commit", committedAt: "2026-01-01T00:00:00Z", authorName: "Acme Studio" },
        ],
        warning: null,
        hookOutput: null,
      };
    },
    async listRecentGitCommits() { return []; },
    async getGitCommitDiff() { return { hash: "abc123", shortHash: "abc123", committedAt: "2026-05-30T18:00:00Z", summary: "Initial commit", diff: "" }; },
    async commitGitChanges() { return { committed: false, commitHash: null, warning: null, hookOutput: null }; },
    async addSourceAccount() { return workspace; },
    async importStatementRows() { return { sourceAccount: "Assets:Bank:Operating-Checking", importedCount: 2, skippedDuplicateCount: 0 }; },
    async getSuggestedEntries() {
      return [
        {
          kind: "standard" as const,
          statementRowId: "row-1",
          postedDate: "2026-05-08",
          description: "OPENAI *CHATGPT",
          sourceAccount: "Assets:Bank:Chase Checking",
          sourceAmount: "-20.00",
          sourceFileName: "checking.csv",
          importFingerprint: "checking-1",
          pendingAtImport: true,
          linkedStatementRow: null,
          suggestedLedgerAccount: "Expenses:Software",
          categorizationRuleId: "rule-1",
          aiSuggestion: null,
        },
        {
          kind: "standard" as const,
          statementRowId: "row-2",
          postedDate: "2026-05-10",
          description: "AWS CHARGES",
          sourceAccount: "Assets:Bank:Chase Checking",
          sourceAmount: "-45.00",
          sourceFileName: "checking.csv",
          importFingerprint: "checking-2",
          pendingAtImport: false,
          linkedStatementRow: null,
          suggestedLedgerAccount: "Expenses:Cloud",
          categorizationRuleId: null,
          aiSuggestion: null,
        },
      ];
    },
    async getBrokenProvenance() { return []; },
    async approveSuggestedEntry() { return workspace; },
    async approveTransferEntry() { return workspace; },
    async revertTransferToStandard() { return workspace; },
    async getKnownLedgerAccounts() {
      return ["Expenses:Software", "Expenses:Cloud", "Expenses:Meals", "Assets:Bank:Chase Checking"];
    },
    async listCategorizationRules() {
      return [
        { id: "rule-1", sourceAccount: "Assets:Bank:Operating-Checking", matchText: "OPENAI", ledgerAccount: "Expenses:Software", enabled: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "rule-2", sourceAccount: "Assets:Bank:Operating-Checking", matchText: "AWS", ledgerAccount: "Expenses:Cloud", enabled: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "rule-3", sourceAccount: "Assets:Bank:Operating-Checking", matchText: "Coffee", ledgerAccount: "Expenses:Meals", enabled: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ];
    },
    async updateWorkspaceMetadata() { return workspace; },
    async listSourceAccounts() {
      return [
        { accountName: "Assets:Bank:Operating-Checking", kind: "bank" as const, status: "open" as const, currency: "USD", openingBalance: "0.00", sourceMapping: null, documentsFolder: "operating-checking" },
        { accountName: "Assets:Bank:Savings", kind: "bank" as const, status: "open" as const, currency: "USD", openingBalance: "5000.00", sourceMapping: null, documentsFolder: "savings" },
      ];
    },
    async listSourceMappings() { return []; },
    async saveSourceMapping(input: any) { return { sourceAccount: input.sourceAccount, mapping: input.mapping, updatedAt: "2026-05-30T18:00:00Z" }; },
    async renameSourceAccount() { return workspace; },
    async closeSourceAccount() { return workspace; },
    async updateSourceAccountOpeningBalance() { return workspace; },
    async getGitIdentity() {
      return { isRepository: true, localName: "Acme Studio", localEmail: "studio@example.com", globalName: "Global Name", globalEmail: "global@example.com", warning: null };
    },
    async updateGitIdentity() {
      return { isRepository: true, localName: "Acme Studio", localEmail: "studio@example.com", globalName: "Global Name", globalEmail: "global@example.com", warning: null };
    },
    async detectAiAdapters() { return []; },
    async testAiAdapter() { return null; },
    async createCategorizationRule() { return { id: "rule-1", sourceAccount: "Assets:Bank:Operating-Checking", matchText: "Software", ledgerAccount: "Expenses:Software", enabled: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }; },
    async updateCategorizationRule() { return { id: "rule-1", sourceAccount: "Assets:Bank:Operating-Checking", matchText: "Software", ledgerAccount: "Expenses:Software", enabled: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }; },
    async disableCategorizationRule() { return { id: "rule-1", sourceAccount: "Assets:Bank:Operating-Checking", matchText: "Software", ledgerAccount: "Expenses:Software", enabled: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }; },
    async enableCategorizationRule() { return { id: "rule-1", sourceAccount: "Assets:Bank:Operating-Checking", matchText: "Software", ledgerAccount: "Expenses:Software", enabled: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }; },
    async deleteCategorizationRule() {},
    async getAiAdapterConfig() { return { command: null }; },
    async configureAiAdapter() { return { command: "/tmp/adapter" }; },
    async getAiContextDisclosure() { return { adapterConfigured: false, fieldsSent: ["Statement Row", "Chart of Accounts"] }; },
    async getMvpReports() {
      return {
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        incomeStatement: {
          income: [{ account: "Income:Consulting", amount: 5000 }],
          expenses: [
            { account: "Expenses:Software", amount: 65 },
            { account: "Expenses:Cloud", amount: 45 },
            { account: "Expenses:Meals", amount: 12.50 },
          ],
          totalIncome: 5000,
          totalExpenses: 122.50,
          netIncome: 4877.50,
        },
        expenseBreakdown: [
          { account: "Expenses:Software", amount: 65, percentage: 53 },
          { account: "Expenses:Cloud", amount: 45, percentage: 37 },
          { account: "Expenses:Meals", amount: 12.50, percentage: 10 },
        ],
        sourceAccountBalances: [
          { account: "Assets:Bank:Operating-Checking", balance: 4877.50 },
          { account: "Assets:Bank:Savings", balance: 5000 },
        ],
        balanceSheet: {
          assets: [{ account: "Assets:Bank:Operating-Checking", balance: 4877.50 }],
          liabilities: [],
          equity: [{ account: "Equity:OpeningBalances", balance: 0 }],
          retainedEarnings: 4877.50,
          totalAssets: 4877.50,
          totalLiabilities: 0,
          totalEquity: 4877.50,
        },
      };
    },
    async pickDirectory() {
      return (window as any).__nextPickedDirectory ?? "/tmp";
    },
    async revealWorkspace() {},
    async openExternalPath() {},
  };
}

async function withWorkspace(page: any) {
  await page.addInitScript(injectMockApi);
  await page.goto("/");
  await page.getByRole("button", { name: /New blank workspace/ }).click();
  await page.getByLabel("Business name").fill("Acme Studio");
  await page.getByLabel("Books start date").fill("2026-01-01");
  await page.evaluate(() => { (window as any).__nextPickedDirectory = "/tmp"; });
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("button", { name: "Create Workspace" }).click();
  await page.getByLabel("Ledger Editor").waitFor({ state: "visible", timeout: 10000 });
}

async function dismissUpdateBanner(page: any) {
  const later = page.getByRole("button", { name: "Later" });
  if (await later.count()) await later.click().catch(() => {});
  await page.waitForTimeout(600);
  if (await later.count()) await later.click().catch(() => {});
}

test("01-start-screen", async ({ page }) => {
  await page.addInitScript(injectMockApi);
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "01-start-screen.png"), fullPage: true });
});

test("02-create-workspace", async ({ page }) => {
  await page.addInitScript(injectMockApi);
  await page.goto("/");
  await page.getByRole("button", { name: /New blank workspace/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "02-create-workspace.png"), fullPage: true });
});

test("04-ledger-editor", async ({ page }) => {
  await withWorkspace(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "04-ledger-editor.png"), fullPage: true });
});

test("05-inbox", async ({ page }) => {
  await page.setViewportSize(REFERENCE_VIEWPORT);
  await withWorkspace(page);
  await dismissUpdateBanner(page);
  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "05-inbox.png"), fullPage: true });
});

test("06-documents", async ({ page }) => {
  await withWorkspace(page);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "06-documents.png"), fullPage: true });
});

test("07-git", async ({ page }) => {
  await withWorkspace(page);
  await page.getByRole("button", { name: "Git", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "07-git.png"), fullPage: true });
});

test("08-settings", async ({ page }) => {
  await withWorkspace(page);
  await page.getByLabel("Workspace screens").getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "08-settings.png"), fullPage: true });
});

test("09-reports", async ({ page }) => {
  await withWorkspace(page);
  await page.keyboard.press("Control+K");
  await page.getByLabel("Search commands").fill("reports");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "09-reports.png"), fullPage: true });
});

test("10-command-palette", async ({ page }) => {
  await withWorkspace(page);
  await page.keyboard.press("Control+K");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "10-command-palette.png"), fullPage: true });
});
