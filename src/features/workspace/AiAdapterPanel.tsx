import { useState } from "react";
import type { FormEvent } from "react";
import type {
  AiAdapterConfig,
  AiContextDisclosure,
  DetectedAiAdapter,
} from "../../lib/workspace/types";

type AiAdapterPanelProps = {
  config: AiAdapterConfig;
  disclosure: AiContextDisclosure;
  onConfigure: (command: string | null) => Promise<void> | void;
  onTest?: () => Promise<void> | void;
  detectedAdapters?: DetectedAiAdapter[];
};

export function AiAdapterPanel({
  config,
  disclosure,
  onConfigure,
  onTest,
  detectedAdapters = [],
}: AiAdapterPanelProps) {
  const [command, setCommand] = useState(config.command || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfigure(command.trim() || null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="ai-adapter" aria-labelledby="ai-adapter-title">
      <div className="section-heading">
        <p className="eyebrow">BYO AI Adapter</p>
        <h2 id="ai-adapter-title">Optional local suggestions</h2>
      </div>

      <form className="workspace-form" onSubmit={handleSubmit}>
        <label>
          Adapter Command
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="/path/to/adapter"
          />
        </label>
        <button className="secondary-button" type="submit" disabled={isSubmitting}>
          Save Adapter
        </button>
      </form>

      {detectedAdapters.length > 0 ? (
        <div className="adapter-detection">
          <p className="eyebrow">Detected adapters</p>
          <ul>
            {detectedAdapters.map((adapter) => (
              <li key={adapter.command}>
                <strong>{adapter.name}</strong>
                <span>{adapter.available ? adapter.commandPath ?? adapter.command : "Not found"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onTest ? (
        <div className="action-row">
          <button
            className="secondary-button"
            type="button"
            onClick={async () => {
              setIsTesting(true);
              try {
                await onTest();
              } finally {
                setIsTesting(false);
              }
            }}
            disabled={isTesting}
          >
            {isTesting ? "Testing..." : "Test Adapter"}
          </button>
        </div>
      ) : null}

      <div className="ai-disclosure">
        <p className="eyebrow">AI Context Disclosure</p>
        <p>{disclosure.adapterConfigured ? "Adapter configured" : "No adapter configured"}</p>
        <ul>
          {disclosure.fieldsSent.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
