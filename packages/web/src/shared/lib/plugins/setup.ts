/**
 * Plugin system bootstrap.
 *
 * Called once in main.tsx. Registers built-in plugins and activates all.
 * External plugins can be registered later via `registerPlugin()`.
 *
 * Also exposes `window.__plugins__` for dev tools / AI agents.
 */

import { createLogger } from "../logger";
import {
  registerPlugin,
  activateAll,
  getPlugins,
  activatePlugin,
  deactivatePlugin,
} from "./registry";
import type { Plugin } from "./types";

const log = createLogger("plugins");

export async function initPlugins(): Promise<void> {
  log.info("Plugin system initializing");

  await activateAll();

  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__plugins__ = {
      list: getPlugins,
      register: registerPlugin,
      activate: activatePlugin,
      deactivate: deactivatePlugin,
    };
  }

  log.info("Plugin system ready", { count: getPlugins().length });
}

/**
 * Register a plugin from external code (e.g. a <script> tag or dynamic import).
 * The plugin is activated immediately if the plugin system is already initialized.
 */
export function loadPlugin(plugin: Plugin): void {
  registerPlugin(plugin);
  activatePlugin(plugin.manifest.id).catch((err) => {
    log.error(`Failed to load plugin: ${plugin.manifest.id}`, { error: String(err) });
  });
}
