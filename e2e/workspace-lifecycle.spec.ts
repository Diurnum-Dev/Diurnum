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
      async openWorkspace() {
        return workspace;
      },
      async validateWorkspace() {
        return { status: "valid", errors: [] };
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
        return "/tmp";
      },
      async revealWorkspace() {},
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create Workspace" }).click();
  await page.getByLabel("Business name").fill("Acme Studio");
  await page.getByLabel("Books start date").fill("2026-01-01");
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("button", { name: "Create Workspace" }).click();

  await expect(page.getByRole("heading", { name: "Acme Studio" })).toBeVisible();
  await expect(page.getByText("USD")).toBeVisible();
  await expect(page.getByText("2026-01-01")).toBeVisible();
  await expect(page.getByText("main.bean")).toBeVisible();

  await page.getByRole("button", { name: "Open Another Workspace" }).click();
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("button", { name: "Open Workspace" }).click();
  await expect(page.getByRole("heading", { name: "Acme Studio" })).toBeVisible();
});
