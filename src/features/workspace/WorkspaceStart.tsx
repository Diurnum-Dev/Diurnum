type WorkspaceStartProps = {
  onCreate: () => void;
  onOpen: () => void;
  error?: string | null;
};

export function WorkspaceStart({ onCreate, onOpen, error }: WorkspaceStartProps) {
  return (
    <section className="workspace-start" aria-labelledby="workspace-start-title">
      <div className="workspace-start__content">
        <p className="eyebrow">App-Created Workspace</p>
        <h1 id="workspace-start-title">Open your local accounting Workspace</h1>
        <p className="intro">
          Create or reopen a Diurnum Workspace for an MVP Business. Your
          Beancount ledger and Diurnum-managed local data stay in the folder
          you choose.
        </p>
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onCreate}>
            Create Workspace
          </button>
          <button className="secondary-button" type="button" onClick={onOpen}>
            Open Workspace
          </button>
        </div>
      </div>
    </section>
  );
}
