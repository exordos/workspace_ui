/**
 * Unified auto-update service.
 *
 * Two runtimes:
 * - Electron → electron-updater via IPC (main process handles download)
 * - PWA → Service Worker update via vite-plugin-pwa
 * - Browser → no-op (always serves latest)
 *
 * Usage:
 *   import { useAppUpdate } from "~/lib/updater";
 *
 *   function UpdateBanner() {
 *     const update = useAppUpdate();
 *     if (update.status === "ready") {
 *       return <button onClick={update.install}>Update to {update.version}</button>;
 *     }
 *     return null;
 *   }
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { getElectronAPI, isElectron } from "./electron";
import { createLogger } from "./logger";

const log = createLogger("updater");

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  percent?: number;
  error?: string;
  check: () => void;
  install: () => void;
}

type UpdateSnapshot = Omit<UpdateState, "check" | "install">;

const IDLE_UPDATE_SNAPSHOT: UpdateSnapshot = { status: "idle" };
const electronUpdateListeners = new Set<() => void>();
let electronUpdateSnapshot: UpdateSnapshot = IDLE_UPDATE_SNAPSHOT;
let unsubscribeElectronUpdate: (() => void) | null = null;

function notifyElectronUpdateListeners(): void {
  electronUpdateListeners.forEach((listener) => listener());
}

function applyElectronUpdateStatus(data: { status: string; [key: string]: unknown }): void {
  log.info("Update status", {
    status: data.status,
    version: typeof data.version === "string" ? data.version : undefined,
  });

  switch (data.status) {
    case "checking":
      electronUpdateSnapshot = { status: "checking" };
      break;
    case "available":
      electronUpdateSnapshot = {
        status: "available",
        version: typeof data.version === "string" ? data.version : undefined,
      };
      break;
    case "up-to-date":
      electronUpdateSnapshot = { status: "up-to-date" };
      break;
    case "downloading":
      electronUpdateSnapshot = {
        status: "downloading",
        percent: typeof data.percent === "number" ? data.percent : undefined,
      };
      break;
    case "ready":
      electronUpdateSnapshot = {
        status: "ready",
        version: typeof data.version === "string" ? data.version : undefined,
      };
      break;
    case "error":
      electronUpdateSnapshot = {
        status: "error",
        error: typeof data.message === "string" ? data.message : undefined,
      };
      break;
    default:
      return;
  }

  notifyElectronUpdateListeners();
}

function subscribeElectronUpdate(listener: () => void): () => void {
  electronUpdateListeners.add(listener);

  if (unsubscribeElectronUpdate == null) {
    unsubscribeElectronUpdate =
      getElectronAPI()?.updater.onStatus(applyElectronUpdateStatus) ?? null;
  }

  return () => {
    electronUpdateListeners.delete(listener);
    if (electronUpdateListeners.size === 0 && unsubscribeElectronUpdate != null) {
      unsubscribeElectronUpdate();
      unsubscribeElectronUpdate = null;
    }
  };
}

function getElectronUpdateSnapshot(): UpdateSnapshot {
  return electronUpdateSnapshot;
}

function checkElectronUpdate(): void {
  getElectronAPI()?.updater.check();
}

function installElectronUpdate(): void {
  getElectronAPI()?.updater.install();
}

function useElectronUpdate(): UpdateState {
  const state = useSyncExternalStore(
    subscribeElectronUpdate,
    getElectronUpdateSnapshot,
    () => IDLE_UPDATE_SNAPSHOT,
  );

  return {
    ...state,
    check: checkElectronUpdate,
    install: installElectronUpdate,
  };
}

function usePwaUpdate(): UpdateState {
  const [state, setState] = useState<Omit<UpdateState, "check" | "install">>({
    status: "idle",
  });
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let currentReg: ServiceWorkerRegistration | null = null;

    const onUpdateFound = () => {
      if (!currentReg) return;
      const newWorker = currentReg.installing;
      if (!newWorker) return;

      setState({ status: "downloading" });

      const onStateChange = () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          log.info("PWA update ready");
          if (!cancelled) setState({ status: "ready" });
        }
      };
      newWorker.addEventListener("statechange", onStateChange);
    };

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.ready
      .then((reg) => {
        if (cancelled) return;
        currentReg = reg;
        setRegistration(reg);

        if (reg.waiting) {
          setState({ status: "ready" });
        }

        reg.addEventListener("updatefound", onUpdateFound);
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      currentReg?.removeEventListener("updatefound", onUpdateFound);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const applyPwaCheckResult = (reg: ServiceWorkerRegistration) => {
    if (reg.waiting) {
      setState({ status: "ready" });
      return;
    }

    setState({ status: "checking" });
    void reg
      .update()
      .then(() => {
        if (reg.waiting) {
          setState({ status: "ready" });
        } else if (!reg.installing) {
          setState({ status: "up-to-date" });
        }
      })
      .catch(() => {
        setState({ status: "error" });
      });
  };

  return {
    ...state,
    check: () => {
      if (registration) {
        applyPwaCheckResult(registration);
        return;
      }

      setState({ status: "checking" });
      void navigator.serviceWorker.ready
        .then((reg) => {
          setRegistration(reg);
          if (reg.waiting) {
            setState({ status: "ready" });
            return;
          }
          return reg.update().then(() => {
            if (reg.waiting) {
              setState({ status: "ready" });
            } else if (!reg.installing) {
              setState({ status: "up-to-date" });
            }
          });
        })
        .catch(() => {
          setState({ status: "error" });
        });
    },
    install: () => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    },
  };
}

function resolveUpdateRuntime(): "electron" | "pwa" | "noop" {
  if (typeof window === "undefined") {
    return "noop";
  }
  if (isElectron()) {
    return "electron";
  }
  if ("serviceWorker" in navigator) {
    return "pwa";
  }
  return "noop";
}

const RUNTIME = resolveUpdateRuntime();

export function useAppUpdate(): UpdateState {
  const electron = useElectronUpdate();
  const pwa = usePwaUpdate();

  if (RUNTIME === "electron") return electron;
  if (RUNTIME === "pwa") return pwa;
  return { status: "idle", check: () => {}, install: () => {} };
}
