/**
 * Focus management utilities.
 *
 * Provides focus trapping for modals/drawers, roving tabindex for lists,
 * skip-to-content link support, and focus restoration.
 *
 * tabIndex policy (WCAG 2.2 compliant):
 *
 *   tabIndex={0}   — element is part of the natural tab order (use sparingly,
 *                    only for custom interactive elements like div-based buttons)
 *   tabIndex={-1}  — programmatically focusable but NOT in tab order
 *                    (scroll containers, group containers, focus targets)
 *   NEVER use tabIndex > 0 — breaks natural DOM order
 *
 * Focus zones (landmarks):
 *   [data-focus-zone="topbar"]     — top navigation bar
 *   [data-focus-zone="sidebar"]    — chat list sidebar
 *   [data-focus-zone="main"]       — message list / page content
 *   [data-focus-zone="composer"]   — message input area
 *   [data-focus-zone="panel"]      — right info panel
 *   [data-focus-zone="modal"]      — active modal/dialog (traps focus)
 */

import { useCallback, useEffect, useRef } from "react";
import { KEYBOARD_SHORTCUTS_ENABLED } from "~/shared/config/constants";

// ---------------------------------------------------------------------------
// Focus zone navigation (F6 cycle between landmarks)
// ---------------------------------------------------------------------------

const FOCUS_ZONES: string[] = ["topbar", "sidebar", "main", "composer", "panel"];

export function focusZone(zone: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-focus-zone="${zone}"]`);
  if (!el) return false;

  const focusable = getFirstFocusable(el) ?? el;
  focusable.focus({ preventScroll: true });
  return true;
}

export function cycleToNextZone(currentZone?: string): void {
  const activeZone = currentZone ?? getActiveZone();
  const idx = activeZone ? FOCUS_ZONES.indexOf(activeZone) : -1;
  const nextIdx = (idx + 1) % FOCUS_ZONES.length;

  for (let i = 0; i < FOCUS_ZONES.length; i++) {
    const targetIdx = (nextIdx + i) % FOCUS_ZONES.length;
    if (focusZone(FOCUS_ZONES[targetIdx]!)) return;
  }
}

export function cycleToPrevZone(currentZone?: string): void {
  const activeZone = currentZone ?? getActiveZone();
  const idx = activeZone ? FOCUS_ZONES.indexOf(activeZone) : 0;
  const prevIdx = (idx - 1 + FOCUS_ZONES.length) % FOCUS_ZONES.length;

  for (let i = 0; i < FOCUS_ZONES.length; i++) {
    const targetIdx = (prevIdx - i + FOCUS_ZONES.length) % FOCUS_ZONES.length;
    if (focusZone(FOCUS_ZONES[targetIdx]!)) return;
  }
}

function getActiveZone(): string | null {
  const active = document.activeElement;
  if (!active) return null;
  const zone = active.closest<HTMLElement>("[data-focus-zone]");
  return zone?.dataset.focusZone ?? null;
}

// ---------------------------------------------------------------------------
// Focusable element queries
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled]):not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"]):not([type="hidden"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  '[tabindex="0"]:not([disabled])',
  '[contenteditable="true"]',
].join(", ");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

export function getLastFocusable(container: HTMLElement): HTMLElement | null {
  const all = getFocusableElements(container);
  return all[all.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Focus trap (for modals/dialogs)
// ---------------------------------------------------------------------------

export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean): void {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !ref.current) return;

    previousFocus.current = document.activeElement as HTMLElement;

    const container = ref.current;
    const first = getFirstFocusable(container);
    if (first) {
      requestAnimationFrame(() => first.focus());
    }

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const firstEl = focusables[0]!;
      const lastEl = focusables[focusables.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    container.addEventListener("keydown", handler);

    return () => {
      container.removeEventListener("keydown", handler);
      if (previousFocus.current && document.body.contains(previousFocus.current)) {
        previousFocus.current.focus();
      }
    };
  }, [ref, active]);
}

// ---------------------------------------------------------------------------
// Roving tabindex (for lists, toolbars, tab bars)
// ---------------------------------------------------------------------------

export interface RovingOptions {
  orientation?: "horizontal" | "vertical" | "both";
  loop?: boolean;
}

export function useRovingTabindex(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: RovingOptions,
): void {
  const { orientation = "vertical", loop = true } = options ?? {};

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getItems = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          '[role="tab"], [role="option"], [role="menuitem"], [role="treeitem"], [data-roving-item]',
        ),
      );

    const items = getItems();
    if (items.length === 0) return;

    items.forEach((item, i) => {
      item.setAttribute("tabindex", i === 0 ? "0" : "-1");
    });

    const handler = (e: KeyboardEvent) => {
      const current = document.activeElement as HTMLElement;
      const currentItems = getItems();
      const idx = currentItems.indexOf(current);
      if (idx === -1) return;

      let nextIdx = -1;

      const isNext =
        (orientation !== "horizontal" && e.key === "ArrowDown") ||
        (orientation !== "vertical" && e.key === "ArrowRight");
      const isPrev =
        (orientation !== "horizontal" && e.key === "ArrowUp") ||
        (orientation !== "vertical" && e.key === "ArrowLeft");
      const isFirst = e.key === "Home";
      const isLast = e.key === "End";

      if (isNext) {
        nextIdx = loop
          ? (idx + 1) % currentItems.length
          : Math.min(idx + 1, currentItems.length - 1);
      } else if (isPrev) {
        nextIdx = loop
          ? (idx - 1 + currentItems.length) % currentItems.length
          : Math.max(idx - 1, 0);
      } else if (isFirst) {
        nextIdx = 0;
      } else if (isLast) {
        nextIdx = currentItems.length - 1;
      }

      if (nextIdx >= 0 && nextIdx !== idx) {
        e.preventDefault();
        currentItems[idx]!.setAttribute("tabindex", "-1");
        currentItems[nextIdx]!.setAttribute("tabindex", "0");
        currentItems[nextIdx]!.focus();
      }
    };

    container.addEventListener("keydown", handler);
    return () => container.removeEventListener("keydown", handler);
  }, [containerRef, orientation, loop]);
}

// ---------------------------------------------------------------------------
// Focus restoration (after closing modal/panel)
// ---------------------------------------------------------------------------

export function useFocusRestore(): {
  saveFocus: () => void;
  restoreFocus: () => void;
} {
  const savedRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    savedRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (savedRef.current && document.body.contains(savedRef.current)) {
      savedRef.current.focus();
      savedRef.current = null;
    }
  }, []);

  return { saveFocus, restoreFocus };
}

// ---------------------------------------------------------------------------
// Skip to content
// ---------------------------------------------------------------------------

export function focusMainContent(): void {
  focusZone("main");
}

// ---------------------------------------------------------------------------
// Init: F6 zone cycling, skip-link
// ---------------------------------------------------------------------------

let initialized = false;

export function initFocusManagement(): () => void {
  if (!KEYBOARD_SHORTCUTS_ENABLED) return () => {};
  if (initialized) return () => {};
  initialized = true;

  const handler = (e: KeyboardEvent) => {
    if (e.key === "F6" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) cycleToPrevZone();
      else cycleToNextZone();
    }
  };

  window.addEventListener("keydown", handler);

  return () => {
    window.removeEventListener("keydown", handler);
    initialized = false;
  };
}
