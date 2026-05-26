/**
 * Network connectivity detection and recovery.
 *
 * Uses Navigator.onLine + online/offline events + optional fetch probing.
 * Pauses retries when offline, resumes immediately when connection returns.
 *
 * Usage:
 *   import { network } from "~/lib/network";
 *
 *   network.isOnline();                       // true/false
 *   network.onStatusChange((online) => { }); // subscribe
 *   network.onReconnect(() => { });          // fires once when offline→online
 *   await network.waitForOnline();            // resolves when online
 */

import { createLogger, logAction } from "./logger";

const log = createLogger("network");

type StatusCallback = (online: boolean) => void;
type ReconnectCallback = () => void;

const statusListeners = new Set<StatusCallback>();
const reconnectListeners = new Set<ReconnectCallback>();
let wasOffline = false;
let offlineSince: number | null = null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export function onStatusChange(callback: StatusCallback): () => void {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}

export function onReconnect(callback: ReconnectCallback): () => void {
  reconnectListeners.add(callback);
  return () => reconnectListeners.delete(callback);
}

// ---------------------------------------------------------------------------
// Wait
// ---------------------------------------------------------------------------

/** Resolves immediately if online, or waits until online event fires. */
export function waitForOnline(): Promise<void> {
  if (isOnline()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = onStatusChange((online) => {
      if (online) {
        unsub();
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Smart sleep: pauses when offline, resumes on reconnect
// ---------------------------------------------------------------------------

/**
 * Like setTimeout but pauses while offline.
 * If offline when called, waits for online first, THEN waits delayMs.
 * If goes offline during wait, pauses and resumes on reconnect.
 */
export function networkAwareSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!isOnline()) {
      const unsub = onStatusChange((online) => {
        if (online) {
          unsub();
          setTimeout(resolve, delayMs);
        }
      });
      return;
    }

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const timer = setTimeout(done, delayMs);
    const unsub = onStatusChange((online) => {
      if (resolved) {
        unsub();
        return;
      }
      if (!online) {
        clearTimeout(timer);
        unsub();
        const innerUnsub = onStatusChange((back) => {
          if (back) {
            innerUnsub();
            setTimeout(done, delayMs);
          }
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleOnline(): void {
  const downtime = offlineSince ? Date.now() - offlineSince : 0;
  offlineSince = null;

  log.info("Network online", { downtimeMs: downtime });
  logAction("network_online", { downtimeMs: downtime });

  for (const cb of statusListeners) {
    try {
      cb(true);
    } catch {
      /* must not break others */
    }
  }

  if (wasOffline) {
    wasOffline = false;
    log.info("Triggering reconnect callbacks", { downtimeMs: downtime });
    for (const cb of reconnectListeners) {
      try {
        cb();
      } catch {
        /* must not break others */
      }
    }
  }
}

function handleOffline(): void {
  wasOffline = true;
  offlineSince = Date.now();
  log.warn("Network offline");
  logAction("network_offline");

  for (const cb of statusListeners) {
    try {
      cb(false);
    } catch {
      /* must not break others */
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initNetworkTracking(): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  if (!navigator.onLine) {
    wasOffline = true;
    offlineSince = Date.now();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

// ---------------------------------------------------------------------------
// Convenience bundle
// ---------------------------------------------------------------------------

export const network = {
  isOnline,
  onStatusChange,
  onReconnect,
  waitForOnline,
  initNetworkTracking,
} as const;
