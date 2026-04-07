/**
 * Centralized keyboard shortcut system.
 *
 * Features:
 * - OS-aware modifier key (Mod = Cmd on macOS, Ctrl on Windows/Linux)
 * - Context scoping (global, chat, sidebar, modal)
 * - Registry with human-readable labels (for help overlay)
 * - Conflict prevention (one handler per shortcut per context)
 *
 * Usage:
 *   import { useShortcut } from "~/lib/shortcuts";
 *
 *   useShortcut("mod+k", () => openSearch(), { context: "global" });
 *   useShortcut("escape", () => cancel(), { context: "chat" });
 */

import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShortcutContext = "global" | "chat" | "sidebar" | "composer" | "modal";

export interface ShortcutDef {
  key: string;
  label: string;
  category: string;
  context: ShortcutContext;
  when?: string;
}

interface ActiveHandler {
  combo: string;
  context: ShortcutContext;
  handler: () => void;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// OS detection
// ---------------------------------------------------------------------------

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export function getModKey(): "⌘" | "Ctrl" {
  return IS_MAC ? "⌘" : "Ctrl";
}

export function formatShortcut(combo: string): string {
  return combo
    .replace(/mod/gi, IS_MAC ? "⌘" : "Ctrl")
    .replace(/alt/gi, IS_MAC ? "⌥" : "Alt")
    .replace(/shift/gi, IS_MAC ? "⇧" : "Shift")
    .replace(/\+/g, IS_MAC ? "" : "+")
    .replace(/escape/gi, "Esc")
    .replace(/arrowup/gi, "↑")
    .replace(/arrowdown/gi, "↓")
    .replace(/arrowleft/gi, "←")
    .replace(/arrowright/gi, "→")
    .replace(/enter/gi, "↵")
    .replace(/backspace/gi, "⌫")
    .replace(/delete/gi, "Del")
    .replace(/\b([a-z])\b/g, (_, c: string) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Shortcut catalog (source of truth for the entire app)
// ---------------------------------------------------------------------------

export const SHORTCUTS: ShortcutDef[] = [
  // Navigation
  { key: "mod+k", label: "Search", category: "Navigation", context: "global" },
  { key: "mod+1", label: "Messenger", category: "Navigation", context: "global" },
  { key: "mod+2", label: "Calendar", category: "Navigation", context: "global" },
  { key: "mod+3", label: "Mail", category: "Navigation", context: "global" },
  { key: "mod+4", label: "Calls", category: "Navigation", context: "global" },
  { key: "alt+arrowup", label: "Previous chat", category: "Navigation", context: "sidebar" },
  { key: "alt+arrowdown", label: "Next chat", category: "Navigation", context: "sidebar" },
  { key: "mod+shift+f", label: "Open folder list", category: "Navigation", context: "sidebar" },
  { key: "mod+shift+a", label: "My activity", category: "Navigation", context: "global" },
  { key: "alt+arrowleft", label: "Back", category: "Navigation", context: "global" },
  { key: "alt+arrowright", label: "Forward", category: "Navigation", context: "global" },

  // Composer
  { key: "enter", label: "Send message", category: "Input", context: "composer" },
  { key: "shift+enter", label: "New line", category: "Input", context: "composer" },
  {
    key: "escape",
    label: "Cancel editing",
    category: "Input",
    context: "composer",
    when: "editing",
  },
  {
    key: "arrowup",
    label: "Edit last message",
    category: "Input",
    context: "composer",
    when: "empty input",
  },
  { key: "mod+b", label: "Bold", category: "Formatting", context: "composer" },
  { key: "mod+i", label: "Italic", category: "Formatting", context: "composer" },
  { key: "mod+shift+x", label: "Strikethrough", category: "Formatting", context: "composer" },
  { key: "mod+e", label: "Code (inline)", category: "Formatting", context: "composer" },

  // Chat
  { key: "escape", label: "Deselect / Close panel", category: "Chat", context: "chat" },
  { key: "shift+n", label: "Next unread topic", category: "Chat", context: "chat" },
  { key: "mod+shift+m", label: "Mark all as read", category: "Chat", context: "chat" },

  // UI
  { key: "mod+\\", label: "Toggle sidebar", category: "Interface", context: "global" },
  { key: "mod+.", label: "Toggle info panel", category: "Interface", context: "global" },
  { key: "mod+/", label: "Keyboard shortcuts help", category: "Interface", context: "global" },
  { key: "mod+shift+t", label: "Toggle theme", category: "Interface", context: "global" },
  { key: "f6", label: "Next focus zone", category: "Interface", context: "global" },
  { key: "shift+f6", label: "Previous focus zone", category: "Interface", context: "global" },

  // Modal
  { key: "escape", label: "Close", category: "Modals", context: "modal" },
];

// ---------------------------------------------------------------------------
// Combo matching
// ---------------------------------------------------------------------------

function parseCombo(combo: string): { mod: boolean; alt: boolean; shift: boolean; key: string } {
  const parts = combo.toLowerCase().split("+");
  return {
    mod: parts.includes("mod"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    key: parts.filter((p) => !["mod", "alt", "shift"].includes(p)).join("+"),
  };
}

function matchesEvent(combo: string, event: KeyboardEvent): boolean {
  const parsed = parseCombo(combo);

  const modPressed = IS_MAC ? event.metaKey : event.ctrlKey;
  if (parsed.mod !== modPressed) return false;
  if (parsed.alt !== event.altKey) return false;
  if (parsed.shift !== event.shiftKey) return false;

  const eventKey = event.key.toLowerCase();
  const targetKey = parsed.key.toLowerCase();

  if (targetKey === "enter" && eventKey === "enter") return true;
  if (targetKey === "escape" && eventKey === "escape") return true;
  if (targetKey === "arrowup" && eventKey === "arrowup") return true;
  if (targetKey === "arrowdown" && eventKey === "arrowdown") return true;
  if (targetKey === "arrowleft" && eventKey === "arrowleft") return true;
  if (targetKey === "arrowright" && eventKey === "arrowright") return true;
  if (targetKey === "backspace" && eventKey === "backspace") return true;
  if (targetKey === "delete" && eventKey === "delete") return true;
  if (targetKey === "\\" && eventKey === "\\") return true;
  if (targetKey === "." && eventKey === ".") return true;
  if (targetKey === "/" && eventKey === "/") return true;

  if (targetKey.length === 1 && eventKey === targetKey) return true;
  if (/^[1-9]$/.test(targetKey) && eventKey === targetKey) return true;

  return eventKey === targetKey;
}

// ---------------------------------------------------------------------------
// Active handler registry
// ---------------------------------------------------------------------------

const handlers: ActiveHandler[] = [];

function registerHandler(h: ActiveHandler): () => void {
  handlers.push(h);
  return () => {
    const idx = handlers.indexOf(h);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  const inModal = document.querySelector("[data-shortcut-context='modal']") != null;

  for (let i = handlers.length - 1; i >= 0; i--) {
    const h = handlers[i]!;
    if (!h.enabled) continue;
    if (!matchesEvent(h.combo, event)) continue;

    if (inModal && h.context !== "modal" && h.context !== "global") continue;

    if (
      (h.context === "composer" || h.context === "chat") &&
      h.combo !== "escape" &&
      !h.combo.includes("mod") &&
      !h.combo.includes("alt") &&
      !isInputFocused() &&
      h.context === "composer"
    ) {
      continue;
    }

    event.preventDefault();
    event.stopPropagation();
    h.handler();
    return;
  }
}

let globalListenerAttached = false;

function ensureGlobalListener(): void {
  if (globalListenerAttached || typeof window === "undefined") return;
  window.addEventListener("keydown", handleGlobalKeyDown, true);
  globalListenerAttached = true;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseShortcutOptions {
  context?: ShortcutContext;
  enabled?: boolean;
}

export function useShortcut(
  combo: string,
  handler: () => void,
  options: UseShortcutOptions = {},
): void {
  const { context = "global", enabled = true } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    ensureGlobalListener();

    const h: ActiveHandler = {
      combo,
      context,
      handler: () => handlerRef.current(),
      enabled,
    };

    const unregister = registerHandler(h);
    return unregister;
  }, [combo, context, enabled]);
}

export function useShortcuts(
  shortcuts: {
    combo: string;
    handler: () => void;
    context?: ShortcutContext;
    enabled?: boolean;
  }[],
): void {
  const ref = useRef(shortcuts);
  useEffect(() => {
    ref.current = shortcuts;
  });

  useEffect(() => {
    ensureGlobalListener();

    const unregisters = ref.current.map((s) =>
      registerHandler({
        combo: s.combo,
        context: s.context ?? "global",
        handler: s.handler,
        enabled: s.enabled ?? true,
      }),
    );

    return () => unregisters.forEach((u) => u());
  }, [shortcuts.length]);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

export function getShortcutsByCategory(): Map<string, ShortcutDef[]> {
  const map = new Map<string, ShortcutDef[]>();
  for (const s of SHORTCUTS) {
    const existing = map.get(s.category) ?? [];
    existing.push(s);
    map.set(s.category, existing);
  }
  return map;
}
