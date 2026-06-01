/**
 * Global keydown dispatch for registered shortcut handlers.
 */

import { shortcutComboMatchesEvent, type ShortcutContext } from "./shortcuts-match.lib";

export interface ShortcutActiveHandler {
  combo: string;
  context: ShortcutContext;
  handler: () => void;
  enabled: boolean;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
}

function shouldSkipComposerShortcut(h: ShortcutActiveHandler): boolean {
  if (h.context !== "composer") return false;
  if (h.combo === "escape") return false;
  if (h.combo.includes("mod") || h.combo.includes("alt")) return false;
  return !isInputFocused();
}

function shouldSkipShortcutHandler(h: ShortcutActiveHandler, inModal: boolean): boolean {
  if (!h.enabled) return true;
  if (inModal && h.context !== "modal" && h.context !== "global") return true;
  return shouldSkipComposerShortcut(h);
}

/** Runs the topmost matching handler; returns true when a shortcut was consumed. */
export function dispatchShortcutKeyDown(
  event: KeyboardEvent,
  handlers: readonly ShortcutActiveHandler[],
  inModal: boolean,
): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const h = handlers[i]!;
    if (!shortcutComboMatchesEvent(h.combo, event)) continue;
    if (shouldSkipShortcutHandler(h, inModal)) continue;

    event.preventDefault();
    event.stopPropagation();
    h.handler();
    return true;
  }
  return false;
}
