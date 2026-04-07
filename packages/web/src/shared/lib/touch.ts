/**
 * Touch & input-mode detection.
 *
 * Tracks current input mode (touch vs pointer) and exposes:
 * - `isTouchDevice()` — static capability check
 * - `useInputMode()` — React hook returning "touch" | "pointer"
 * - `useViewportKeyboard()` — detects virtual keyboard open/close
 * - CSS class `touch-active` on <html> when last input was touch
 *
 * The module switches dynamically: a Surface with both pen and touch
 * will flip between modes as the user alternates.
 */

import { useEffect, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Static capability
// ---------------------------------------------------------------------------

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

// ---------------------------------------------------------------------------
// Dynamic input mode (touch ↔ pointer)
// ---------------------------------------------------------------------------

export type InputMode = "touch" | "pointer";

let currentMode: InputMode = isTouchDevice() ? "touch" : "pointer";
const modeListeners = new Set<() => void>();

function setMode(mode: InputMode): void {
  if (currentMode === mode) return;
  currentMode = mode;
  document.documentElement.classList.toggle("touch-active", mode === "touch");
  document.documentElement.classList.toggle("pointer-active", mode === "pointer");
  modeListeners.forEach((cb) => cb());
}

export function getInputMode(): InputMode {
  return currentMode;
}

export function useInputMode(): InputMode {
  return useSyncExternalStore(
    (cb) => {
      modeListeners.add(cb);
      return () => modeListeners.delete(cb);
    },
    () => currentMode,
  );
}

// ---------------------------------------------------------------------------
// Init — call once at app startup
// ---------------------------------------------------------------------------

let initialized = false;

export function initTouchTracking(): () => void {
  if (initialized || typeof window === "undefined") return () => {};
  initialized = true;

  setMode(isTouchDevice() && isCoarsePointer() ? "touch" : "pointer");

  const onPointerDown = (e: PointerEvent) => {
    setMode(e.pointerType === "touch" ? "touch" : "pointer");
  };
  window.addEventListener("pointerdown", onPointerDown, { passive: true });

  const mql = window.matchMedia("(pointer: coarse)");
  const onMqlChange = (e: MediaQueryListEvent) => {
    setMode(e.matches ? "touch" : "pointer");
  };
  mql.addEventListener("change", onMqlChange);

  return () => {
    window.removeEventListener("pointerdown", onPointerDown);
    mql.removeEventListener("change", onMqlChange);
    initialized = false;
  };
}

// ---------------------------------------------------------------------------
// Virtual keyboard detection (visualViewport API)
// ---------------------------------------------------------------------------

interface ViewportKeyboardState {
  isOpen: boolean;
  keyboardHeight: number;
}

let kbState: ViewportKeyboardState = { isOpen: false, keyboardHeight: 0 };
const kbListeners = new Set<() => void>();

function updateKeyboardState(isOpen: boolean, height: number): void {
  if (kbState.isOpen === isOpen && kbState.keyboardHeight === height) return;
  kbState = { isOpen, keyboardHeight: height };
  document.documentElement.style.setProperty("--keyboard-height", `${height}px`);
  document.documentElement.classList.toggle("keyboard-open", isOpen);
  kbListeners.forEach((cb) => cb());
}

export function useViewportKeyboard(): ViewportKeyboardState {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handler = () => {
      const fullHeight = window.innerHeight;
      const viewportHeight = vv.height;
      const diff = fullHeight - viewportHeight;
      const threshold = 150;
      updateKeyboardState(diff > threshold, diff > threshold ? diff : 0);
    };

    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
    };
  }, []);

  return useSyncExternalStore(
    (cb) => {
      kbListeners.add(cb);
      return () => kbListeners.delete(cb);
    },
    () => kbState,
  );
}

// ---------------------------------------------------------------------------
// Safe-area insets (CSS env() fallback for JS)
// ---------------------------------------------------------------------------

export function getSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (typeof window === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };

  const get = (prop: string): number => {
    const el = document.documentElement;
    const val = getComputedStyle(el).getPropertyValue(prop);
    return parseFloat(val) || 0;
  };

  return {
    top: get("env(safe-area-inset-top)"),
    right: get("env(safe-area-inset-right)"),
    bottom: get("env(safe-area-inset-bottom)"),
    left: get("env(safe-area-inset-left)"),
  };
}
