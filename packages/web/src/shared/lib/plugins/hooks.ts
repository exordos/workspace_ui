/**
 * React hooks for plugin extension points.
 *
 * These hooks allow host code to read plugin contributions for a slot
 * reactively via useSyncExternalStore.
 */

import { useSyncExternalStore } from "react";
import { getContributions, subscribe } from "./registry";
import type { SlotContribution, SlotName } from "./types";

export function useSlot<T = unknown>(slot: SlotName): SlotContribution<T>[] {
  return useSyncExternalStore(subscribe, () => getContributions<T>(slot));
}

export function useSlotActions<T = unknown>(
  slot: SlotName,
  context?: T,
): {
  pluginId: string;
  label: string;
  icon?: string;
  execute: () => void | Promise<void>;
}[] {
  const items = useSlot<T>(slot);

  return items
    .filter((item) => {
      if (!item.handler) return false;
      if (item.when && !item.when(context as T)) return false;
      return true;
    })
    .map((item) => ({
      pluginId: item.pluginId,
      label: item.label ?? item.pluginId,
      icon: item.icon,
      execute: () => item.handler!(context as T),
    }));
}
