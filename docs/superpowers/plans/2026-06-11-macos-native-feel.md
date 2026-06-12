# macOS Native Look & Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Diurnum look, feel, and behave like a native macOS app: hidden title bar with traffic lights over a full-height vibrancy sidebar, system font chrome, a real menu bar with shortcuts, de-webified interaction, window state memory, and a Dock badge.

**Architecture:** Tauri 2 window config provides the chrome (overlay title bar, transparent window, NSVisualEffectView sidebar material); the webview paints opaque parchment over the content area and leaves the sidebar translucent. A Rust `menu` module builds the full menu bar and rebuilds it on a `sync_app_menu` command from the frontend; custom menu items emit a single `menu` event routed by a pure TypeScript router. CSS handles de-webification.

**Tech Stack:** Tauri 2.11, React 18, Vite, vitest + @testing-library/react, CodeMirror 6.

**Spec:** `docs/superpowers/specs/2026-06-11-macos-native-feel-design.md`

**Conflicts discovered during planning (already resolved in this plan):**
- CodeMirror binds `Mod-s` (save) and `Mod-w` (close tab). Native menu accelerators intercept before the webview, so: the menu's Save ⌘S re-enters the editor via a `diurnum:menu-save` window event, and **no menu item uses ⌘W** (no Close Window item; Close Workspace is ⇧⌘W) so the editor keeps its close-tab binding.
- The sidebar is a flex column with `justify-content: space-between`; adding the titlebar drag header requires switching to `flex-start` + `margin-top: auto` on the footer.

---

### Task 1: Upgrade Tauri dependencies

The repo pins Tauri at exactly 2.0.0. `trafficLightPosition`, `setBadgeCount`, and `isTauri()` need current 2.x.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json` (via npm commands)

- [ ] **Step 1: Update Cargo.toml dependency versions**

In `src-tauri/Cargo.toml`, change:

```toml
[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# ... unchanged lines ...
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
```

(Only the three `=2.0.0` pins change to `"2"`; everything else stays.)

- [ ] **Step 2: Update npm packages**

```bash
cd /Users/ryenski/Projects/Diurnum
npm install @tauri-apps/api@^2.11.0 @tauri-apps/plugin-dialog@latest @tauri-apps/plugin-opener@latest
npm install -D @tauri-apps/cli@^2.11.2
```

- [ ] **Step 3: Update the Rust lockfile and compile**

```bash
cd /Users/ryenski/Projects/Diurnum/src-tauri && cargo update && cargo check
```

Expected: compiles with no errors (warnings OK).

- [ ] **Step 4: Run frontend checks**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run typecheck && npm test
```

Expected: PASS. If `@tauri-apps/api` 2.11 surfaces type errors in `src/lib/workspace/api.ts`, fix them minimally (the `invoke`/`open`/`openPath` signatures are stable; errors are unlikely).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock package.json package-lock.json
git commit -m "chore: upgrade Tauri to current 2.x"
```

---

### Task 2: System font chrome + de-webified CSS

**Files:**
- Modify: `src/styles.css:1-9` (font import, root font), plus a mechanical cursor sweep and an appended block
- Modify: `src/styles/tokens.css:83-85` (`--font-sans`)

- [ ] **Step 1: Replace the webfont import and root font stack**

In `src/styles.css`, replace lines 1–9:

```css
@import url("https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&display=swap");

:root {
  color: #1C1A17;
  background: transparent;
  font-family:
    -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
}
```

(Source Sans 3 is dropped from the Google Fonts URL; Spectral stays. `background` becomes `transparent` — Task 4 paints the opaque surfaces.)

- [ ] **Step 2: Update the token**

In `src/styles/tokens.css`, replace the `--font-sans` value:

```css
  --font-sans:
    -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
```

- [ ] **Step 3: Verify no other Source Sans 3 references**

```bash
grep -rn "Source Sans" /Users/ryenski/Projects/Diurnum/src /Users/ryenski/Projects/Diurnum/index.html
```

Expected: no matches. If any remain, replace each with the system stack above.

- [ ] **Step 4: Sweep web cursors**

macOS apps use the arrow cursor on buttons (the pointing hand is for links) and don't use `not-allowed`:

```bash
sed -i '' 's/cursor: pointer;/cursor: default;/g; s/cursor: not-allowed;/cursor: default;/g' /Users/ryenski/Projects/Diurnum/src/styles.css
```

- [ ] **Step 5: Append the de-webify block to the end of `src/styles.css`**

```css
/* ============================================================
   Native chrome behavior — Diurnum is a macOS app, not a page.
   ============================================================ */
html,
body {
  overscroll-behavior: none;
}

body {
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}

input,
textarea,
select,
[contenteditable="true"],
.cm-editor {
  user-select: text;
  -webkit-user-select: text;
}

button:focus {
  outline: none;
}

button:focus-visible {
  outline: 2px solid #243B6B;
  outline-offset: 1px;
}
```

- [ ] **Step 6: Run checks**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run typecheck && npm test
```

Expected: PASS (CSS-only change; tests don't assert cursors or fonts).

- [ ] **Step 7: Commit**

```bash
git add src/styles.css src/styles/tokens.css
git commit -m "feat: system font chrome and de-webified selection, cursors, focus"
```

---

### Task 3: Window chrome config + window-state plugin

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml` (feature + plugin dep)
- Modify: `src-tauri/src/lib.rs` (plugin registration only)

- [ ] **Step 1: Add the macos-private-api feature and window-state plugin**

In `src-tauri/Cargo.toml`:

```toml
tauri = { version = "2", features = ["macos-private-api"] }
tauri-plugin-window-state = "2"
```

- [ ] **Step 2: Update tauri.conf.json**

Replace the `"app"` section:

```json
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "title": "Diurnum",
        "width": 1180,
        "height": 780,
        "minWidth": 880,
        "minHeight": 620,
        "titleBarStyle": "Overlay",
        "hiddenTitle": true,
        "transparent": true,
        "trafficLightPosition": { "x": 18, "y": 18 },
        "windowEffects": {
          "effects": ["sidebar"],
          "state": "followsWindowActiveState"
        }
      }
    ]
  },
