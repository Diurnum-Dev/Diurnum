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
        return [];
      },
      async getBrokenProvenance() {
        return [];
      },
      async approveSuggestedEntry() {
        return workspace;
      },
      async approveTransferEntry() {
        return workspace;
      },
      async listCategorizationRules() {
        return [];
      },
      async createCategorizationRule() {
        return {
          id: "rule-1",
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "Software",
          ledgerAccount: "Expenses:Software",
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
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        };
      },
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

  await expect(page.getByRole("heading", { name: "Acme Studio" })).toBeVisible();
  await expect(page.getByLabel("Workspace navigation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ledger", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "Inbox", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Git", exact: true })).toBeVisible();
  await expect(page.getByLabel("Workspace status")).toContainText("Valid");
  await expect(page.getByLabel("Workspace status")).toContainText("Git clean - main");
  await expect(page.getByText("USD")).toBeVisible();
  await expect(page.getByText("2026-01-01")).toBeVisible();
  await expect(page.getByLabel("Workspace files").getByText("main.bean")).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import Statement Rows" })).toBeVisible();

  await page.getByRole("button", { name: /Acme Studio/ }).click();
  await expect(page.getByRole("menuitem", { name: /Acme Studio/ })).toBeVisible();
  await page.getByRole("menuitem", { name: "Open existing..." }).click();
  await expect(page.getByRole("heading", { name: "Acme Studio" })).toBeVisible();

  await page.getByRole("button", { name: "Ledger", exact: true }).click();
  await page.getByRole("button", { name: "Close Workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Open your accounting Workspace" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Workspaces" })).toBeVisible();
  await page.getByRole("button", { name: /Acme Studio/ }).click();
  await expect(page.getByRole("heading", { name: "Acme Studio" })).toBeVisible();
});
