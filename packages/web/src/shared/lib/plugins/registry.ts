/**
 * Plugin Registry — central manager for plugin lifecycle.
 *
 * Responsibilities:
 * - Register / unregister plugins
 * - Activate / deactivate with lifecycle hooks
 * - Collect slot contributions from all active plugins
 * - Emit events to subscribed plugins
 * - Enforce permissions
 */

import { createLogger } from "../logger";
import { createPluginAPI } from "./api";
import type {
  Plugin,
  PluginAPI,
  PluginEventName,
  PluginStatus,
  SlotContribution,
  SlotName,
} from "./types";

const log = createLogger("plugins");

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PluginEntry {
  plugin: Plugin;
  status: PluginStatus;
  api: PluginAPI | null;
}

const plugins = new Map<string, PluginEntry>();
const contributions = new Map<string, SlotContribution[]>();
const eventHandlers = new Map<PluginEventName, Map<string, ((...args: unknown[]) => void)[]>>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function registerPlugin(plugin: Plugin): void {
  const { id } = plugin.manifest;

  if (plugins.has(id)) {
    log.warn(`Plugin "${id}" already registered, skipping`);
    return;
  }

  plugins.set(id, { plugin, status: "registered", api: null });
  contributions.set(id, []);
  log.info(`Plugin registered: ${id} v${plugin.manifest.version}`);
  notify();
}

export function unregisterPlugin(pluginId: string): void {
  const entry = plugins.get(pluginId);
  if (!entry) return;

  if (entry.status === "active") {
    void deactivatePlugin(pluginId).catch((err) => {
      log.warn(`Plugin deactivation failed during unregister: ${pluginId}`, {
        error: String(err),
      });
    });
  }

  plugins.delete(pluginId);
  contributions.delete(pluginId);
  removeEventHandlers(pluginId);
  log.info(`Plugin unregistered: ${pluginId}`);
  notify();
}

export async function activatePlugin(pluginId: string): Promise<void> {
  const entry = plugins.get(pluginId);
  if (!entry) {
    log.error(`Cannot activate unknown plugin: ${pluginId}`);
    return;
  }

  if (entry.status === "active") return;

  try {
    const api = createPluginAPI(entry.plugin.manifest, {
      addContribution,
      removeContributions: (id: string) => {
        contributions.set(id, []);
        notify();
      },
      addEventListener: addEventHandler,
      removeEventListener: removeEventHandler,
    });

    entry.api = api;
    await entry.plugin.activate(api);
    entry.status = "active";

    log.info(`Plugin activated: ${pluginId}`);
    emitEvent("plugin:activated", { pluginId });
    notify();
  } catch (err) {
    entry.status = "error";
    log.error(`Plugin activation failed: ${pluginId}`, { error: String(err) });
    notify();
  }
}

export async function deactivatePlugin(pluginId: string): Promise<void> {
  const entry = plugins.get(pluginId);
  if (entry?.status !== "active") return;

  try {
    await entry.plugin.deactivate?.();
  } catch (err) {
    log.warn(`Plugin deactivation error: ${pluginId}`, { error: String(err) });
  }

  contributions.set(pluginId, []);
  removeEventHandlers(pluginId);
  entry.status = "inactive";
  entry.api = null;

  log.info(`Plugin deactivated: ${pluginId}`);
  emitEvent("plugin:deactivated", { pluginId });
  notify();
}

export async function activateAll(): Promise<void> {
  for (const [id, entry] of plugins) {
    if (entry.status === "registered" || entry.status === "inactive") {
      await activatePlugin(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Slot contributions
// ---------------------------------------------------------------------------

function addContribution(pluginId: string, contribution: SlotContribution): void {
  const list = contributions.get(pluginId) ?? [];
  list.push({ ...contribution, pluginId });
  contributions.set(pluginId, list);
  notify();
}

export function getContributions<T = unknown>(slot: SlotName): SlotContribution<T>[] {
  const all: SlotContribution<T>[] = [];

  for (const [, list] of contributions) {
    for (const c of list) {
      if (c.slot === slot) {
        all.push(c as SlotContribution<T>);
      }
    }
  }

  return all.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function addEventHandler(
  pluginId: string,
  event: PluginEventName,
  handler: (...args: unknown[]) => void,
): void {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Map());
  }
  const map = eventHandlers.get(event)!;
  if (!map.has(pluginId)) {
    map.set(pluginId, []);
  }
  map.get(pluginId)!.push(handler);
}

function removeEventHandler(
  pluginId: string,
  event: PluginEventName,
  handler: (...args: unknown[]) => void,
): void {
  const map = eventHandlers.get(event);
  if (!map) return;
  const handlers = map.get(pluginId);
  if (!handlers) return;
  const idx = handlers.indexOf(handler);
  if (idx >= 0) handlers.splice(idx, 1);
}

function removeEventHandlers(pluginId: string): void {
  for (const [, map] of eventHandlers) {
    map.delete(pluginId);
  }
}

export function emitEvent(event: PluginEventName, ...args: unknown[]): void {
  const map = eventHandlers.get(event);
  if (!map) return;

  for (const [pluginId, handlers] of map) {
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (err) {
        log.warn(`Plugin event handler error: ${pluginId}/${event}`, {
          error: String(err),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function getPlugins(): {
  id: string;
  name: string;
  version: string;
  status: PluginStatus;
}[] {
  return Array.from(plugins.entries()).map(([id, entry]) => ({
    id,
    name: entry.plugin.manifest.name,
    version: entry.plugin.manifest.version,
    status: entry.status,
  }));
}

export function getPluginStatus(pluginId: string): PluginStatus | null {
  return plugins.get(pluginId)?.status ?? null;
}

export function isPluginActive(pluginId: string): boolean {
  return plugins.get(pluginId)?.status === "active";
}

// ---------------------------------------------------------------------------
// Subscribe to registry changes (for React hooks)
// ---------------------------------------------------------------------------

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
