/**
 * Tests for the keyboard shortcuts registry and formatting module.
 *
 * This module manages the catalog of 25+ keyboard shortcuts, formats them
 * for display (e.g. "mod+k" → "Ctrl+K" on Windows, "⌘K" on Mac), and
 * groups them by category for the shortcuts help dialog. Broken formatting
 * would show wrong key labels; duplicate shortcuts would cause conflicts.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("~/shared/config/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/config/constants")>();
  return { ...actual, KEYBOARD_SHORTCUTS_ENABLED: true };
});

import {
  formatShortcut,
  getModKey,
  getShortcutsByCategory,
  SHORTCUTS,
  useShortcut,
} from "./shortcuts";

// getModKey returns the platform-specific modifier key name
describe("getModKey", () => {
  // jsdom simulates a non-Mac environment — should return "Ctrl"
  it("returns Ctrl in non-Mac jsdom environment", () => {
    expect(getModKey()).toBe("Ctrl");
  });
});

// formatShortcut converts internal key notation to user-facing display strings
describe("formatShortcut", () => {
  // "mod" is the abstract modifier — maps to Ctrl on Windows/Linux, ⌘ on Mac
  it("replaces mod with Ctrl on non-Mac", () => {
    expect(formatShortcut("mod+k")).toBe("Ctrl+K");
  });

  it("replaces alt with Alt on non-Mac", () => {
    expect(formatShortcut("alt+f")).toBe("Alt+F");
  });

  it("replaces shift with Shift on non-Mac", () => {
    expect(formatShortcut("shift+n")).toBe("Shift+N");
  });

  // Arrow keys are displayed as Unicode symbols for cleaner UI
  it("replaces arrowup with ↑", () => {
    expect(formatShortcut("arrowup")).toBe("↑");
  });

  it("replaces arrowdown with ↓", () => {
    expect(formatShortcut("arrowdown")).toBe("↓");
  });

  it("replaces arrowleft with ←", () => {
    expect(formatShortcut("arrowleft")).toBe("←");
  });

  it("replaces arrowright with →", () => {
    expect(formatShortcut("arrowright")).toBe("→");
  });

  // Special keys get compact symbols for the shortcuts help dialog
  it("replaces escape with Esc", () => {
    expect(formatShortcut("escape")).toBe("Esc");
  });

  it("replaces enter with ↵", () => {
    expect(formatShortcut("enter")).toBe("↵");
  });

  it("replaces backspace with ⌫", () => {
    expect(formatShortcut("backspace")).toBe("⌫");
  });

  it("replaces delete with Del", () => {
    expect(formatShortcut("delete")).toBe("Del");
  });

  // Single-letter keys should be uppercased for consistency (mod+b → Ctrl+B)
  it("uppercases single-letter keys", () => {
    expect(formatShortcut("mod+b")).toBe("Ctrl+B");
    expect(formatShortcut("mod+e")).toBe("Ctrl+E");
    expect(formatShortcut("mod+i")).toBe("Ctrl+I");
  });

  // Combined modifiers (Ctrl+Shift+A) are common for advanced shortcuts
  it("handles combined modifier shortcuts", () => {
    expect(formatShortcut("mod+shift+a")).toBe("Ctrl+Shift+A");
    expect(formatShortcut("mod+shift+x")).toBe("Ctrl+Shift+X");
    expect(formatShortcut("mod+shift+t")).toBe("Ctrl+Shift+T");
    expect(formatShortcut("mod+shift+m")).toBe("Ctrl+Shift+M");
  });

  // Alt+arrow combinations for navigation between chats/channels
  it("handles alt+arrow combos", () => {
    expect(formatShortcut("alt+arrowup")).toBe("Alt+↑");
    expect(formatShortcut("alt+arrowdown")).toBe("Alt+↓");
    expect(formatShortcut("alt+arrowleft")).toBe("Alt+←");
    expect(formatShortcut("alt+arrowright")).toBe("Alt+→");
  });

  // Number keys for quick instance switching (Ctrl+1, Ctrl+2, etc.)
  it("handles number keys with mod", () => {
    expect(formatShortcut("mod+1")).toBe("Ctrl+1");
    expect(formatShortcut("mod+2")).toBe("Ctrl+2");
    expect(formatShortcut("mod+3")).toBe("Ctrl+3");
    expect(formatShortcut("mod+4")).toBe("Ctrl+4");
  });

  // Punctuation keys used for sidebar toggle, search, etc.
  it("handles punctuation keys with mod", () => {
    expect(formatShortcut("mod+\\")).toBe("Ctrl+\\");
    expect(formatShortcut("mod+.")).toBe("Ctrl+.");
    expect(formatShortcut("mod+/")).toBe("Ctrl+/");
  });

  // Shift+Enter is used for newline in the message composer
  it("handles shift+enter combo", () => {
    expect(formatShortcut("shift+enter")).toBe("Shift+↵");
  });

  // Empty input should return empty string, not crash
  it("returns empty string for empty input", () => {
    expect(formatShortcut("")).toBe("");
  });
});

// SHORTCUTS is the static catalog of all registered keyboard shortcuts
describe("SHORTCUTS catalog", () => {
  // The catalog must not be empty — the app relies on shortcuts for productivity
  it("is non-empty", () => {
    expect(SHORTCUTS.length).toBeGreaterThan(0);
  });

  // Every shortcut must have key, label, and category for the help dialog
  it("every entry has required string fields", () => {
    for (const s of SHORTCUTS) {
      expect(typeof s.key).toBe("string");
      expect(s.key.length).toBeGreaterThan(0);
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.category).toBe("string");
      expect(s.category.length).toBeGreaterThan(0);
    }
  });

  // Context controls when the shortcut is active — must be a valid scope
  it("every context is one of the allowed values", () => {
    const valid = new Set(["global", "chat", "sidebar", "composer", "modal"]);
    for (const s of SHORTCUTS) {
      expect(valid.has(s.context)).toBe(true);
    }
  });

  // Navigation shortcuts (Ctrl+K, arrows) must exist for keyboard-only users
  it("contains navigation shortcuts", () => {
    expect(SHORTCUTS.some((s) => s.category === "Navigation")).toBe(true);
  });

  // Composer shortcuts (bold, italic, send) are critical for message formatting
  it("contains composer shortcuts", () => {
    expect(SHORTCUTS.some((s) => s.context === "composer")).toBe(true);
  });

  // Escape must close modals — fundamental UX expectation
  it("contains a modal escape shortcut", () => {
    expect(SHORTCUTS.some((s) => s.context === "modal" && s.key === "escape")).toBe(true);
  });

  // Duplicate key+context combinations would cause unpredictable behavior
  it("has no duplicate key+context+when combinations", () => {
    const seen = new Set<string>();
    for (const s of SHORTCUTS) {
      const id = `${s.key}|${s.context}|${s.when ?? ""}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  // The "when" field is an optional precondition — if present, must be meaningful
  it("when field is a non-empty string when present", () => {
    for (const s of SHORTCUTS) {
      if (s.when !== undefined) {
        expect(typeof s.when).toBe("string");
        expect(s.when.length).toBeGreaterThan(0);
      }
    }
  });
});

// getShortcutsByCategory groups shortcuts for the help dialog's category sections
describe("getShortcutsByCategory", () => {
  // Returns a Map<category, shortcuts[]> structure
  it("returns a Map", () => {
    expect(getShortcutsByCategory()).toBeInstanceOf(Map);
  });

  // Total grouped entries must match the catalog — no shortcuts lost in grouping
  it("total grouped entries equals SHORTCUTS length", () => {
    const map = getShortcutsByCategory();
    let total = 0;
    for (const entries of map.values()) total += entries.length;
    expect(total).toBe(SHORTCUTS.length);
  });

  // Empty categories would create blank sections in the help dialog
  it("every category has at least one entry", () => {
    for (const [, entries] of getShortcutsByCategory()) {
      expect(entries.length).toBeGreaterThan(0);
    }
  });

  // All expected UI sections must be present in the grouped output
  it("includes all expected categories", () => {
    const map = getShortcutsByCategory();
    expect(map.has("Navigation")).toBe(true);
    expect(map.has("Input")).toBe(true);
    expect(map.has("Formatting")).toBe(true);
    expect(map.has("Chat")).toBe(true);
    expect(map.has("Interface")).toBe(true);
    expect(map.has("Modals")).toBe(true);
  });

  // Grouping correctness: every entry in a group must belong to that category
  it("entries within each group share the same category", () => {
    for (const [cat, entries] of getShortcutsByCategory()) {
      for (const e of entries) {
        expect(e.category).toBe(cat);
      }
    }
  });
});

// matchesEvent + handler registry — tested via useShortcut hook + window keydown dispatch
describe("shortcut handler matching (integration)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("fires handler on matching mod+key combo (Ctrl on non-Mac)", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+k", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not fire when modifier does not match", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+k", handler));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: false, bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it("matches escape key in global context", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("escape", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("matches shift+enter combo", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("shift+enter", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("matches alt+arrowup combo", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("alt+arrowup", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("matches mod+number combo", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+1", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("matches mod+punctuation combo (backslash)", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+\\", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "\\", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not fire handler after unmount (cleanup)", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+k", handler));
    unmount();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire disabled handler", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+k", handler, { enabled: false }));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
    );

    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it("does not match when an extra modifier is pressed", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+k", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it("does not match wrong key", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+k", handler));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
    unmount();
  });

  it("modal context — handler fires when modal element is present", () => {
    const modalEl = document.createElement("div");
    modalEl.setAttribute("data-shortcut-context", "modal");
    document.body.appendChild(modalEl);

    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("escape", handler, { context: "modal" }));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("mod+shift+a three-modifier combo matches", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useShortcut("mod+shift+a", handler));

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });
});
