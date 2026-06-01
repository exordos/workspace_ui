/**
 * Keyboard combo parsing and KeyboardEvent matching for the shortcut system.
 */

export type ShortcutContext = "global" | "chat" | "sidebar" | "composer" | "modal";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export interface ParsedShortcutCombo {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export function parseShortcutCombo(combo: string): ParsedShortcutCombo {
  const parts = combo.toLowerCase().split("+");
  return {
    mod: parts.includes("mod"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    key: parts.filter((p) => !["mod", "alt", "shift"].includes(p)).join("+"),
  };
}

export function shortcutComboMatchesEvent(combo: string, event: KeyboardEvent): boolean {
  const parsed = parseShortcutCombo(combo);
  const modPressed = IS_MAC ? event.metaKey : event.ctrlKey;
  if (parsed.mod !== modPressed) return false;
  if (parsed.alt !== event.altKey) return false;
  if (parsed.shift !== event.shiftKey) return false;
  return event.key.toLowerCase() === parsed.key.toLowerCase();
}
