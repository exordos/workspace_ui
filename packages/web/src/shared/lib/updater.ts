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

import { useEffect, useState } from "react";
import { brand } from "./brand";
import { getElectronAPI, isElectron } from "./electron";
import { createLogger } from "./logger";

const log = createLogger("updater");
const VERSION_CONFIG_URL = brand.updateServerUrl;

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

type ReleaseChannel = "stable" | "dev";

export interface UpdateVersionCatalogPlatform {
  url: string;
}

export interface UpdateVersionCatalogEntry {
  version: string;
  shortVersion: string;
  linux: UpdateVersionCatalogPlatform;
  win?: UpdateVersionCatalogPlatform;
}

export interface UpdateVersionCatalogLatestEntry {
  version: string;
  shortVersion: string;
}

export interface UpdateVersionCatalog {
  latest: Record<ReleaseChannel, UpdateVersionCatalogLatestEntry>;
  versions: Record<ReleaseChannel, UpdateVersionCatalogEntry[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePlatform(
  value: unknown,
  fieldPath: string,
): UpdateVersionCatalogPlatform | undefined {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value) || typeof value.url !== "string" || value.url.trim().length === 0) {
    throw new Error(`Invalid platform payload at ${fieldPath}`);
  }
  return { url: value.url.trim() };
}

function parseCatalogEntry(value: unknown, fieldPath: string): UpdateVersionCatalogEntry {
  if (!isRecord(value)) {
    throw new Error(`Invalid version entry payload at ${fieldPath}`);
  }

  const version = typeof value.version === "string" ? value.version.trim() : "";
  const shortVersion = typeof value.short_version === "string" ? value.short_version.trim() : "";
  const linux = parsePlatform(value.linux, `${fieldPath}.linux`);
  const win = parsePlatform(value.win, `${fieldPath}.win`);

  if (version.length === 0 || shortVersion.length === 0 || linux == null) {
    throw new Error(`Invalid version entry fields at ${fieldPath}`);
  }

  return {
    version,
    shortVersion,
    linux,
    win,
  };
}

function parseLatestEntry(value: unknown, fieldPath: string): UpdateVersionCatalogLatestEntry {
  if (!isRecord(value)) {
    throw new Error(`Invalid latest entry payload at ${fieldPath}`);
  }
  const version = typeof value.version === "string" ? value.version.trim() : "";
  const shortVersion = typeof value.short_version === "string" ? value.short_version.trim() : "";
  if (version.length === 0 || shortVersion.length === 0) {
    throw new Error(`Invalid latest entry fields at ${fieldPath}`);
  }
  return { version, shortVersion };
}

function parseCatalog(payload: unknown): UpdateVersionCatalog {
  if (!isRecord(payload) || !isRecord(payload.latest) || !isRecord(payload.versions)) {
    throw new Error("Invalid version catalog payload");
  }

  const stableLatest = parseLatestEntry(payload.latest.stable, "latest.stable");
  const devLatest = parseLatestEntry(payload.latest.dev, "latest.dev");

  const stableRaw = payload.versions.stable;
  const devRaw = payload.versions.dev;
  if (!Array.isArray(stableRaw) || !Array.isArray(devRaw)) {
    throw new Error("Invalid versions channels payload");
  }

  return {
    latest: {
      stable: stableLatest,
      dev: devLatest,
    },
    versions: {
      stable: stableRaw.map((entry, index) =>
        parseCatalogEntry(entry, `versions.stable[${index}]`),
      ),
      dev: devRaw.map((entry, index) => parseCatalogEntry(entry, `versions.dev[${index}]`)),
    },
  };
}

export async function fetchVersionCatalog(signal?: AbortSignal): Promise<UpdateVersionCatalog> {
  const response = await fetch(VERSION_CONFIG_URL, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Version catalog request failed: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return parseCatalog(payload);
}

function useElectronUpdate(): UpdateState {
  const [state, setState] = useState<Omit<UpdateState, "check" | "install">>({
    status: "idle",
  });

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsub = api.updater.onStatus((data) => {
      log.info("Update status", { status: data.status, version: data.version as string });

      switch (data.status) {
        case "checking":
          setState({ status: "checking" });
          break;
        case "available":
          setState({ status: "available", version: data.version as string });
          break;
        case "up-to-date":
          setState({ status: "up-to-date" });
          break;
        case "downloading":
          setState({
            status: "downloading",
            percent: data.percent as number,
          });
          break;
        case "ready":
          setState({ status: "ready", version: data.version as string });
          break;
        case "error":
          setState({ status: "error", error: data.message as string });
          break;
      }
    });

    return unsub;
  }, []);

  return {
    ...state,
    check: () => getElectronAPI()?.updater.check(),
    install: () => getElectronAPI()?.updater.install(),
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
