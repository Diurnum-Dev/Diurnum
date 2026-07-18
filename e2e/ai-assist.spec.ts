import { expect, test } from "@playwright/test";
import type {
  AiAssistPassState,
  ApproveAiAssistBatchInput,
  SuggestedEntry,
  WorkspaceView,
} from "../src/lib/workspace/types";

declare global {
  interface Window {
    __APPROVE_CALLS__: ApproveAiAssistBatchInput[];
    __COMPLETE_AI_PASS__: () => void;
  }
}

test("AI Assist golden path: start → review → sign → approve", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("diurnum.aiAssist.disclosureAcknowledged");

    const workspace = {
      rootPath: "/tmp/Acme Studio",
      businessName: "Acme Studio",
      baseCurrency: "USD" as const,
      booksStartDate: "2026-01-01",
      ledgerStatus: "valid" as const,
      ledgerValidation: { status: "valid" as const, errors: [] },
    };
    let suggestedEntries: SuggestedEntry[] = [
      {
        kind: "standard",
        statementRowId: "row-1",
        postedDate: "2026-05-08",
        description: "OPENAI *CHATGPT",
        sourceAccount: "Assets:Bank:Operating-Checking",
        sourceAmount: "-20.00",
        sourceFileName: "checking.csv",
        importFingerprint: "checking-1",
        pendingAtImport: true,
      },
      {
        kind: "standard",
        statementRowId: "row-2",
        postedDate: "2026-05-09",
        description: "GITHUB",
        sourceAccount: "Assets:Bank:Operating-Checking",
        sourceAmount: "-10.00",
        sourceFileName: "checking.csv",
        importFingerprint: "checking-2",
        pendingAtImport: true,
      },
      {
        kind: "standard",
        statementRowId: "row-3",
        postedDate: "2026-05-10",
        description: "AIRLINE TICKET",
        sourceAccount: "Assets:Bank:Operating-Checking",
        sourceAmount: "-350.00",
        sourceFileName: "checking.csv",
        importFingerprint: "checking-3",
        pendingAtImport: true,
      },
      {
        kind: "standard",
        statementRowId: "row-4",
        postedDate: "2026-05-11",
        description: "MYSTERY VENDOR",
        sourceAccount: "Assets:Bank:Operating-Checking",
        sourceAmount: "-42.00",
        sourceFileName: "checking.csv",
        importFingerprint: "checking-4",
        pendingAtImport: true,
      },
    ];

    const completePass: AiAssistPassState = {
      passId: "pass-1",
      status: "complete",
      totalRows: 4,
      processedRows: 4,
      suggestions: [
        {
          statementRowId: "row-1",
          status: "suggested",
          ledgerAccount: "Expenses:Software",
          payee: "OpenAI",
          narration: "ChatGPT subscription",
          explanation: "Recurring software vendor",
        },
        {
          statementRowId: "row-2",
          status: "suggested",
          ledgerAccount: "Expenses:Software",
          payee: "GitHub",
          narration: "GitHub subscription",
          explanation: "Recurring software vendor",
        },
        {
          statementRowId: "row-3",
          status: "suggested",
          ledgerAccount: "Expenses:Travel",
          payee: "Airline",
          narration: "Business flight",
          explanation: "Airline purchase",
        },
        {
          statementRowId: "row-4",
          status: "needsEye",
          ledgerAccount: "Expenses:Miscellaneous",
          payee: "Mystery Vendor",
          narration: "Unclear purchase",
          explanation: "Vendor is unfamiliar",
        },
      ],
      proposedRules: [
        {
          id: "proposed-rule-1",
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "OPENAI",
          ledgerAccount: "Expenses:Software",
          matchedRowCount: 1,
          matchedRowIds: ["row-1"],
        },
      ],
    };
    let pass: AiAssistPassState | null = null;
    let resolveChunk: ((state: AiAssistPassState) => void) | null = null;

    const buildWorkspaceView = (): WorkspaceView => ({
      summary: workspace,
      suggestedEntries,
      knownAccounts: ["Expenses:Software", "Expenses:Travel"],
      brokenProvenance: [],
      categorizationRules: [],
      sourceAccounts: [
        {
          accountName: "Assets:Bank:Operating-Checking",
          kind: "bank",
          status: "open",
          currency: "USD",
          openingBalance: "0.00",
          sourceMapping: null,
          documentsFolder: "operating-checking",
        },
      ],
      snapshots: [],
      gitStatus: {
        isRepository: true,
        branchName: "main",
        uncommittedChangesCount: 0,
      },
      gitPanel: {
        isRepository: true,
        branchName: "main",
        uncommittedChangesCount: 0,
        workingTree: [],
        recentCommits: [],
        warning: null,
        hookOutput: null,
      },
    });

    window.__APPROVE_CALLS__ = [];
    window.__COMPLETE_AI_PASS__ = () => {
      pass = completePass;
      resolveChunk?.(completePass);
      resolveChunk = null;
    };
    window.__DIURNUM_TEST_API__ = {
      async openWorkspace() {
        return workspace;
      },
      async getWorkspaceView() {
        return buildWorkspaceView();
      },
      async getSuggestedEntries() {
        return suggestedEntries;
      },
      async getAiAdapterConfig() {
        return { command: "adapter" };
      },
      async getAiContextDisclosure() {
        return { adapterConfigured: true, fieldsSent: ["Chart of Accounts"] };
      },
      async detectAiAdapters() {
        return [];
      },
      async getGitIdentity() {
        return {
          isRepository: true,
          localName: "Acme Studio",
          localEmail: "studio@example.com",
          globalName: null,
          globalEmail: null,
          warning: null,
        };
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
          activeTab: string;
          openTabs: Array<{ relativePath: string; cursor: number; scrollTop: number }>;
          recentlyClosedTabs: Array<{
            relativePath: string;
            cursor: number;
            scrollTop: number;
          }>;
        };
      }) {
        return input.session;
      },
      async pickDirectory() {
        return workspace.rootPath;
      },
      async getAiAssistPass() {
        return pass;
      },
      async startAiAssistPass() {
        pass = {
          passId: "pass-1",
          status: "running",
          totalRows: 4,
          processedRows: 0,
          suggestions: [],
          proposedRules: [],
        };
        return pass;
      },
      async runAiAssistNextChunk() {
        return new Promise<AiAssistPassState>((resolve) => {
          resolveChunk = resolve;
        });
      },
      async approveAiAssistBatch(input: ApproveAiAssistBatchInput) {
        window.__APPROVE_CALLS__.push(input);
        const approvedIds = new Set(input.entries.map((entry) => entry.statementRowId));
        suggestedEntries = suggestedEntries.filter(
          (entry) => !approvedIds.has(entry.statementRowId),
        );
        pass = { ...completePass, status: "approved" };
        return buildWorkspaceView();
      },
    } as unknown as NonNullable<typeof window.__DIURNUM_TEST_API__>;
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Open existing workspace/ }).click();
  await expect(page.getByRole("button", { name: /Acme Studio/ })).toBeVisible();

  await page.getByRole("button", { name: /Inbox/ }).click();
  await page.getByRole("button", { name: /AI Assist/ }).click();
  await expect(page.getByLabel("AI Assist disclosure")).toContainText(
    "Chart of Accounts",
  );
  await page.getByRole("button", { name: /Run AI Assist/ }).click();
  await expect(
    page.getByRole("region", { name: "Inbox" }).getByRole("status"),
  ).toContainText("0 of 4 categorized");

  await page.evaluate(() => window.__COMPLETE_AI_PASS__());
  await expect(
    page.getByRole("heading", { name: "Expenses:Software" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.getByRole("button", { name: "Sign & approve" }).click();
  await page.getByRole("button", { name: "Approve 3 entries" }).click();

  await expect(page.getByText("MYSTERY VENDOR", { exact: true }).first()).toBeVisible();
  const calls = await page.evaluate(() => window.__APPROVE_CALLS__);
  expect(calls).toEqual([
    {
      workspaceRootPath: "/tmp/Acme Studio",
      passId: "pass-1",
      entries: [
        {
          statementRowId: "row-1",
          ledgerAccount: "Expenses:Software",
          payee: "OpenAI",
          narration: "ChatGPT subscription",
        },
        {
          statementRowId: "row-2",
          ledgerAccount: "Expenses:Software",
          payee: "GitHub",
          narration: "GitHub subscription",
        },
        {
          statementRowId: "row-3",
          ledgerAccount: "Expenses:Travel",
          payee: "Airline",
          narration: "Business flight",
        },
      ],
      rules: [
        {
          sourceAccount: "Assets:Bank:Operating-Checking",
          matchText: "OPENAI",
          ledgerAccount: "Expenses:Software",
        },
      ],
    },
  ]);
});
