/**
 * Navigation history — forward/back for in-app routes.
 *
 * Browser/PWA: uses native browser history (history.back/forward).
 * Electron (HashRouter): wraps history API with the same semantics.
 *
 * Also provides:
 * - canGoBack / canGoForward state
 * - React hook for components
 * - Mouse button support (mouse 4/5 = back/forward)
 *
 * Usage:
 *   import { useNavigationHistory } from "~/lib/navigation-history";
 *
 *   const { goBack, goForward, canGoBack, canGoForward } = useNavigationHistory();
 *   <button disabled={!canGoBack} onClick={goBack}>Back</button>
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createLogger } from "./logger";

const log = createLogger("navigation");

// ---------------------------------------------------------------------------
// History tracking
// ---------------------------------------------------------------------------

let historyStack: string[] = [];
let currentIndex = -1;
let navigatingProgrammatically = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

function pushEntry(path: string): void {
  if (navigatingProgrammatically) {
    navigatingProgrammatically = false;
    return;
  }

  if (historyStack[currentIndex] === path) return;

  historyStack = historyStack.slice(0, currentIndex + 1);
  historyStack.push(path);
  currentIndex = historyStack.length - 1;

  if (historyStack.length > 100) {
    historyStack = historyStack.slice(-80);
    currentIndex = historyStack.length - 1;
  }

  notify();
}

export function canGoBack(): boolean {
  return currentIndex > 0;
}

export function canGoForward(): boolean {
  return currentIndex < historyStack.length - 1;
}

export function getBackPath(): string | null {
  return canGoBack() ? historyStack[currentIndex - 1]! : null;
}

export function getForwardPath(): string | null {
  return canGoForward() ? historyStack[currentIndex + 1]! : null;
}

interface NavigationSnapshot {
  canGoBack: boolean;
  canGoForward: boolean;
  currentIndex: number;
  stackSize: number;
}

let cachedSnapshot: NavigationSnapshot | null = null;
let cachedBack = false;
let cachedFwd = false;
let cachedIdx = -1;
let cachedSize = 0;

function getNavigationSnapshot(): NavigationSnapshot {
  const back = canGoBack();
  const fwd = canGoForward();
  if (
    cachedSnapshot &&
    back === cachedBack &&
    fwd === cachedFwd &&
    currentIndex === cachedIdx &&
    historyStack.length === cachedSize
  ) {
    return cachedSnapshot;
  }
  cachedBack = back;
  cachedFwd = fwd;
  cachedIdx = currentIndex;
  cachedSize = historyStack.length;
  cachedSnapshot = {
    canGoBack: back,
    canGoForward: fwd,
    currentIndex,
    stackSize: historyStack.length,
  };
  return cachedSnapshot;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useNavigationHistory() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    pushEntry(location.pathname + location.search);
  }, [location.pathname, location.search]);

  const state = useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, getNavigationSnapshot);

  const goBack = useCallback(() => {
    if (!canGoBack()) return;
    currentIndex--;
    const path = historyStack[currentIndex]!;
    navigatingProgrammatically = true;
    log.info("Navigate back", { to: path, index: currentIndex });
    void navigate(path);
    notify();
  }, [navigate]);

  const goForward = useCallback(() => {
    if (!canGoForward()) return;
    currentIndex++;
    const path = historyStack[currentIndex]!;
    navigatingProgrammatically = true;
    log.info("Navigate forward", { to: path, index: currentIndex });
    void navigate(path);
    notify();
  }, [navigate]);

  return {
    goBack,
    goForward,
    canGoBack: state.canGoBack,
    canGoForward: state.canGoForward,
  };
}

// ---------------------------------------------------------------------------
// Mouse back/forward buttons (button 3 = back, button 4 = forward)
// ---------------------------------------------------------------------------

let mouseListenerActive = false;

export function initMouseNavigation(goBackFn: () => void, goForwardFn: () => void): () => void {
  if (mouseListenerActive) return () => {};
  mouseListenerActive = true;

  const handler = (e: MouseEvent) => {
    if (e.button === 3) {
      e.preventDefault();
      goBackFn();
    } else if (e.button === 4) {
      e.preventDefault();
      goForwardFn();
    }
  };

  window.addEventListener("mouseup", handler);

  return () => {
    window.removeEventListener("mouseup", handler);
    mouseListenerActive = false;
  };
}