```

- [ ] **Step 3: Register the window-state plugin**

In `src-tauri/src/lib.rs`, after `.plugin(tauri_plugin_opener::init())`:

```rust
        .plugin(tauri_plugin_window_state::Builder::default().build())
```

- [ ] **Step 4: Compile and validate config**

```bash
cd /Users/ryenski/Projects/Diurnum/src-tauri && cargo check
```

Expected: PASS. If the config schema rejects a key (e.g., `trafficLightPosition`), run `npm run tauri dev` to see the exact validation error and check the key name against the installed schema in `src-tauri/gen/schemas/desktop-schema.json`.

- [ ] **Step 5: Manual smoke test**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run dev
```

Expected: window opens with no title bar; traffic lights overlay the top-left of the content (overlap with the workspace switcher is expected — Task 4 fixes the layout); quitting and relaunching restores window size/position.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "feat: hidden title bar, vibrancy sidebar material, window state memory"
```

---

### Task 4: Full-height sidebar layout, drag regions, transparent surfaces

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/App.tsx` (standalone views: start/create/open)
- Modify: `src/styles.css`
- Test: `src/components/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/AppShell.test.tsx`:

```tsx
it("renders window drag regions for the hidden title bar", () => {
  renderShell();
  expect(
    document.querySelector(".sidebar-titlebar[data-tauri-drag-region]"),
  ).not.toBeNull();
  expect(
    document.querySelector(".window-drag-strip[data-tauri-drag-region]"),
  ).not.toBeNull();
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/ryenski/Projects/Diurnum && npx vitest run src/components/AppShell.test.tsx
```

Expected: FAIL — both queries return null.

- [ ] **Step 3: Add drag regions to AppShell.tsx**

First child of `<aside className="sidebar" …>` (before `<div className="sidebar-stack">`):

```tsx
        <div className="sidebar-titlebar" data-tauri-drag-region />
```

First child of `<main className={`shell-main…`}>` (before the `main-pane` div):

```tsx
        <div className="window-drag-strip" data-tauri-drag-region />
```

- [ ] **Step 4: Add a drag strip to the three standalone views in App.tsx**

In each of the `view === "start"`, `view === "create"`, and `view === "open"` returns, add the strip between `{updateBanner}` and `<main className="main-pane standalone-pane">`:

```tsx
        {updateBanner}
        <div className="window-drag-strip" data-tauri-drag-region />
        <main className="main-pane standalone-pane">
```

- [ ] **Step 5: Update styles.css for the full-height translucent sidebar**

