/**
 * Plugin system type definitions.
 *
 * Defines the contract between the host app and plugins:
 * - PluginManifest: static metadata (id, name, version, required slots)
 * - Plugin: the runtime object with lifecycle hooks
 * - Slot: named extension point in the UI or logic layer
 * - PluginAPI: restricted surface exposed to each plugin
 */

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Manifest — static description of a plugin
// ---------------------------------------------------------------------------

export interface PluginManifest {
  /** Unique ID (reverse-domain: com.example.my-plugin). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semver version string. */
  version: string;
  /** Short description. */
  description?: string;
  /** Author / organization. */
  author?: string;
  /** Minimum host app version required. */
  minAppVersion?: string;
  /** Slots this plugin contributes to. */
  slots?: SlotName[];
  /** Permissions this plugin requests. */
  permissions?: PluginPermission[];
}

// ---------------------------------------------------------------------------
// Slots — named extension points
// ---------------------------------------------------------------------------

export type SlotName =
  | "sidebar:widget"
  | "sidebar:footer"
  | "topbar:action"
  | "message:action"
  | "message:renderer"
  | "composer:toolbar"
  | "composer:slash-command"
  | "settings:panel"
  | "route:custom";

export interface SlotContribution<T = unknown> {
  pluginId: string;
  slot: SlotName;
  /** Sort order within the slot (lower = first). Default 100. */
  priority?: number;
  /** The contribution payload — varies by slot type. */
  render?: (props: T) => ReactNode;
  /** For non-visual slots (slash commands, message actions). */
  handler?: (context: T) => void | Promise<void>;
  /** Label for UI items (toolbar buttons, menu items). */
  label?: string;
  /** Icon name or SVG string. */
  icon?: string;
  /** When to show (return false to hide). */
  when?: (context: T) => boolean;
}

// ---------------------------------------------------------------------------
// Permissions — explicit opt-in
// ---------------------------------------------------------------------------

export type PluginPermission =
  | "read:messages"
  | "read:users"
  | "read:streams"
  | "read:settings"
  | "write:messages"
  | "navigate"
  | "notifications"
  | "analytics"
  | "shortcuts"
  | "storage";

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export type PluginStatus = "registered" | "active" | "inactive" | "error";

export interface Plugin {
  manifest: PluginManifest;
  /** Called when the plugin is activated. Receives the restricted API. */
  activate(api: PluginAPI): void | Promise<void>;
  /** Called when the plugin is deactivated. Clean up resources. */
  deactivate?(): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Plugin API — restricted surface exposed to plugins
// ---------------------------------------------------------------------------

export interface PluginAPI {
  /** Plugin's own manifest. */
  readonly manifest: PluginManifest;

  // -- Extension points -----------------------------------------------------
  /** Register a contribution to a UI/logic slot. */
  contribute<T = unknown>(contribution: Omit<SlotContribution<T>, "pluginId">): void;
  /** Remove all contributions by this plugin. */
  removeContributions(): void;

  // -- Navigation -----------------------------------------------------------
  navigate(path: string): void;

  // -- Storage (scoped to plugin) -------------------------------------------
  storage: {
    get<T>(key: string): T | null;
    set<T>(key: string, value: T): void;
    remove(key: string): void;
  };

  // -- Logger (scoped to plugin) --------------------------------------------
  log: {
    debug(msg: string, data?: Record<string, unknown>): void;
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
    error(msg: string, data?: Record<string, unknown>): void;
  };

  // -- Analytics (if permission granted) ------------------------------------
  track?(event: string, properties?: Record<string, unknown>): void;

  // -- Shortcuts (if permission granted) ------------------------------------
  registerShortcut?(combo: string, label: string, handler: () => void): () => void;

  // -- Notifications (if permission granted) --------------------------------
  notify?(title: string, body: string): Promise<void>;

  // -- Read-only data (if permissions granted) ------------------------------
  data: {
    getCurrentUserId(): number | null;
    getStreams(): { id: number; name: string }[];
    getUnreadCount(): number;
    getTheme(): string;
    getLocale(): string;
    getRuntime(): string;
  };

  // -- Events ---------------------------------------------------------------
  on(event: PluginEventName, handler: (...args: unknown[]) => void): () => void;
}

export type PluginEventName =
  | "message:received"
  | "message:sent"
  | "navigation:changed"
  | "theme:changed"
  | "network:status"
  | "plugin:activated"
  | "plugin:deactivated";
