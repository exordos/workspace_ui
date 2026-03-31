/**
 * Plugin API factory — creates a restricted API surface for each plugin.
 *
 * Each plugin gets its own sandboxed API instance. Access to features
 * is gated by the permissions declared in the plugin manifest.
 */

import { getLocale } from "~/i18n/i18n";
import { analytics } from "../analytics/analytics";
import { showDesktopNotification } from "../electron";
import { createLogger } from "../logger";
import { getRuntime } from "../pwa";
import type {
  PluginAPI,
  PluginEventName,
  PluginManifest,
  PluginPermission,
  SlotContribution,
} from "./types";

// ---------------------------------------------------------------------------
// Data provider (FSD: injected by app layer to avoid shared→entities import)
// ---------------------------------------------------------------------------

export interface PluginDataProvider {
  getCurrentUserId(): number | null;
  getStreams(): { id: number; name: string; badge?: number }[];
  getThemeMode(): string;
}

let dataProvider: PluginDataProvider | null = null;

/** Set by the app layer to provide entity store data to the plugin API. */
export function setPluginDataProvider(provider: PluginDataProvider): void {
  dataProvider = provider;
}

// ---------------------------------------------------------------------------
// Internal callbacks (injected by registry)
// ---------------------------------------------------------------------------

export interface RegistryCallbacks {
  addContribution(pluginId: string, contribution: SlotContribution): void;
  removeContributions(pluginId: string): void;
  addEventListener(
    pluginId: string,
    event: PluginEventName,
    handler: (...args: unknown[]) => void,
  ): void;
  removeEventListener(
    pluginId: string,
    event: PluginEventName,
    handler: (...args: unknown[]) => void,
  ): void;
}

// ---------------------------------------------------------------------------
// Navigation callback (set externally by App.tsx)
// ---------------------------------------------------------------------------

let navigateFn: ((path: string) => void) | null = null;

export function setPluginNavigate(fn: (path: string) => void): void {
  navigateFn = fn;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function hasPermission(manifest: PluginManifest, perm: PluginPermission): boolean {
  return manifest.permissions?.includes(perm) ?? false;
}

export function createPluginAPI(manifest: PluginManifest, callbacks: RegistryCallbacks): PluginAPI {
  const pluginId = manifest.id;
  const log = createLogger(`plugin:${pluginId}`);
  const STORAGE_PREFIX = `plugin:${pluginId}:`;

  const api: PluginAPI = {
    manifest,

    // -- Contributions --------------------------------------------------------

    contribute<T = unknown>(contribution: Omit<SlotContribution<T>, "pluginId">) {
      callbacks.addContribution(pluginId, {
        ...contribution,
        pluginId,
      } as SlotContribution);
    },

    removeContributions() {
      callbacks.removeContributions(pluginId);
    },

    // -- Navigation -----------------------------------------------------------

    navigate(path: string) {
      if (!hasPermission(manifest, "navigate")) {
        log.warn("navigate() called without 'navigate' permission");
        return;
      }
      // Only allow internal app paths — block absolute URLs, protocol-relative
      // paths, and protocol handlers (javascript:, data:, etc.)
      if (!path.startsWith("/") || path.startsWith("//")) {
        log.warn("navigate() blocked: path must be a relative app route", { path });
        return;
      }
      if (navigateFn) {
        navigateFn(path);
      }
    },

    // -- Storage (scoped) -----------------------------------------------------

    storage: {
      get<T>(key: string): T | null {
        if (!hasPermission(manifest, "storage")) return null;
        try {
          const raw = localStorage.getItem(STORAGE_PREFIX + key);
          return raw ? (JSON.parse(raw) as T) : null;
        } catch {
          return null;
        }
      },

      set<T>(key: string, value: T) {
        if (!hasPermission(manifest, "storage")) return;
        try {
          localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        } catch {
          log.warn("Storage write failed", { key });
        }
      },

      remove(key: string) {
        if (!hasPermission(manifest, "storage")) return;
        try {
          localStorage.removeItem(STORAGE_PREFIX + key);
        } catch {
          log.warn("Storage remove failed", { key });
        }
      },
    },

    // -- Logger ---------------------------------------------------------------

    log: {
      debug: (msg, data) => log.debug(msg, data),
      info: (msg, data) => log.info(msg, data),
      warn: (msg, data) => log.warn(msg, data),
      error: (msg, data) => log.error(msg, data),
    },

    // -- Read-only data -------------------------------------------------------

    data: {
      getCurrentUserId() {
        return dataProvider?.getCurrentUserId() ?? null;
      },

      getStreams() {
        if (!hasPermission(manifest, "read:streams")) return [];
        return (dataProvider?.getStreams() ?? []).map((s) => ({
          id: s.id,
          name: s.name,
        }));
      },

      getUnreadCount() {
        if (!hasPermission(manifest, "read:messages")) return 0;
        const streams = dataProvider?.getStreams() ?? [];
        return streams.reduce((sum, s) => sum + (s.badge ?? 0), 0);
      },

      getTheme() {
        return dataProvider?.getThemeMode() ?? "dark";
      },

      getLocale() {
        return getLocale();
      },

      getRuntime() {
        return getRuntime();
      },
    },

    // -- Events ---------------------------------------------------------------

    on(event: PluginEventName, handler: (...args: unknown[]) => void): () => void {
      callbacks.addEventListener(pluginId, event, handler);
      return () => callbacks.removeEventListener(pluginId, event, handler);
    },
  };

  // -- Conditional capabilities (permission-gated) ----------------------------

  if (hasPermission(manifest, "analytics")) {
    api.track = (event, properties) => {
      analytics.track(event, { ...properties, plugin: pluginId });
    };
  }

  if (hasPermission(manifest, "notifications")) {
    api.notify = async (title, body) => {
      await showDesktopNotification(title, body);
    };
  }

  return api;
}
