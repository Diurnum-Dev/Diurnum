import { expect, test } from "@playwright/test";

test("creates and reopens a Workspace through the app shell", async ({ page }) => {
  await page.addInitScript(() => {
    const workspace = {
      rootPath: "/tmp/Acme Studio",
      businessName: "Acme Studio",
      baseCurrency: "USD" as const,
      booksStartDate: "2026-01-01",
      ledgerStatus: "valid" as const,
      ledgerValidation: {
        status: "valid" as const,
        errors: [],
      },
    };
    let suggestedEntries = [
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
    ];

    window.__DIURNUM_TEST_API__ = {
      async createWorkspace() {
        return workspace;
      },
      async openWorkspace(path: string) {
        if (path.includes("not-workspace")) {
          throw new Error("This folder is not an App-Created Workspace.");
        }
        return workspace;
      },
      async validateWorkspace() {
        return { status: "valid", errors: [] };
      },
      async listSnapshots() {
        return [];
      },
      async restoreSnapshot() {
        return workspace;
      },
      async saveLedgerFile() {
        return { status: "valid", errors: [] };
      },
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
          contents:
            relativePath === "main.bean"
              ? 'include "accounts.bean"\ninclude "opening-balances.bean"\n'
              : "1970-01-01 open Assets:Bank:Operating-Checking USD\n",
          modifiedAt: 1,
        };
      },
      async saveLedgerEditorSession(input: {
        session: {
          openTabs: Array<{ relativePath: string; cursor: number; scrollTop: number }>;
          activeTab: string;
          recentlyClosedTabs: Array<{ relativePath: string; cursor: number; scrollTop: number }>;
        };
      }) {
        return input.session;
      },
      async analyzeCsvImport() {
        return {
          fileName: "checking.csv",
          rowCount: 0,
          delimiter: "Comma",
          encoding: "UTF-8",
          autoDetected: true,
          requiredFieldCount: 3,
          requiredMappedCount: 3,
          likelyDuplicateCount: 0,
          importableRowCount: 0,
          skippedRowCount: 0,
          columns: [],
          previewRows: [],
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
          folders: [
            {
              relativePath: "",
              name: "documents",
              depth: 0,
              isSourceAccountFolder: false,
              absolutePath: "/tmp/Acme Studio/documents",
            },
          ],
          selectedFolder: "",
          files: [],
        };
      },
      async createDocumentFolder() {
        return {
          relativePath: "receipts",
          name: "receipts",
          depth: 1,
          isSourceAccountFolder: false,
          absolutePath: "/tmp/Acme Studio/documents/receipts",
        };
      },
      async importDocumentFile() {
        return {
          relativePath: "note.txt",
          name: "note.txt",
          modifiedAt: "2026-05-30T18:00:00Z",
          sizeBytes: 5,
          kind: "text",
          absolutePath: "/tmp/Acme Studio/documents/note.txt",
        };
      },
      async renameDocumentEntry() {},
      async deleteDocumentEntry() {},
      async readDocumentPreview() {
        return {
          relativePath: "note.txt",
          fileName: "note.txt",
          kind: "text",
          mimeType: "text/plain",
          textContent: "hello",
          bytes: null,
          absolutePath: "/tmp/Acme Studio/documents/note.txt",
        };
      },
      async getPredictiveEntryCompletion() {
        return null;
      },
      async inspectWorkspacePaths(paths: string[]) {
        return paths.map((path) => ({ path, exists: true }));
      },
      async getWorkspaceGitStatus() {
        return {
          isRepository: true,
          branchName: "main",
          uncommittedChangesCount: 0,
        };
      },
      async getGitPanelState() {
        return {
          isRepository: true,
          branchName: "main",
          uncommittedChangesCount: 0,
          workingTree: [],
          recentCommits: [],
          warning: null,
          hookOutput: null,
        };
      },
      async listRecentGitCommits() {
        return [];
      },
      async getGitCommitDiff() {
        return {
          hash: "abc123",
          shortHash: "abc123",
          committedAt: "2026-05-30T18:00:00Z",
          summary: "Initial commit",
          diff: "",
        };
      },
      async commitGitChanges() {
        return {
          committed: false,
          commitHash: null,
          warning: null,
          hookOutput: null,
        };
      },
      async addSourceAccount() {
        return workspace;
      },
      async importStatementRows() {
        return {
          sourceAccount: "Assets:Bank:Operating-Checking",
          importedCount: 2,
          skippedDuplicateCount: 0,
        };
      },
      async getSuggestedEntries() {
        return suggestedEntries;
      },
      async getBrokenProvenance() {
        return [];
      },
      async approveSuggestedEntry() {
        suggestedEntries = [];
        return workspace;
      },
      async approveTransferEntry() {
        return workspace;
      },
      async revertTransferToStandard() {
        return workspace;
      },
      async getKnownLedgerAccounts() {
        return [];
      },
      async listCategorizationRules() {
        return [];
      },
      async updateWorkspaceMetadata() {
        return workspace;
      },
      async listSourceAccounts() {
        return [
          {
            accountName: "Assets:Bank:Operating-Checking",
            kind: "bank",
            status: "open",
            currency: "USD",
            openingBalance: "0.00",
            sourceMapping: null,
            documentsFolder: "operating-checking",
          },
        ];
      },
      async listSourceMappings() {
        return [];
      },
      async saveSourceMapping(input: {
        sourceAccount: string;
        mapping: {
          postedDateColumn: string;
          descriptionColumn: string;
          amountColumn?: string | null;
          debitColumn?: string | null;
          creditColumn?: string | null;
          transactionTypeColumn?: string | null;
          debitTypeValue?: string | null;
          statusColumn?: string | null;
          checkNumberColumn?: string | null;
          memoColumn?: string | null;
          referenceIdColumn?: string | null;
          payeeColumn?: string | null;
          categoryColumn?: string | null;
          dateFormat?: string | null;
        };
        workspaceRootPath: string;
      }) {
        return {
          sourceAccount: input.sourceAccount,
          mapping: input.mapping,
          updatedAt: "2026-05-30T18:00:00Z",
        };
      },
      async renameSourceAccount() {
        return workspace;
      },
      async closeSourceAccount() {
        return workspace;
      },
      async updateSourceAccountOpeningBalance() {
        return workspace;
      },
      async getGitIdentity() {
        return {
          isRepository: true,
          localName: "Acme Studio",
          localEmail: "studio@example.com",
          globalName: "Global Name",
          globalEmail: "global@example.com",
          warning: null,
        };
      },
      async updateGitIdentity() {
        return {
          isRepository: true,
          localName: "Acme Studio",
          localEmail: "studio@example.com",
          globalName: "Global Name",
          globalEmail: "global@example.com",
          warning: null,
        };
      },
      async detectAiAdapters() {
        return [];
      },
      async testAiAdapter() {
        return null;
      },
      async createCategorizationRule() {
        return {
          id: "rule-1",
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "Software",
          ledgerAccount: "Expenses:Software",
          enabled: true,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        };
      },
      async updateCategorizationRule() {
        return {
          id: "rule-1",
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "Software",
          ledgerAccount: "Expenses:Software",
          enabled: true,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        };
      },
      async disableCategorizationRule() {
        return {
          id: "rule-1",
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "Software",
          ledgerAccount: "Expenses:Software",
          enabled: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        };
      },
      async enableCategorizationRule() {
        return {
          id: "rule-1",
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "Software",
          ledgerAccount: "Expenses:Software",
          enabled: true,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        };
      },
      async deleteCategorizationRule() {},
      async getAiAdapterConfig() {
        return { command: null };
      },
      async configureAiAdapter() {
        return { command: "/tmp/adapter" };
      },
      async getAiContextDisclosure() {
        return {
          adapterConfigured: false,
          fieldsSent: ["Statement Row", "Chart of Accounts"],
        };
      },
      async getMvpReports() {
        return {
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          incomeStatement: {
            income: [],
            expenses: [],
            totalIncome: 0,
            totalExpenses: 0,
            netIncome: 0,
          },
          expenseBreakdown: [],
          sourceAccountBalances: [],
          balanceSheet: {
            assets: [],
            liabilities: [],
            equity: [],
            retainedEarnings: 0,
            totalAssets: 0,
            totalLiabilities: 0,
            totalEquity: 0,
          },
        };
      },
      async pickDirectory() {
        return (window as unknown as { __nextPickedDirectory?: string })
          .__nextPickedDirectory ?? "/tmp";
      },
      async revealWorkspace() {},
      async openExternalPath() {},
    };
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Open your accounting Workspace" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your books are stored locally. No account required."),
  ).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __nextPickedDirectory?: string }).__nextPickedDirectory =
      "/tmp/not-workspace";
  });
  await page.getByRole("button", { name: /Open existing workspace/ }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This folder is not a Diurnum workspace.",
  );

  await page.getByRole("button", { name: /Example workspace/ }).click();
  await expect(page.getByRole("button", { name: /Example workspace/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: /New blank workspace/ }).click();
  await expect(page.getByRole("button", { name: /Example workspace/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByLabel("Business name").fill("Acme Studio");
  await page.getByLabel("Books start date").fill("2026-01-01");
  await page.evaluate(() => {
    (window as unknown as { __nextPickedDirectory?: string }).__nextPickedDirectory = "/tmp";
  });
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("button", { name: "Create Workspace" }).click();

  await expect(page.getByRole("button", { name: /Acme Studio/ })).toBeVisible();
  await expect(page.getByLabel("Workspace navigation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ledger", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByLabel("Ledger Editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "main.bean", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /main.bean/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Inbox/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Git", exact: true })).toBeVisible();
  await expect(page.getByLabel("Workspace status")).toContainText("Valid");
  await expect(page.getByLabel("Workspace status")).toContainText("Git clean - main");
  await expect(page.getByRole("button", { name: /Inbox 1/ })).toBeVisible();

  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByLabel("Search commands").fill("reports");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  await page.keyboard.press("Control+K");
  await page.getByLabel("Search commands").fill("open file");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: /accounts.bean/i })).toBeVisible();
  await page.getByLabel("Search commands").fill("accounts");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Workspace status")).toContainText("accounts.bean");

  await page.getByRole("button", { name: /Inbox/ }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.locator(".pending-at-import-badge").first()).toBeVisible();
  await page.getByLabel("Ledger Account").fill("Expenses:Software");
  await page.getByRole("button", { name: "Approve Entry" }).click();
  await expect(page.getByLabel("Ledger Editor")).toBeVisible();
  await expect(page.getByRole("tab", { name: /2026-05.bean/ })).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import Statement Rows" })).toBeVisible();

  await page.getByRole("button", { name: /Acme Studio/ }).click();
  await expect(page.getByRole("menuitem", { name: /Acme Studio/ })).toBeVisible();
  await page.getByRole("menuitem", { name: "Open existing..." }).click();
  await expect(page.getByLabel("Ledger Editor")).toBeVisible();

  await page.getByRole("button", { name: "Ledger", exact: true }).click();
  await page.getByRole("button", { name: "Close Workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Open your accounting Workspace" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Workspaces" })).toBeVisible();
  await page.getByRole("button", { name: /Acme Studio/ }).click();
  await expect(page.getByLabel("Ledger Editor")).toBeVisible();
});