Change these existing rules (current values shown in Task context; only listed properties change):

```css
.app-shell--workspace {
  grid-template-columns: 200px minmax(0, 1fr);
  background: transparent;
}

.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  border-right: 1px solid #EDEAE4;
  background: rgba(251, 246, 236, 0.55);
  padding: 28px 24px;
}

.app-shell--workspace .sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  min-width: 0;
  padding: 0 14px 16px;
}

.sidebar-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  margin-top: auto;
  padding: 12px 4px 0;
}

.shell-main {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 100vh;
  background: #FEFCF8;
}

.standalone-pane {
  min-height: 100vh;
  background: rgba(254, 252, 248, 0.86);
}
```

And add these new rules (near the `.sidebar` rules):

```css
.sidebar-titlebar {
  height: 52px;
  flex: 0 0 auto;
  margin: 0 -14px;
}

.window-drag-strip {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  height: 16px;
  z-index: 60;
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /Users/ryenski/Projects/Diurnum && npx vitest run src/components/AppShell.test.tsx
```

Expected: PASS (all tests in the file, not just the new one).

- [ ] **Step 7: Full check + manual smoke test**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run typecheck && npm test && npm run dev
```

Expected: traffic lights sit inside the sidebar's 52px header with no overlap; desktop blurs through the sidebar with a warm tint; content area is opaque parchment; dragging from the sidebar header or the top strip moves the window; the welcome screen shows a frosted parchment surface and is draggable from its top strip. Tune the sidebar tint alpha (0.55) and `.standalone-pane` alpha (0.86) by eye if the parchment reads too gray or too opaque.

- [ ] **Step 8: Commit**

```bash
git add src/components/AppShell.tsx src/components/AppShell.test.tsx src/App.tsx src/styles.css
git commit -m "feat: full-height vibrancy sidebar with drag regions"
```

---

### Task 5: Native window behaviors (context menu, inactive dimming)

**Files:**
- Create: `src/lib/native.ts`
- Test: `src/lib/native.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/styles.css` (dimming rule)

- [ ] **Step 1: Write the failing test**

Create `src/lib/native.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isEditableTarget } from "./native";

describe("isEditableTarget", () => {
  it("treats inputs, textareas, and contenteditable as editable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.appendChild(child);
    document.body.append(input, textarea, editable);

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(child)).toBe(true);
  });

  it("treats CodeMirror content as editable", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const line = document.createElement("div");
    editor.appendChild(line);
    document.body.appendChild(editor);

    expect(isEditableTarget(line)).toBe(true);
  });

  it("treats chrome elements and null as not editable", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);

    expect(isEditableTarget(button)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/ryenski/Projects/Diurnum && npx vitest run src/lib/native.test.ts
```

Expected: FAIL — module `./native` does not exist.

- [ ] **Step 3: Implement `src/lib/native.ts`**

```ts
import { isTauri } from "@tauri-apps/api/core";

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], .cm-editor';

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

/**
 * One-time setup for native-feeling window behavior. No-op outside Tauri so
 * vitest and Playwright runs are unaffected.
 */
export function initNativeChrome(): void {
  if (!isTauri()) return;

  window.addEventListener("contextmenu", (event) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  });

  window.addEventListener("blur", () => {
    document.body.classList.add("window-blurred");
  });
  window.addEventListener("focus", () => {
    document.body.classList.remove("window-blurred");
  });
}
```

- [ ] **Step 4: Call it from `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initNativeChrome } from "./lib/native";
import "./styles.css";

initNativeChrome();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 5: Add the inactive-window dimming rule to `src/styles.css`** (next to the `.sidebar-titlebar` rule)

```css
body.window-blurred .sidebar-stack,
body.window-blurred .sidebar-footer {
  opacity: 0.6;
}
```

- [ ] **Step 6: Run the tests**

```bash
cd /Users/ryenski/Projects/Diurnum && npx vitest run src/lib/native.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/native.ts src/lib/native.test.ts src/main.tsx src/styles.css
git commit -m "feat: suppress web context menu, dim sidebar when window inactive"
```

---

### Task 6: Native menu bar (Rust)

**Files:**
- Create: `src-tauri/src/menu.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/menu.rs`**

