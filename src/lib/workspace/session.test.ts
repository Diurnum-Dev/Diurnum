import { describe, expect, it, vi } from "vitest";
import { createWorkspaceSession, type WorkspaceSessionApi } from "./session";
import type {
  MvpReports,
  SuggestedEntry,
  WorkspaceSummary,
  WorkspaceView,
} from "./types";

const ROOT = "/tmp/ws";

function summary(ledgerStatus: "valid" | "invalid" = "valid"): WorkspaceSummary {
  return {
    rootPath: ROOT,
    businessName: "Acme",
    baseCurrency: "USD",
    booksStartDate: "2026-01-01",
    ledgerStatus,
    ledgerValidation: { status: ledgerStatus, errors: [] },
  };
}

function entry(id: string): SuggestedEntry {
  return {
    kind: "standard",
    statementRowId: id,
    postedDate: "2026-01-04",
    description: `Row ${id}`,
    sourceAccount: "Assets:Bank:Checking",
    sourceAmount: "-10.00",
    sourceFileName: "checking.csv",
    importFingerprint: `fp-${id}`,
    pendingAtImport: false,
    linkedStatementRow: null,
    suggestedLedgerAccount: null,
    categorizationRuleId: null,
    aiSuggestion: null,
  };
}

function emptyView(): WorkspaceView {
  return {
    summary: summary(),
    suggestedEntries: [],
    knownAccounts: ["Assets:Bank:Checking"],
    brokenProvenance: [],
    categorizationRules: [],
    sourceAccounts: [],
    snapshots: [],
    gitStatus: { isRepository: false, branchName: null, uncommittedChangesCount: 0 },
    gitPanel: null,
  };
}

/**
 * A minimal in-memory backend satisfying the session's api seam — the same role
 * the real `__DIURNUM_TEST_API__` fake plays, here exercising the store with no
 * React in sight.
 */
function makeFakeApi(initial: WorkspaceView) {
  let view: WorkspaceView = initial;
  const noopExtras = {
    getAiAdapterConfig: vi.fn(async () => ({ command: null })),
    getAiContextDisclosure: vi.fn(async () => ({
      adapterConfigured: false,
      fieldsSent: [] as string[],
    })),
    detectAiAdapters: vi.fn(async () => []),
    getGitIdentity: vi.fn(async () => ({
      isRepository: false,
      localName: null,
      localEmail: null,
      globalName: null,
      globalEmail: null,
      warning: null,
    })),
  };

  const api = {
    ...noopExtras,
    createWorkspace: vi.fn(async () => view.summary),
    openWorkspace: vi.fn(async () => view.summary),
    getWorkspaceView: vi.fn(async () => view),
    approveSuggestedEntry: vi.fn(async (input: { statementRowId: string; ledgerAccount: string }) => {
      view = {
        ...view,
        suggestedEntries: view.suggestedEntries.filter(
          (e) => e.statementRowId !== input.statementRowId,
        ),
        knownAccounts: [...new Set([...view.knownAccounts, input.ledgerAccount])],
      };
      return view;
    }),
    approveTransferEntry: vi.fn(async () => view),
    revertTransferToStandard: vi.fn(async () => view),
    importStatementRows: vi.fn(async () => {
      view = { ...view, suggestedEntries: [...view.suggestedEntries, entry("imported")] };
      return { sourceAccount: "Assets:Bank:Checking", importedCount: 1, skippedDuplicateCount: 0 };
    }),
    addSourceAccount: vi.fn(async () => view),
    renameSourceAccount: vi.fn(async () => view),
    closeSourceAccount: vi.fn(async () => view),
    updateSourceAccountOpeningBalance: vi.fn(async () => view),
    updateWorkspaceMetadata: vi.fn(async () => view),
    restoreSnapshot: vi.fn(async () => view),
    saveSourceMapping: vi.fn(async () => ({
      sourceAccount: "Assets:Bank:Checking",
      mapping: {
        postedDateColumn: "Date",
        descriptionColumn: "Description",
      },
      updatedAt: "2026-01-01",
    })),
    createCategorizationRule: vi.fn(async () => {
      throw new Error("not used");
    }),
    updateCategorizationRule: vi.fn(async () => {
      throw new Error("not used");
    }),
    enableCategorizationRule: vi.fn(async () => {
      throw new Error("not used");
    }),
    disableCategorizationRule: vi.fn(async () => {
      throw new Error("not used");
    }),
    deleteCategorizationRule: vi.fn(async () => undefined),
    configureAiAdapter: vi.fn(async () => ({ command: null })),
    testAiAdapter: vi.fn(async () => undefined),
    updateGitIdentity: vi.fn(async () => noopExtras.getGitIdentity()),
    getMvpReports: vi.fn(async () => ({} as MvpReports)),
    commitGitChanges: vi.fn(async () => ({
      committed: true,
      commitHash: "abc",
      warning: null,
      hookOutput: null,
    })),
  };

  return {
    api: api as unknown as WorkspaceSessionApi,
    setView: (next: WorkspaceView) => {
      view = next;
    },
    raw: api,
  };
}

