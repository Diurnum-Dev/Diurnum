import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import {
  addSourceAccount,
  approveTransferEntry,
  approveSuggestedEntry,
  configureAiAdapter,
  createCategorizationRule,
  createWorkspace,
  getAiAdapterConfig,
  getAiContextDisclosure,
  getBrokenProvenance,
  getMvpReports,
  getSuggestedEntries,
  importStatementRows,
  listCategorizationRules,
  openWorkspace,
  pickDirectory,
  revealWorkspace,
  updateCategorizationRule,
  validateWorkspace,
} from "./lib/workspace/api";
import type {
  AiAdapterConfig,
  AiContextDisclosure,
  CategorizationRule,
  CsvSourceMappingInput,
  BrokenProvenance,
  MvpReports,
  SourceAccountKind,
  SuggestedEntry,
  WorkspaceCreateInput,
  WorkspaceSummary,
} from "./lib/workspace/types";
import { CreateWorkspaceForm } from "./features/workspace/CreateWorkspaceForm";
import { OpenWorkspaceForm } from "./features/workspace/OpenWorkspaceForm";
import { WorkspaceOverview } from "./features/workspace/WorkspaceOverview";
import { WorkspaceStart } from "./features/workspace/WorkspaceStart";
import type { CategorizationRuleOffer } from "./features/workspace/CategorizationRulesPanel";

type View = "start" | "create" | "open" | "overview";

function userFacingError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Diurnum could not complete that Workspace action.";
}

