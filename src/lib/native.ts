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
