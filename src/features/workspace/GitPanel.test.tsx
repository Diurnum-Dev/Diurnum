import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitPanel } from "./GitPanel";

afterEach(() => {
  delete window.__DIURNUM_TEST_API__;
});

describe("GitPanel", () => {
  it("renders recent commits, loads diffs, and commits selected files", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onWarningChange = vi.fn();
    const onHookOutputChange = vi.fn();
    const onError = vi.fn();

    window.__DIURNUM_TEST_API__ = {
      async createWorkspace() {
        throw new Error("not used");
      },
      async openWorkspace() {
        throw new Error("not used");
      },
      async validateWorkspace() {
        throw new Error("not used");
      },
      async listSnapshots() {
        throw new Error("not used");
      },
      async restoreSnapshot() {
        throw new Error("not used");
      },
      async saveLedgerFile() {
        throw new Error("not used");
      },
      async getLedgerEditorState() {
        throw new Error("not used");
      },
      async readLedgerFile() {
        throw new Error("not used");
      },
      async saveLedgerEditorSession() {
        throw new Error("not used");
      },
      async analyzeCsvImport() {
        throw new Error("not used");
      },
      async getDocumentsState() {
        throw new Error("not used");
      },
      async createDocumentFolder() {
        throw new Error("not used");
      },
      async importDocumentFile() {
        throw new Error("not used");
      },
      async renameDocumentEntry() {
        throw new Error("not used");
      },
      async deleteDocumentEntry() {
        throw new Error("not used");
      },
      async readDocumentPreview() {
        throw new Error("not used");
      },
      async getPredictiveEntryCompletion() {
        throw new Error("not used");
      },
      async inspectWorkspacePaths() {
        throw new Error("not used");
      },
      async getWorkspaceGitStatus() {
        return {
          isRepository: true,
          branchName: "main",
          uncommittedChangesCount: 2,
        };
      },
      async getGitPanelState() {
        return {
          isRepository: true,
          branchName: "main",
          uncommittedChangesCount: 2,
          workingTree: [
            {
              path: "main.bean",
              originalPath: null,
              status: "M ",
              statusLabel: "Modified",
              isStaged: true,
              isUntracked: false,
            },
            {
              path: "transactions/2026-05.bean",
              originalPath: null,
              status: " M",
              statusLabel: "Modified",
              isStaged: false,
              isUntracked: false,
            },
          ],
          recentCommits: [
            {
              hash: "abc123def456",
              shortHash: "abc123d",
              committedAt: "2026-05-30T18:00:00Z",
              summary: "Initial import",
            },
          ],
          warning: null,
          hookOutput: null,
        };
      },
      async listRecentGitCommits() {
        return [];
      },
      async getGitCommitDiff() {
        return {
          hash: "abc123def456",
          shortHash: "abc123d",
          committedAt: "2026-05-30T18:00:00Z",
          summary: "Initial import",
          diff: "diff --git a/main.bean b/main.bean\n+include \"accounts.bean\"",
        };
      },
      async commitGitChanges(input: { workspaceRootPath: string; message: string; paths: string[] }) {
        expect(input.workspaceRootPath).toBe("/tmp/Acme Studio");
        expect(input.message).toBe("Custom commit");
        expect(input.paths).toEqual(["main.bean"]);
        return {
          committed: true,
          commitHash: "abc123def456",
          warning: null,
          hookOutput: null,
        };
      },
      async addSourceAccount() {
        throw new Error("not used");
      },
      async importStatementRows() {
        throw new Error("not used");
      },
      async getSuggestedEntries() {
        throw new Error("not used");
      },
      async getBrokenProvenance() {
        throw new Error("not used");
      },
      async approveSuggestedEntry() {
        throw new Error("not used");
      },
      async approveTransferEntry() {
        throw new Error("not used");
      },
      async listCategorizationRules() {
        throw new Error("not used");
      },
      async createCategorizationRule() {
        throw new Error("not used");
      },
      async updateCategorizationRule() {
        throw new Error("not used");
      },
      async disableCategorizationRule() {
        throw new Error("not used");
      },
      async enableCategorizationRule() {
        throw new Error("not used");
      },
      async deleteCategorizationRule() {
        throw new Error("not used");
      },
      async getAiAdapterConfig() {
        throw new Error("not used");
      },
      async configureAiAdapter() {
        throw new Error("not used");
      },
      async getAiContextDisclosure() {
        throw new Error("not used");
      },
      async getMvpReports() {
        throw new Error("not used");
      },
      async updateWorkspaceMetadata() {
        throw new Error("not used");
      },
      async listSourceAccounts() {
        throw new Error("not used");
      },
      async listSourceMappings() {
        throw new Error("not used");
      },
      async saveSourceMapping() {
        throw new Error("not used");
      },
      async renameSourceAccount() {
        throw new Error("not used");
      },
      async closeSourceAccount() {
        throw new Error("not used");
      },
      async updateSourceAccountOpeningBalance() {
        throw new Error("not used");
      },
      async getGitIdentity() {
        throw new Error("not used");
      },
      async updateGitIdentity() {
        throw new Error("not used");
      },
      async detectAiAdapters() {
        throw new Error("not used");
      },
      async testAiAdapter() {
        throw new Error("not used");
      },
      async pickDirectory() {
        throw new Error("not used");
      },
      async revealWorkspace() {
        throw new Error("not used");
      },
      async openExternalPath() {
        throw new Error("not used");
      },
    };

    const state = await window.__DIURNUM_TEST_API__.getGitPanelState("/tmp/Acme Studio");

    render(
      <GitPanel
        workspaceRootPath="/tmp/Acme Studio"
        state={state}
        warning={null}
        hookOutput={null}
        onWarningChange={onWarningChange}
        onHookOutputChange={onHookOutputChange}
        onRefresh={onRefresh}
        onError={onError}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Workspace history" })).toBeInTheDocument();
    expect(screen.getByText("Initial import", { selector: ".git-commit-message" })).toBeInTheDocument();
    expect(
      screen.getByText("abc123d", { selector: ".git-commit-row-main .git-commit-hash" }),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.type(screen.getByLabelText("Custom commit message"), "Custom commit");
    await user.click(screen.getByRole("button", { name: "Commit with custom message..." }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(onWarningChange).toHaveBeenLastCalledWith(null);
    expect(onHookOutputChange).toHaveBeenLastCalledWith(null);
    expect(onError).toHaveBeenCalledWith(null);
  });
});
