import type { WorkspaceScreen } from "../components/AppShell";

/** Window event the menu's Save ⌘S dispatches; LedgerEditor listens for it. */
export const MENU_SAVE_EVENT = "diurnum:menu-save";

export type MenuHandlers = {
  navigate: (screen: WorkspaceScreen) => void;
  openSettings: () => void;
  newWorkspace: () => void;
  openWorkspace: () => void;
  openRecentWorkspace: (path: string) => void;
  closeWorkspace: () => void;
  save: () => void;
  openCommandPalette: () => void;
};

const screenByMenuId: Partial<Record<string, WorkspaceScreen>> = {
  "view-ledger": "ledger",
  "view-inbox": "inbox",
  "view-reports": "reports",
  "view-documents": "documents",
  "view-import": "import",
  "view-git": "git",
  "view-settings": "settings",
};

/**
 * Routes a native menu event id to its handler. Returns false for unknown ids
 * — predefined items (quit, copy, minimize, …) also emit menu events with
 * Tauri-internal ids, which must be ignored silently.
 */
export function routeMenuEvent(id: string, handlers: MenuHandlers): boolean {
  if (id.startsWith("recent:")) {
    handlers.openRecentWorkspace(id.slice("recent:".length));
    return true;
  }
  const screen = screenByMenuId[id];
  if (screen) {
    handlers.navigate(screen);
    return true;
  }
  switch (id) {
    case "settings":
      handlers.openSettings();
      return true;
    case "new-workspace":
      handlers.newWorkspace();
      return true;
    case "open-workspace":
      handlers.openWorkspace();
      return true;
    case "close-workspace":
      handlers.closeWorkspace();
      return true;
    case "save":
      handlers.save();
      return true;
    case "command-palette":
      handlers.openCommandPalette();
      return true;
    default:
      return false;
  }
}