```rust
use serde::Deserialize;
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspaceEntry {
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMenuState {
    pub workspace_open: bool,
    pub git_available: bool,
    #[serde(default)]
    pub recents: Vec<RecentWorkspaceEntry>,
}

/// Rebuilds and installs the full application menu. Called at startup with
/// defaults and again from the frontend (via `sync_app_menu`) whenever the
/// workspace/git/recents state changes. Rebuilding the whole menu is the
/// simplest way to keep enabled states and the Open Recent list correct.
pub fn build_app_menu<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppMenuState,
) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "Diurnum")
        .about(Some(AboutMetadata::default()))
        .separator()
        .item(
            &MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("Cmd+,")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let mut open_recent = SubmenuBuilder::new(app, "Open Recent");
    for recent in &state.recents {
        open_recent = open_recent.item(
            &MenuItemBuilder::with_id(
                format!("recent:{}", recent.path),
                &recent.display_name,
            )
            .build(app)?,
        );
    }
    let open_recent = open_recent.build()?;

    // No menu item may use Cmd+W: the ledger editor binds it to close-tab,
    // and native accelerators intercept before the webview sees the key.
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("new-workspace", "New Workspace")
                .accelerator("Shift+Cmd+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open-workspace", "Open Workspace…")
                .accelerator("Cmd+O")
                .build(app)?,
        )
        .item(&open_recent)
        .separator()
        .item(
            &MenuItemBuilder::with_id("close-workspace", "Close Workspace")
                .accelerator("Shift+Cmd+W")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("save", "Save")
                .accelerator("Cmd+S")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let screens: [(&str, &str, &str); 7] = [
        ("view-ledger", "Ledger", "Cmd+1"),
        ("view-inbox", "Inbox", "Cmd+2"),
        ("view-reports", "Reports", "Cmd+3"),
        ("view-documents", "Documents", "Cmd+4"),
        ("view-import", "Import", "Cmd+5"),
        ("view-git", "Git", "Cmd+6"),
        ("view-settings", "Settings", "Cmd+7"),
    ];
    let mut view_builder = SubmenuBuilder::new(app, "View");
    for (id, label, accelerator) in screens {
        let enabled =
            state.workspace_open && (id != "view-git" || state.git_available);
        view_builder = view_builder.item(
            &MenuItemBuilder::with_id(id, label)
                .accelerator(accelerator)
                .enabled(enabled)
                .build(app)?,
        );
    }
    let view_menu = view_builder
        .separator()
        .item(
            &MenuItemBuilder::with_id("command-palette", "Command Palette…")
                .accelerator("Cmd+K")
                .enabled(state.workspace_open)
                .build(app)?,
        )
        .separator()
        .fullscreen()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

#[tauri::command]
pub fn sync_app_menu(app: AppHandle, state: AppMenuState) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    build_app_menu(&app, &state).map_err(|err| err.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = (app, state);
    Ok(())
}
```

- [ ] **Step 2: Rewire `src-tauri/src/lib.rs`**

Add the module and replace the existing macOS menu block in `setup` (the
`use tauri::menu::{MenuBuilder, SubmenuBuilder};` block building the
Diurnum/Edit menus) with a call to the new builder; add `on_menu_event`:

```rust
pub mod commands;
pub mod menu;
pub mod workspace;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // The native menu doubles as the macOS keyboard-shortcut surface:
            // WKWebView only processes ⌘-shortcuts that exist in the NSApp menu.
            #[cfg(target_os = "macos")]
            menu::build_app_menu(app.handle(), &menu::AppMenuState::default())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            use tauri::Emitter;
            let _ = app.emit("menu", event.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![
            menu::sync_app_menu,
            commands::workspace::create_workspace,
            // ... all existing entries stay unchanged ...
        ])
        .run(tauri::generate_context!())
        .expect("error while running Diurnum");
}
```

(Keep every existing `commands::workspace::*` entry; only `menu::sync_app_menu` is added.)

- [ ] **Step 3: Compile**

```bash
cd /Users/ryenski/Projects/Diurnum/src-tauri && cargo check
```

Expected: PASS. If a `SubmenuBuilder` convenience method differs in the installed version (e.g., `maximize` vs `zoom`), check `cargo doc` or the tauri 2.11 source for `tauri::menu::SubmenuBuilder` and use the documented name.

- [ ] **Step 4: Manual smoke test**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run dev
```

Expected: full menu bar (Diurnum, File, Edit, View, Window); Save/Close Workspace/View items disabled (no workspace synced yet); copy/paste still works in inputs; About panel opens.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/lib.rs
git commit -m "feat: full native macOS menu bar with sync_app_menu command"
```

