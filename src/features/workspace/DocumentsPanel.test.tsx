import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentsPanel } from "./DocumentsPanel";

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

afterEach(() => {
  delete window.__DIURNUM_TEST_API__;
});

describe("DocumentsPanel", () => {
  it("loads folders and previews text files inline", async () => {
    const openExternalPath = vi.fn();
    window.__DIURNUM_TEST_API__ = {
      async createWorkspace() {
        return workspace;
      },
      async openWorkspace() {
        return workspace;
      },
      async validateWorkspace() {
        return workspace.ledgerValidation;
      },
      async listSnapshots() {
        return [];
      },
      async restoreSnapshot() {
        return workspace;
      },
      async saveLedgerFile() {
        return workspace.ledgerValidation;
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
      async readLedgerFile() {
        return { relativePath: "main.bean", contents: "", modifiedAt: 1 };
      },
      async saveLedgerEditorSession(input) {
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
      async getDocumentsState(input) {
        return {
          folders: [
            {
              relativePath: "",
              name: "documents",
              depth: 0,
              isSourceAccountFolder: false,
              absolutePath: "/tmp/Acme Studio/documents",
            },
            {
              relativePath: "operating-checking",
              name: "operating-checking",
              depth: 1,
              isSourceAccountFolder: true,
              absolutePath: "/tmp/Acme Studio/documents/operating-checking",
            },
          ],
          selectedFolder: input.selectedFolder ?? "",
          files:
            input.selectedFolder === "operating-checking"
              ? [
                  {
                    relativePath: "operating-checking/note.txt",
                    name: "note.txt",
                    modifiedAt: "2026-05-30T18:00:00Z",
                    sizeBytes: 16,
                    kind: "text" as const,
                    absolutePath: "/tmp/Acme Studio/documents/operating-checking/note.txt",
                  },
                ]
              : [],
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
          relativePath: "operating-checking/note.txt",
          name: "note.txt",
          modifiedAt: "2026-05-30T18:00:00Z",
          sizeBytes: 16,
          kind: "text" as const,
          absolutePath: "/tmp/Acme Studio/documents/operating-checking/note.txt",
        };
      },
      async renameDocumentEntry() {},
      async deleteDocumentEntry() {},
      async readDocumentPreview() {
        return {
          relativePath: "operating-checking/note.txt",
          fileName: "note.txt",
          kind: "text" as const,
          mimeType: "text/plain",
          textContent: "hello documents",
          bytes: null,
          absolutePath: "/tmp/Acme Studio/documents/operating-checking/note.txt",
        };
      },
      async getPredictiveEntryCompletion() {
        return null;
      },
      async inspectWorkspacePaths(paths) {
        return paths.map((path) => ({ path, exists: true }));
      },
      async getWorkspaceGitStatus() {
        return {
          isRepository: false,
          branchName: null,
          uncommittedChangesCount: 0,
        };
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
          importedCount: 0,
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
      async revertTransferToStandard() {
        return workspace;
      },
      async getKnownLedgerAccounts() {
        return [];
      },
      async listCategorizationRules() {
        return [];
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
      async updateWorkspaceMetadata() {
        return workspace;
      },
      async listSourceAccounts() {
        return [];
      },
      async listSourceMappings() {
        return [];
      },
      async saveSourceMapping() {
        return {
          sourceAccount: "Assets:Bank:Operating-Checking",
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
          isRepository: false,
          localName: null,
          localEmail: null,
          globalName: null,
          globalEmail: null,
          warning: null,
        };
      },
      async updateGitIdentity() {
        return {
          isRepository: false,
          localName: null,
          localEmail: null,
          globalName: null,
          globalEmail: null,
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
        throw new Error("not used");
      },
      async updateCategorizationRule() {
        throw new Error("not used");
      },
      async getAiAdapterConfig() {
        return { command: null };
      },
      async configureAiAdapter() {
        return { command: null };
      },
      async getAiContextDisclosure() {
        return { adapterConfigured: false, fieldsSent: [] };
      },
      async getMvpReports() {
        throw new Error("not used");
      },
      async pickDirectory() {
        return null;
      },
      async revealWorkspace() {},
      openExternalPath,
    };

    const user = userEvent.setup();
    render(<DocumentsPanel workspace={workspace} onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /operating-checking/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /note\.txt/i })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /note\.txt/i }));
    expect(await screen.findByText("hello documents")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open externally" }));
    expect(openExternalPath).toHaveBeenCalledWith(
      "/tmp/Acme Studio/documents/operating-checking/note.txt",
    );
  });
});
