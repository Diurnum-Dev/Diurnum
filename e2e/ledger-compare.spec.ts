import { test } from "@playwright/test";
import path from "path";

const OUT = "/tmp/diurnum-ledger";
const VIEW = { width: 1440, height: 900 };

// Mockup content mirrored from docs/html-mockups/Diurnum - Ledger Editor.html so the
// live screen renders the same data we are pixel-matching against.
const MAY_2026 = `; ───────────────────────────────────────────────
; May 2026 — operating activity
; ───────────────────────────────────────────────

2026-05-02 * "Stripe" "April subscription payout"
    Assets:Bank:Chase                        3,240.00 USD
    Income:SaaS:Subscriptions               -3,240.00 USD

2026-05-03 * "AWS" "May infrastructure"  ; us-east-1, prod cluster
    Expenses:Hosting                          412.83 USD
    Liabilities:CreditCard:Amex              -412.83 USD

2026-05-05 * "Notion" "Team plan — annual"
    Expenses:Software:Tools                   192.00 USD
    Assets:Bank:Chase                        -192.00 USD

2026-05-06 * "Sweetgreen" "Lunch — design team review"
    Expenses:Meals                            87.40 USD
    Assets:Bank:Chase                         -87.40 USD

2026-05-07 * "OpenAI" "ChatGPT Team subscription"
    Expenses:Software:AI                       25.00 USD
    Liabilities:CreditCard:Amex               -25.00 USD

2026-05-08
`;