---

### Task 7: Frontend menu routing, ⌘S save bridge, menu state sync

**Files:**
- Create: `src/lib/menu.ts`
- Test: `src/lib/menu.test.ts`
- Modify: `src/lib/workspace/api.ts` (add `syncAppMenu`)
- Modify: `src/App.tsx`
- Modify: `src/features/workspace/LedgerEditor.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/menu.test.ts`:

```ts
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

  it("returns false for unknown ids", () => {
    expect(routeMenuEvent("nope", makeHandlers())).toBe(false);
  });

  it("exports the save bridge event name", () => {
    expect(MENU_SAVE_EVENT).toBe("diurnum:menu-save");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /Users/ryenski/Projects/Diurnum && npx vitest run src/lib/menu.test.ts
```

Expected: FAIL — module `./menu` does not exist.

- [ ] **Step 3: Implement `src/lib/menu.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/ryenski/Projects/Diurnum && npx vitest run src/lib/menu.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add `syncAppMenu` to `src/lib/workspace/api.ts`**

At the end of the file:

```ts
export type AppMenuSyncState = {
  workspaceOpen: boolean;
  gitAvailable: boolean;
  recents: Array<{ path: string; displayName: string }>;
};

export async function syncAppMenu(state: AppMenuSyncState): Promise<void> {
  if (window.__DIURNUM_TEST_API__) return;
  await invoke("sync_app_menu", { state });
}
```

- [ ] **Step 6: Wire menu events and menu sync in `src/App.tsx`**

Add imports:

```ts
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MENU_SAVE_EVENT, routeMenuEvent, type MenuHandlers } from "./lib/menu";
```

(Add `syncAppMenu` to the existing `./lib/workspace/api` import list.)

Inside `App()`, after the existing handler functions (e.g., below
`recordRecentCommand`), add — the handlers ref keeps the event subscription
stable while always routing to fresh closures:

```ts
  const menuHandlersRef = useRef<MenuHandlers | null>(null);
  menuHandlersRef.current = {
    navigate: handleNavigate,
    openSettings: () => handleNavigate("settings"),
    newWorkspace: handleCreateBlankWorkspace,
    openWorkspace: () => void handleWelcomeOpenExistingWorkspace(),
    openRecentWorkspace: (path) => void handleOpenWorkspace(path),
    closeWorkspace: () => void handleCloseWorkspace(),
    save: () => window.dispatchEvent(new CustomEvent(MENU_SAVE_EVENT)),
    openCommandPalette: () => openCommandPalette("commands"),
  };

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<string>("menu", (event) => {
      const handlers = menuHandlersRef.current;
      if (handlers) routeMenuEvent(event.payload, handlers);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void syncAppMenu({
      workspaceOpen: view === "workspace" && Boolean(workspace),
      gitAvailable: gitStatus.isRepository,
      recents: recentWorkspaces
        .filter((recent) => recent.exists !== false)
        .map((recent) => ({ path: recent.path, displayName: recent.displayName })),
    }).catch(() => undefined);
  }, [view, workspace, gitStatus.isRepository, recentWorkspaces]);
```

Note: `handleNavigate` already guards the git screen and `view !== "workspace"`
cases are covered by disabled menu items, so no extra guards are needed.

- [ ] **Step 7: Bridge menu Save into the editor**

In `src/features/workspace/LedgerEditor.tsx`, add the import:

```ts
import { MENU_SAVE_EVENT } from "../../lib/menu";
```

and add this effect directly after the `saveActiveFile` `useCallback`
(around line 256):

```ts
  useEffect(() => {
    function handleMenuSave() {
      void saveActiveFile();
    }
    window.addEventListener(MENU_SAVE_EVENT, handleMenuSave);
    return () => window.removeEventListener(MENU_SAVE_EVENT, handleMenuSave);
  }, [saveActiveFile]);
```

- [ ] **Step 8: Run all checks**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 9: Manual smoke test**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run dev
```

Open a workspace, then verify: ⌘1–⌘7 switch screens; ⌘K opens the palette; File ▸ Open Recent lists the workspace and opens it; Save menu item saves a dirty editor (⌘S); Close Workspace (⇧⌘W) returns to the start screen and File/View items disable; ⌘W in the editor still closes the editor tab.