export default function App() {
  const [view, setView] = useState<View>("start");
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [suggestedEntries, setSuggestedEntries] = useState<SuggestedEntry[]>([]);
  const [brokenProvenance, setBrokenProvenance] = useState<BrokenProvenance[]>([]);
  const [categorizationRules, setCategorizationRules] = useState<CategorizationRule[]>([]);
  const [ruleOffer, setRuleOffer] = useState<CategorizationRuleOffer | null>(null);
  const [aiAdapterConfig, setAiAdapterConfig] = useState<AiAdapterConfig>({ command: null });
  const [aiContextDisclosure, setAiContextDisclosure] = useState<AiContextDisclosure>({
    adapterConfigured: false,
    fieldsSent: [],
  });
  const [reports, setReports] = useState<MvpReports | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(input: WorkspaceCreateInput) {
    setError(null);
    try {
      const created = await createWorkspace(input);
      setWorkspace(created);
      setSuggestedEntries([]);
      setBrokenProvenance([]);
      setCategorizationRules([]);
      setRuleOffer(null);
      setAiAdapterConfig({ command: null });
      setAiContextDisclosure(await getAiContextDisclosure(created.rootPath));
      setReports(null);
      setView("overview");
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleOpenWorkspace(path: string) {
    setError(null);
    try {
      const opened = await openWorkspace(path);
      setWorkspace(opened);
      setSuggestedEntries(await getSuggestedEntries(opened.rootPath));
      setBrokenProvenance(await getBrokenProvenance(opened.rootPath));
      setCategorizationRules(await listCategorizationRules(opened.rootPath));
      setAiAdapterConfig(await getAiAdapterConfig(opened.rootPath));
      setAiContextDisclosure(await getAiContextDisclosure(opened.rootPath));
      setRuleOffer(null);
      setReports(null);
      setView("overview");
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleReveal() {
    if (!workspace) return;
    setError(null);
    try {
      await revealWorkspace(workspace.rootPath);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleValidateWorkspace() {
    if (!workspace) return;
    setError(null);
    try {
      const ledgerValidation = await validateWorkspace(workspace.rootPath);
      setWorkspace({
        ...workspace,
        ledgerStatus: ledgerValidation.status,
        ledgerValidation,
      });
      setBrokenProvenance(await getBrokenProvenance(workspace.rootPath));
      if (ledgerValidation.status === "invalid") {
        setReports(null);
      }
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleAddSourceAccount(input: {
    kind: SourceAccountKind;
    name: string;
    openingBalance: string | null;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await addSourceAccount({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setWorkspace(updated);
      setSuggestedEntries(await getSuggestedEntries(updated.rootPath));
      setBrokenProvenance(await getBrokenProvenance(updated.rootPath));
      setCategorizationRules(await listCategorizationRules(updated.rootPath));
      setReports(null);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleImportStatementRows(input: {
    sourceAccount: string;
    sourceFileName: string;
    csvContents: string;
    mapping: CsvSourceMappingInput;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      await importStatementRows({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      await handleValidateWorkspace();
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
      setBrokenProvenance(await getBrokenProvenance(workspace.rootPath));
      setCategorizationRules(await listCategorizationRules(workspace.rootPath));
      setAiContextDisclosure(await getAiContextDisclosure(workspace.rootPath));
      setReports(null);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleApproveSuggestedEntry(input: {
    statementRowId: string;
    ledgerAccount: string;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await approveSuggestedEntry({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setWorkspace(updated);
      setSuggestedEntries(await getSuggestedEntries(updated.rootPath));
      setBrokenProvenance(await getBrokenProvenance(updated.rootPath));
      setCategorizationRules(await listCategorizationRules(updated.rootPath));
      setReports(null);
      const approvedEntry = suggestedEntries.find(
        (entry) => entry.statementRowId === input.statementRowId,
      );
      if (approvedEntry) {
        setRuleOffer({
          sourceAccount: approvedEntry.sourceAccount,
          matchText: approvedEntry.description,
          ledgerAccount: input.ledgerAccount,
        });
      }
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleApproveTransferEntry(input: {
    statementRowId: string;
    linkedStatementRowId: string;
  }) {
    if (!workspace) return;
    setError(null);
    try {
      const updated = await approveTransferEntry({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setWorkspace(updated);
      setSuggestedEntries(await getSuggestedEntries(updated.rootPath));
      setBrokenProvenance(await getBrokenProvenance(updated.rootPath));
      setCategorizationRules(await listCategorizationRules(updated.rootPath));
      setRuleOffer(null);
      setReports(null);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleCreateCategorizationRule(input: CategorizationRuleOffer) {
    if (!workspace) return;
    setError(null);
    try {
      await createCategorizationRule({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setCategorizationRules(await listCategorizationRules(workspace.rootPath));
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
      setRuleOffer(null);
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleUpdateCategorizationRule(
    input: CategorizationRuleOffer & { id: string },
  ) {
    if (!workspace) return;
    setError(null);
    try {
      await updateCategorizationRule({
        workspaceRootPath: workspace.rootPath,
        ...input,
      });
      setCategorizationRules(await listCategorizationRules(workspace.rootPath));
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleConfigureAiAdapter(command: string | null) {
    if (!workspace) return;
    setError(null);
    try {
      const config = await configureAiAdapter({
        workspaceRootPath: workspace.rootPath,
        command,
      });
      setAiAdapterConfig(config);
      setAiContextDisclosure(await getAiContextDisclosure(workspace.rootPath));
      setSuggestedEntries(await getSuggestedEntries(workspace.rootPath));
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  async function handleLoadReports(input: { periodStart: string; periodEnd: string }) {
    if (!workspace) return;
    setError(null);
    try {
      setReports(
        await getMvpReports({
          workspaceRootPath: workspace.rootPath,
          ...input,
        }),
      );
    } catch (caught) {
      setError(userFacingError(caught));
    }
  }

  useEffect(() => {
    if (view !== "overview" || !workspace) return;

    function revalidateOnFocus() {
      void handleValidateWorkspace();
    }

    window.addEventListener("focus", revalidateOnFocus);
    return () => window.removeEventListener("focus", revalidateOnFocus);
  }, [view, workspace?.rootPath]);

  return (
    <AppShell>
      {view === "start" ? (
        <WorkspaceStart
          onCreate={() => {
            setError(null);
            setView("create");
          }}
          onOpen={() => {
            setError(null);
            setView("open");
          }}
          error={error}
        />
      ) : null}

      {view === "create" ? (
        <CreateWorkspaceForm
          onCancel={() => {
            setError(null);
            setView("start");
          }}
          onChooseDirectory={pickDirectory}
          onCreate={handleCreate}
          error={error}
        />
      ) : null}

      {view === "open" ? (
        <OpenWorkspaceForm
          onCancel={() => {
            setError(null);
            setView("start");
          }}
          onChooseDirectory={pickDirectory}
          onOpen={handleOpenWorkspace}
          error={error}
        />
      ) : null}

      {view === "overview" && workspace ? (
        <WorkspaceOverview
          workspace={workspace}
          suggestedEntries={suggestedEntries}
          brokenProvenance={brokenProvenance}
          categorizationRules={categorizationRules}
          categorizationRuleOffer={ruleOffer}
          aiAdapterConfig={aiAdapterConfig}
          aiContextDisclosure={aiContextDisclosure}
          reports={reports}
          onReveal={handleReveal}
          onValidate={handleValidateWorkspace}
          onAddSourceAccount={handleAddSourceAccount}
          onImportStatementRows={handleImportStatementRows}
          onApproveSuggestedEntry={handleApproveSuggestedEntry}
          onApproveTransferEntry={handleApproveTransferEntry}
          onCreateCategorizationRule={handleCreateCategorizationRule}
          onUpdateCategorizationRule={handleUpdateCategorizationRule}
          onDismissCategorizationRuleOffer={() => setRuleOffer(null)}
          onConfigureAiAdapter={handleConfigureAiAdapter}
          onLoadReports={handleLoadReports}
          onOpenAnother={() => {
            setError(null);
            setView("open");
          }}
          error={error}
        />
      ) : null}
    </AppShell>
  );
}
