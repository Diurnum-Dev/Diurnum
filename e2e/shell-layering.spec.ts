import { expect, test } from "@playwright/test";

/**
 * The sidebar is `position: sticky`, which makes it a stacking context, so the
 * workspace switcher menu's z-index only ranks it against its sidebar siblings —
 * never against <main>. Without an explicit z-index on the sidebar, <main> wins
 * on DOM order and paints the Inbox rows over the open menu.
 */
function injectMockApi() {
  const workspace = {
    rootPath: "/tmp/Acme Studio",
    businessName: "Acme Studio",
    baseCurrency: "USD" as const,
    booksStartDate: "2026-01-01",
    ledgerStatus: "valid" as const,
    ledgerValidation: { status: "valid" as const, errors: [] },
  };
  const suggestedEntries = Array.from({ length: 12 }, (_, index) => ({
    kind: "standard" as const,
    statementRowId: `row-${index}`,
    postedDate: "2026-05-08",
    description: `STRIPE TRANSFER ACH ENTRY ${index}`,
    sourceAccount: "Assets:Bank:Chase Checking",
    sourceAmount: "-20.00",
    sourceFileName: "checking.csv",
    importFingerprint: `checking-${index}`,
    pendingAtImport: true,
    linkedStatementRow: null,
    suggestedLedgerAccount: "Expenses:Software",
    categorizationRuleId: "rule-1",
    aiSuggestion: null,
  }));

  const api = {
    async createWorkspace() {
      return workspace;
    },
    async openWorkspace() {
      return workspace;
    },
    async getWorkspaceView() {
      return {
        summary: workspace,
        suggestedEntries,
        knownAccounts: ["Expenses:Software", "Assets:Bank:Chase Checking"],
        brokenProvenance: [],
        categorizationRules: [],
        sourceAccounts: [],
        snapshots: [],
        gitStatus: { isRepository: false, branchName: null, uncommittedChangesCount: 0 },
        gitPanel: {
          isRepository: false,
          branchName: null,
          uncommittedChangesCount: 0,
          workingTree: [],
          recentCommits: [],
          warning: null,
          hookOutput: null,
        },
      };
    },
    async validateWorkspace() {
      return { status: "valid", errors: [] };
    },
    async listSnapshots() {
      return [];
    },
    async getLedgerEditorState() {
      return {
        files: ["main.bean"],
        session: {
          activeTab: "main.bean",
          openTabs: [{ relativePath: "main.bean", cursor: 0, scrollTop: 0 }],
          recentlyClosedTabs: [],
        },
      };
    },
    async readLedgerFile({ relativePath }: { relativePath: string }) {
      return { relativePath, contents: "", modifiedAt: 1 };
    },
    async saveLedgerEditorSession(input: any) {
      return input.session;
    },
    async getPredictiveEntryCompletion() {
      return null;
    },
    async inspectWorkspacePaths(paths: string[]) {
      return paths.map((path) => ({ path, exists: true }));
    },
    async getWorkspaceGitStatus() {
      return { isRepository: false, branchName: null, uncommittedChangesCount: 0 };
    },
    async getSuggestedEntries() {
      return suggestedEntries;
    },
    async getBrokenProvenance() {
      return [];
    },
    async listCategorizationRules() {
      return [];
    },
    async listSourceAccounts() {
      return [];
    },
    async getKnownLedgerAccounts() {
      return ["Expenses:Software", "Assets:Bank:Chase Checking"];
    },
    async getAiAdapterConfig() {
      return { command: null };
    },
    async getAiContextDisclosure() {
      return { adapterConfigured: false, fieldsSent: [] };
    },
    async detectAiAdapters() {
      return [];
    },
    async getGitPanelState() {
      return {
        isRepository: false,
        branchName: null,
        uncommittedChangesCount: 0,
        workingTree: [],
        recentCommits: [],
        warning: null,
        hookOutput: null,
      };
    },
    async pickDirectory() {
      return "/tmp";
    },
    async revealWorkspace() {},
    async openExternalPath() {},
  };

  // This spec only exercises the shell's layering, so anything the screens call
  // beyond the boot path can answer null rather than be stubbed out by hand.
  (window as any).__DIURNUM_TEST_API__ = new Proxy(api, {
    get(target: any, property: string) {
      return property in target ? target[property] : async () => null;
    },
  });
}

test("the workspace switcher menu paints above the main pane", async ({ page }) => {
  await page.addInitScript(injectMockApi);
  await page.goto("/");
  await page.getByRole("button", { name: /New blank workspace/ }).click();
  await page.getByLabel("Business name").fill("Acme Studio");
  await page.getByLabel("Books start date").fill("2026-01-01");
  await page.evaluate(() => {
    (window as any).__nextPickedDirectory = "/tmp";
  });
  await page.getByRole("button", { name: "Choose" }).click();
  await page.getByRole("button", { name: "Create Workspace" }).click();
  await page.getByLabel("Ledger Editor").waitFor({ state: "visible" });

  // The Inbox fills the main pane with rows, which is what the menu has to cover.
  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.getByRole("button", { name: /Workspace/ }).first().click();

  const menu = page.locator(".workspace-switcher-menu");
  await menu.waitFor({ state: "visible" });

  const sidebarBox = await page.locator(".sidebar").boundingBox();
  const menuBox = await menu.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  // The menu is wider than the sidebar, so it overhangs the main pane.
  expect(menuBox!.x + menuBox!.width).toBeGreaterThan(sidebarBox!.x + sidebarBox!.width);

  // Hit-test the overhang: whatever sits on top there is what the user sees and clicks.
  const probe = {
    x: sidebarBox!.x + sidebarBox!.width + 20,
    y: menuBox!.y + menuBox!.height / 2,
  };
  const topmost = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element?.closest(".workspace-switcher-menu") ? "menu" : (element?.className ?? null);
    },
    probe,
  );

  expect(topmost).toBe("menu");
});
