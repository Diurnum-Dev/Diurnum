import { describe, expect, it, vi } from "vitest";
import { MENU_SAVE_EVENT, routeMenuEvent, type MenuHandlers } from "./menu";

function makeHandlers(): MenuHandlers {
  return {
    navigate: vi.fn(),
    openSettings: vi.fn(),
    newWorkspace: vi.fn(),
    openWorkspace: vi.fn(),
    openRecentWorkspace: vi.fn(),
    closeWorkspace: vi.fn(),
    save: vi.fn(),
    openCommandPalette: vi.fn(),
  };
}

describe("routeMenuEvent", () => {
  it("routes view items to navigation", () => {
    const handlers = makeHandlers();
    expect(routeMenuEvent("view-inbox", handlers)).toBe(true);
    expect(handlers.navigate).toHaveBeenCalledWith("inbox");
    expect(routeMenuEvent("view-git", handlers)).toBe(true);
    expect(handlers.navigate).toHaveBeenCalledWith("git");
  });

  it("routes recent workspace items with the full path", () => {
    const handlers = makeHandlers();
    expect(routeMenuEvent("recent:/Users/me/Books/Acme", handlers)).toBe(true);
    expect(handlers.openRecentWorkspace).toHaveBeenCalledWith(
      "/Users/me/Books/Acme",
    );
  });

  it("routes file and app actions", () => {
    const handlers = makeHandlers();
    routeMenuEvent("settings", handlers);
    routeMenuEvent("new-workspace", handlers);
    routeMenuEvent("open-workspace", handlers);
    routeMenuEvent("close-workspace", handlers);
    routeMenuEvent("save", handlers);
    routeMenuEvent("command-palette", handlers);
    expect(handlers.openSettings).toHaveBeenCalledOnce();
    expect(handlers.newWorkspace).toHaveBeenCalledOnce();
    expect(handlers.openWorkspace).toHaveBeenCalledOnce();
    expect(handlers.closeWorkspace).toHaveBeenCalledOnce();
    expect(handlers.save).toHaveBeenCalledOnce();
    expect(handlers.openCommandPalette).toHaveBeenCalledOnce();
  });

  it("silently ignores unknown ids (predefined menu items emit events too)", () => {
    const handlers = makeHandlers();
    expect(routeMenuEvent("nope", handlers)).toBe(false);
    for (const fn of Object.values(handlers)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("exports the save bridge event name", () => {
    expect(MENU_SAVE_EVENT).toBe("diurnum:menu-save");
  });
});