function injectMockApi() {
  const workspace = {
    rootPath: "/tmp/finance",
    businessName: "Diurnum",
    baseCurrency: "USD" as const,
    booksStartDate: "2026-01-01",
    ledgerStatus: "valid" as const,
    ledgerValidation: { status: "valid" as const, errors: [] },
  };
  const may = `; ───────────────────────────────────────────────
; May 2026 — operating activity
; ───────────────────────────────────────────────

2026-05-02 * "Stripe" "April subscription payout"
    Assets:Bank:Chase                        3,240.00 USD
    Income:SaaS:Subscriptions               -3,240.00 USD

2026-05-03 * "AWS" "May infrastructure"  ; us-east-1, prod cluster
    Expenses:Hosting                          412.83 USD
    Liabilities:CreditCard:Amex              -412.83 USD

2026-05-05 * "Notion" "Team plan — annual"
    Expenses:Software:Tools                   192.00 USD
    Assets:Bank:Chase                        -192.00 USD

2026-05-06 * "Sweetgreen" "Lunch — design team review"
    Expenses:Meals                            87.40 USD
    Assets:Bank:Chase                         -87.40 USD

2026-05-07 * "OpenAI" "ChatGPT Team subscription"
    Expenses:Software:AI                       25.00 USD
    Liabilities:CreditCard:Amex               -25.00 USD

2026-05-08
`;
  const api: Record<string, any> = {
    async createWorkspace() { return workspace; },
    async openWorkspace() { return workspace; },
    async getWorkspaceView() {
      return {
        summary: workspace,
        suggestedEntries: [],
        knownAccounts: [],
        brokenProvenance: [],
        categorizationRules: [],
        sourceAccounts: [],
        snapshots: [],
        gitStatus: { isRepository: true, branchName: "main", uncommittedChangesCount: 3 },
        gitPanel: { isRepository: true, branchName: "main", uncommittedChangesCount: 3, workingTree: [], recentCommits: [], warning: null, hookOutput: null },
      };
    },
    async validateWorkspace() { return { status: "valid", errors: [] }; },
    async listSnapshots() { return []; },
    async restoreSnapshot() { return workspace; },
    async saveLedgerFile() { return { status: "valid", errors: [] }; },
    async getLedgerEditorState() {
      return {
        files: [
          "main.bean",
          "accounts.bean",
          "balances.bean",
          "prices.bean",
          "transactions/2026-01.bean",
          "transactions/2026-02.bean",
          "transactions/2026-03.bean",
          "transactions/2026-04.bean",
          "transactions/2026-05.bean",
          "transactions/2025-12.bean",
        ],
        session: {
          activeTab: "transactions/2026-05.bean",
          openTabs: [
            { relativePath: "main.bean", cursor: 0, scrollTop: 0 },
            { relativePath: "transactions/2026-05.bean", cursor: 99999, scrollTop: 0 },
            { relativePath: "accounts.bean", cursor: 0, scrollTop: 0 },
          ],
          recentlyClosedTabs: [],
        },
      };
    },
    async readLedgerFile({ relativePath }: { relativePath: string }) {
      return {
        relativePath,
        contents: relativePath === "transactions/2026-05.bean"
          ? may
          : relativePath === "main.bean"
            ? 'include "accounts.bean"\ninclude "transactions/2026-05.bean"\n'
            : "1970-01-01 open Assets:Bank:Chase USD\n1970-01-01 open Expenses:Hosting USD\n",
        modifiedAt: 1,
      };
    },
    async saveLedgerEditorSession(input: any) { return input.session; },
    async analyzeCsvImport() { return null; },
    async getDocumentsState() { return { folders: [], selectedFolder: "", files: [] }; },
    async createDocumentFolder() { return null; },
    async importDocumentFile() { return null; },
    async renameDocumentEntry() {},
    async deleteDocumentEntry() {},
    async readDocumentPreview() { return null; },
    async getPredictiveEntryCompletion() { return null; },
    async inspectWorkspacePaths(paths: string[]) { return paths.map((p) => ({ path: p, exists: true })); },
    async getWorkspaceGitStatus() { return { isRepository: true, branchName: "main", uncommittedChangesCount: 3 }; },
    async getGitPanelState() { return { isRepository: true, branchName: "main", uncommittedChangesCount: 3, workingTree: [], recentCommits: [], warning: null, hookOutput: null }; },
    async listRecentGitCommits() { return []; },
    async getGitCommitDiff() { return { hash: "a", shortHash: "a", committedAt: "2026-05-30T18:00:00Z", summary: "", diff: "" }; },
    async commitGitChanges() { return { committed: false, commitHash: null, warning: null, hookOutput: null }; },
    async addSourceAccount() { return workspace; },
    async importStatementRows() { return { sourceAccount: "", importedCount: 0, skippedDuplicateCount: 0 }; },
    async getSuggestedEntries() { return []; },
    async getBrokenProvenance() { return []; },
    async approveSuggestedEntry() { return workspace; },
    async approveTransferEntry() { return workspace; },
    async listCategorizationRules() { return []; },
    async updateWorkspaceMetadata() { return workspace; },
    async listSourceAccounts() { return []; },
    async listSourceMappings() { return []; },
    async saveSourceMapping(input: any) { return { sourceAccount: input.sourceAccount, mapping: input.mapping, updatedAt: "2026-05-30T18:00:00Z" }; },
    async renameSourceAccount() { return workspace; },
    async closeSourceAccount() { return workspace; },
    async updateSourceAccountOpeningBalance() { return workspace; },
    async getGitIdentity() { return { isRepository: true, localName: "", localEmail: "", globalName: "", globalEmail: "", warning: null }; },
    async updateGitIdentity() { return { isRepository: true, localName: "", localEmail: "", globalName: "", globalEmail: "", warning: null }; },
    async detectAiAdapters() { return []; },
    async testAiAdapter() { return null; },
    async createCategorizationRule() { return null; },
    async updateCategorizationRule() { return null; },
    async disableCategorizationRule() { return null; },
    async enableCategorizationRule() { return null; },
    async deleteCategorizationRule() {},
    async getAiAdapterConfig() { return { command: null }; },
    async configureAiAdapter() { return { command: null }; },
    async getAiContextDisclosure() { return { adapterConfigured: false, fieldsSent: [] }; },
    async getMvpReports() { return null; },
    async pickDirectory() { return (window as any).__nextPickedDirectory ?? "/tmp"; },
    async revealWorkspace() {},
    async openExternalPath() {},
  };
  (window as any).__DIURNUM_TEST_API__ = new Proxy(api, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return async () => [];
    },
  });
}

test("live-ledger", async ({ page }) => {
  await page.setViewportSize(VIEW);
  await page.addInitScript(injectMockApi);
  await page.goto("/");
  await page.getByRole("button", { name: /New blank workspace/ }).click();
  await page.getByLabel("Business name").fill("Diurnum");
  await page.getByLabel("Books start date").fill("2026-01-01");
  await page.evaluate(() => { (window as any).__nextPickedDirectory = "/tmp"; });
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("button", { name: "Create Workspace" }).click();
  await page.getByLabel("Ledger Editor").waitFor({ state: "visible", timeout: 10000 });
  // Dismiss the transient "update available" banner so it doesn't obscure the chrome.
  // Try twice with a gap — the banner appears asynchronously after a network fetch.
  const later = page.getByRole("button", { name: "Later" });
  if (await later.count()) await later.click().catch(() => {});
  await page.waitForTimeout(600);
  if (await later.count()) await later.click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "live-ledger.png") });
});

test("mockup", async ({ page }) => {
  await page.setViewportSize(VIEW);
  const file = path.resolve(
    process.cwd(),
    "docs/html-mockups/Diurnum - Ledger Editor.html",
  );
  await page.goto("file://" + file);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "mockup.png") });
});
