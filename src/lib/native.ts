import { isTauri } from "@tauri-apps/api/core";

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], .cm-editor';

/* Read-only surfaces whose text is selectable (see the native chrome block in
   styles.css) — right-click copy must keep working on them. */
const SELECTABLE_TEXT_SELECTOR =
  "pre, code, .error-banner, .git-warning-banner, .git-file-path, .git-commit-hash";

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

export function isSelectableTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(SELECTABLE_TEXT_SELECTOR) !== null
  );
}

/**
 * One-time setup for native-feeling window behavior. No-op outside Tauri so
 * vitest and Playwright runs are unaffected.
 */
export function initNativeChrome(): void {
  if (!isTauri()) return;

  window.addEventListener("contextmenu", (event) => {
    if (!isEditableTarget(event.target) && !isSelectableTextTarget(event.target)) {
      event.preventDefault();
    }
  });

  window.addEventListener("blur", () => {
    document.body.classList.add("window-blurred");
  });
  window.addEventListener("focus", () => {
    document.body.classList.remove("window-blurred");
  });
}
