/**
 * Plugin system — public API barrel.
 *
 * Re-exports everything needed to:
 * 1. Author a plugin (types, PluginAPI)
 * 2. Register plugins (registerPlugin, activateAll)
 * 3. Consume extension points (useSlot, PluginSlot, useSlotActions)
 * 4. Manage lifecycle (activate, deactivate, getPlugins)
 * 5. Emit events from host code (emitEvent)
 */

// Types
export type {
  Plugin,
  PluginManifest,
  PluginAPI,
  PluginPermission,
  PluginStatus,
  PluginEventName,
  SlotName,
  SlotContribution,
} from "./types";

// Registry
export {
  registerPlugin,
  unregisterPlugin,
  activatePlugin,
  deactivatePlugin,
  activateAll,
  getPlugins,
  getPluginStatus,
  isPluginActive,
  getContributions,
  emitEvent,
} from "./registry";

// React hooks + slot component
export { useSlot, useSlotActions } from "./hooks";
export { PluginSlot } from "./plugin-slot.ui";

// API setup
export { setPluginNavigate, setPluginDataProvider } from "./api";
export type { PluginDataProvider } from "./api";