- [ ] **Step 10: Commit**

```bash
git add src/lib/menu.ts src/lib/menu.test.ts src/lib/workspace/api.ts src/App.tsx src/features/workspace/LedgerEditor.tsx
git commit -m "feat: route native menu events to navigation, save, and palette"
```

---

### Task 8: Dock badge for pending Inbox count

**Files:**
- Modify: `src/App.tsx`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add the badge permission**

In `src-tauri/capabilities/default.json`:

```json
  "permissions": [
    "core:default",
    "core:window:allow-set-badge-count",
    "dialog:allow-open",
    "opener:allow-open-path"
  ]
```

- [ ] **Step 2: Add the badge effect to `src/App.tsx`**

Import:

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
```

Next to the menu-sync effect:

```ts
  useEffect(() => {
    if (!isTauri()) return;
    const count = view === "workspace" ? suggestedEntries.length : 0;
    void getCurrentWindow()
      .setBadgeCount(count > 0 ? count : undefined)
      .catch(() => undefined);
  }, [view, suggestedEntries.length]);
```

- [ ] **Step 3: Run checks**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run typecheck && npm test && (cd src-tauri && cargo check)
```

Expected: PASS (cargo check regenerates the capability schema).

- [ ] **Step 4: Manual smoke test**

`npm run dev`, open a workspace with pending inbox entries: Dock icon shows the count; approving entries down to zero clears the badge; closing the workspace clears it.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src-tauri/capabilities/default.json src-tauri/gen
git commit -m "feat: show pending inbox count as Dock badge"
```

---

### Task 9: DESIGN.md update + final verification

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Update DESIGN.md typography**

In the frontmatter, change every `fontFamily: Source Sans 3, ui-sans-serif, system-ui, sans-serif` line (body-lg, body-md, body-base, caption, label-xs) to:

```yaml
    fontFamily: -apple-system, BlinkMacSystemFont, system-ui, sans-serif
```

In the prose, replace the Source Sans 3 paragraph under **Typography**:

```markdown
**The system font (SF Pro)** is the workhorse — all UI chrome, navigation, labels, captions, form elements, and body copy in the application shell. Using the native macOS system font keeps the chrome unmistakably mac-native while Spectral carries the brand voice.
```

and update the "Brand & Style" sentence "all UI chrome in Source Sans 3" to "all UI chrome in the system font (SF Pro)", and the Do's and Don'ts line "that register belongs to Source Sans 3" to "that register belongs to the system font".

Also append to the **Layout** section:

```markdown
The window has no title bar: traffic lights float over a full-height translucent sidebar (vibrancy material), and the sidebar's top 52px is a window drag region. The content pane is opaque parchment.
```

- [ ] **Step 2: Run the full suite**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run typecheck && npm test && (cd src-tauri && cargo check && cargo test)
```

Expected: all PASS.

- [ ] **Step 3: Run e2e**

```bash
cd /Users/ryenski/Projects/Diurnum && npm run test:e2e
```

Expected: PASS. If a test fails on a click intercepted by `.window-drag-strip`, the offending screen has interactive content in the top 16px — fix by reducing the strip height to 12px rather than changing the test.

- [ ] **Step 4: Full manual verification checklist** (`npm run dev`)

- [ ] Vibrancy: desktop blurs through sidebar; warm tint; content pane opaque
- [ ] Traffic lights centered in the sidebar header; window draggable from sidebar header and top strip; double-click on drag region zooms
- [ ] Welcome screen: frosted parchment, draggable, opens workspace normally
- [ ] Chrome renders in SF Pro; page titles still Spectral; editor still JetBrains Mono
- [ ] No text selection/I-beam on chrome; selection works in editor and inputs
- [ ] Right-click on chrome: no web context menu; right-click in editor/input: text menu appears
- [ ] No rubber-band overscroll on panels
- [ ] Menus: ⌘1–⌘7, ⌘K, ⌘O, ⇧⌘N, ⇧⌘W, ⌘S, ⌘, all work; items disable without a workspace; Open Recent lists and opens; About panel shows; ⌘W still closes editor tabs
- [ ] Window size/position restored across relaunch
- [ ] Dock badge tracks inbox count and clears
- [ ] Deactivate window (click desktop): sidebar dims; reactivate: restores

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md
git commit -m "docs: record system-font chrome and hidden title bar in design system"
```
