import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";
import type { ComponentProps } from "react";

const detectedAdapters = [
  {
    name: "Claude Code",
    command: "claude --print",
    available: true,
    commandPath: "/usr/local/bin/claude",
  },
  {
    name: "Codex CLI",
    command: "codex exec",
    available: false,
    commandPath: null,
  },
];

function buildProps(
  overrides: Partial<ComponentProps<typeof SettingsPanel>> = {},
): ComponentProps<typeof SettingsPanel> {
  return {
    workspace: {
      rootPath: "/tmp/workspace",
      businessName: "Test Business",
      baseCurrency: "USD",
      booksStartDate: "2026-01-01",
      ledgerStatus: "valid",
      ledgerValidation: { status: "valid", errors: [] },
    },
    sourceAccounts: [],
    detectedAdapters,
    gitIdentity: {
      isRepository: false,
      localName: null,
      localEmail: null,
      globalName: null,
      globalEmail: null,
      warning: null,
    },
    aiAdapterConfig: { command: null },
    aiContextDisclosure: { adapterConfigured: false, fieldsSent: [] },
    categorizationRules: [],
    snapshots: [],
    updatePrefs: { checkOnLaunch: true, lastCheckedAt: null },
    updateCheckInProgress: false,
    onReveal: vi.fn(),
    onOpenAnother: vi.fn(),
    onUpdateWorkspaceMetadata: vi.fn(),
    onAddSourceAccount: vi.fn(),
    onRenameSourceAccount: vi.fn(),
    onCloseSourceAccount: vi.fn(),
    onUpdateSourceAccountOpeningBalance: vi.fn(),
    onSaveSourceMapping: vi.fn(),
    onConfigureAiAdapter: vi.fn().mockResolvedValue(undefined),
    onTestAiAdapter: vi.fn(),
    onUpdateGitIdentity: vi.fn(),
    onRestoreSnapshot: vi.fn(),
    onUpdatePrefsChange: vi.fn(),
    onCheckForUpdates: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe("SettingsPanel AI Adapter section", () => {
  it("persists the adapter selection when a detected adapter is chosen", async () => {
    const user = userEvent.setup();
    const onConfigureAiAdapter = vi.fn().mockResolvedValue(undefined);

    render(<SettingsPanel {...buildProps({ onConfigureAiAdapter })} />);

    await user.click(screen.getByRole("radio", { name: /Claude Code/ }));

    expect(onConfigureAiAdapter).toHaveBeenCalledWith("claude --print");
  });

  it("marks the configured adapter as selected", () => {
    render(
      <SettingsPanel {...buildProps({ aiAdapterConfig: { command: "claude --print" } })} />,
    );

    expect(screen.getByRole("radio", { name: /Claude Code/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Codex CLI/ })).not.toBeChecked();
  });
});