describe("WorkspaceSession", () => {
  it("loads the full view on open", async () => {
    const view = { ...emptyView(), suggestedEntries: [entry("a"), entry("b")] };
    const { api } = makeFakeApi(view);
    const session = createWorkspaceSession(api);

    await session.open(ROOT);

    expect(session.getState().workspace?.rootPath).toBe(ROOT);
    expect(session.getState().suggestedEntries).toHaveLength(2);
  });

  it("refreshes the whole view as one unit after Approval", async () => {
    const view = { ...emptyView(), suggestedEntries: [entry("a"), entry("b")] };
    const { api } = makeFakeApi(view);
    const session = createWorkspaceSession(api);
    await session.open(ROOT);

    const result = await session.approve({
      workspaceRootPath: ROOT,
      statementRowId: "a",
      ledgerAccount: "Expenses:Software",
    });

    const state = session.getState();
    expect(state.suggestedEntries.map((e) => e.statementRowId)).toEqual(["b"]);
    expect(state.knownAccounts).toContain("Expenses:Software");
    expect(result.approvedRowId).toBe("a");
    expect(result.ruleOffer).toEqual({
      sourceAccount: "Assets:Bank:Checking",
      matchText: "Row a",
      ledgerAccount: "Expenses:Software",
    });
  });

  it("import refreshes suggested entries and AI disclosure", async () => {
    const { api, raw } = makeFakeApi(emptyView());
    const session = createWorkspaceSession(api);
    await session.open(ROOT);

    await session.importRows({
      workspaceRootPath: ROOT,
      sourceAccount: "Assets:Bank:Checking",
      sourceFileName: "checking.csv",
      csvContents: "Date,Description,Amount\n2026-01-04,X,-10\n",
      mapping: null,
    });

    expect(session.getState().suggestedEntries).toHaveLength(1);
    // disclosure refreshed once on open, once after import
    expect(raw.getAiContextDisclosure).toHaveBeenCalledTimes(2);
  });

  it("clears reports when the refreshed ledger is invalid", async () => {
    const { api, setView } = makeFakeApi(emptyView());
    const session = createWorkspaceSession(api);
    await session.open(ROOT);
    await session.loadReports({ periodStart: "2026-01-01", periodEnd: "2026-01-31" });
    expect(session.getState().reports).not.toBeNull();

    setView({ ...emptyView(), summary: summary("invalid") });
    await session.validate();

    expect(session.getState().reports).toBeNull();
  });

  it("records a user-facing error and rethrows so forms can react", async () => {
    const { api, raw } = makeFakeApi(emptyView());
    raw.updateWorkspaceMetadata.mockRejectedValueOnce({
      code: "io",
      message: "disk on fire",
    });
    const session = createWorkspaceSession(api);
    await session.open(ROOT);

    await expect(
      session.updateMetadata({
        workspaceRootPath: ROOT,
        businessName: "New",
        booksStartDate: "2026-01-01",
      }),
    ).rejects.toBeTruthy();
    expect(session.getState().error).toBe("disk on fire");
  });

  it("notifies subscribers on state change", async () => {
    const { api } = makeFakeApi(emptyView());
    const session = createWorkspaceSession(api);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    await session.open(ROOT);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const callsAfterUnsub = listener.mock.calls.length;
    session.setError("x");
    expect(listener.mock.calls.length).toBe(callsAfterUnsub);
  });
});
