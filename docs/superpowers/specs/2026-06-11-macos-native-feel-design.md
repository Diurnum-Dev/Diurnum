# macOS Native Look & Feel — Design

**Date:** 2026-06-11
**Status:** Approved

## Goal

Make Diurnum look, feel, and behave like a native macOS app instead of a packaged
web page, while keeping the Diurnum aesthetic: parchment palette, Spectral for
display type, JetBrains Mono for ledger content, hairline borders, lapis accent.

Light appearance only. Dark mode is deferred to a future project.

## Decisions (user-approved)

| Decision | Choice |
|---|---|
| Window chrome | Hidden title bar, full-height sidebar, traffic lights inside sidebar |
| Sidebar surface | Translucent vibrancy (NSVisualEffectView sidebar material) |
| Vibrancy technique | Tauri built-in `windowEffects` — no custom native code |
| Chrome typeface | System font (SF Pro via `-apple-system`); Spectral and JetBrains Mono keep their roles |
| Dark mode | Deferred |
| Behaviors in scope | Full menu bar + shortcuts, de-webified chrome, window state memory, Dock badge |

## 1. Window chrome

`src-tauri/tauri.conf.json` main window gains:

```json
{
  "titleBarStyle": "Overlay",
  "hiddenTitle": true,
  "transparent": true,
  "trafficLightPosition": { "x": 18, "y": 18 },
  "windowEffects": {
    "effects": ["sidebar"],
    "state": "followsWindowActiveState"
  }
}
```

plus `"app": { "macOSPrivateApi": true }` and the matching `macos-private-api`
feature on the `tauri` crate (required for a transparent webview background on
macOS).

Dependency bumps: `tauri`, `@tauri-apps/api`, and `@tauri-apps/cli` move from
pinned `2.0.0` to current 2.x (needed for `trafficLightPosition` and the dock
badge API). `tauri-plugin-window-state` is added.

Surface painting:

- The window background is the NSVisualEffectView sidebar material.
- `.shell-main` (content pane) paints opaque `var(--color-bg)` parchment.
- `.sidebar` is transparent with a faint parchment tint
  (e.g. `rgba(251, 246, 236, 0.55)` — tune by eye) so the blur reads warm.
- The existing 1px hairline divider between sidebar and content stays.

Drag regions (`data-tauri-drag-region`):

- The top ~52px of the sidebar (traffic-light zone).
- The empty area of each screen's 48px header strip.
- The welcome/start screen (no sidebar): same vibrancy backdrop treatment and a
  drag strip across its top.

## 2. Layout restructure (`src/components/AppShell.tsx`)

- Sidebar becomes true full height: a ~52px drag-region header (traffic lights
  live here), then the workspace switcher, then nav, with the
  close-workspace/settings buttons pinned at the bottom as today.
- Status bar stays pinned to the bottom of the content pane only; the sidebar
  runs past it to the window edge.
- Window focus/blur events (Tauri window events) toggle a class on the shell;
  when blurred, sidebar text dims to muted, like Finder.

## 3. Typography

- `--font-sans` in `src/styles/tokens.css` becomes
  `-apple-system, BlinkMacSystemFont, system-ui, sans-serif` (SF Pro).
- The Source Sans 3 webfont import is removed.
- Spectral keeps the wordmark, page titles, and display headings.
  JetBrains Mono keeps all ledger/editor/data content.
- The 13px base size and existing type scale are unchanged.
- `DESIGN.md` is updated to record the system font as the chrome typeface.

## 4. Native menu bar + shortcuts (`src-tauri/src/lib.rs`)

Full menu bar replacing the current minimal one:

- **Diurnum**: About (native panel), separator, Settings… `⌘,`, separator,
  Hide / Hide Others / Show All, separator, Quit.
- **File**: New Workspace `⇧⌘N`, Open Workspace… `⌘O`, Open Recent ▸ (recent
  workspace paths), separator, Close Workspace `⇧⌘W`, separator, Save `⌘S`.
  `⌘W` keeps its native close-window meaning.
- **Edit**: unchanged (undo, redo, cut, copy, paste, select all).
- **View**: Ledger `⌘1`, Inbox `⌘2`, Reports `⌘3`, Documents `⌘4`,
  Import `⌘5`, Git `⌘6`, Settings `⌘7`, separator, Command Palette `⌘K`,
  separator, Enter Full Screen (native item).
- **Window**: Minimize, Zoom (native items).

Wiring:

- Custom items emit a single `menu` event with the item id as payload.
- `App.tsx` listens via `@tauri-apps/api/event` and routes to the existing
  navigation / save / command-palette handlers. The listener is guarded so the
  app still works outside Tauri (vitest, Playwright).
- Items needing workspace context (Save, Close Workspace, View items, Open
  Recent contents) are enabled/disabled/updated from the frontend as state
  changes, via a small Tauri command that the frontend calls with the current
  app state.

## 5. Behaviors ("de-webify")

- **Selection/cursors:** `user-select: none` and `cursor: default` globally;
  text selection and I-beam cursors restored only in inputs, textareas, the
  CodeMirror editor, and ledger/data content.
- **Context menu:** suppress the web right-click menu via a `contextmenu`
  listener, except when the target is editable/text content (native text menus
  still apply there).
- **Overscroll:** `overscroll-behavior: none` on the body and panel scroll
  containers — no rubber-banding of the app shell.
- **Focus rings:** lapis ring on `:focus-visible` only; mouse clicks leave no
  web-style outline.
- **Window state memory:** `tauri-plugin-window-state` restores window size and
  position across launches.
- **Dock badge:** pending inbox count sets the Dock icon badge via the window
  badge API, cleared when the count is zero. Driven by the same state as the
  sidebar count pill.

## Testing

- Update `AppShell.test.tsx` (and any other affected unit tests) for the new
  DOM structure.
- Existing Playwright e2e should keep passing; content-pane DOM is unchanged.
- Manual verification checklist for what jsdom/Playwright cannot see:
  vibrancy rendering, traffic-light placement, window dragging from the
  sidebar/header, menu items + accelerators, enabled/disabled menu states,
  window state restoration, Dock badge, inactive-window dimming.

## Out of scope

- Dark mode (future project: dark companion palette + editor theme).
- Windows/Linux chrome changes (config keys used are macOS-only; other
  platforms keep current behavior).
- Custom NSVisualEffectView positioning via objc2.
