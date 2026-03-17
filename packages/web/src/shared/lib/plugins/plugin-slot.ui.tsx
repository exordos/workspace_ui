import React from "react";
import { useSlot } from "./hooks";
import type { SlotName } from "./types";

interface PluginSlotProps<T = unknown> {
  name: SlotName;
  /** Props passed to each contribution's render function. */
  context?: T;
  /** Wrapper className for the slot container. */
  className?: string;
  /** Fallback when no plugins contribute to this slot. */
  fallback?: React.ReactNode;
}

export function PluginSlot<T = unknown>({
  name,
  context,
  className,
  fallback,
}: PluginSlotProps<T>): React.ReactElement | null {
  const items = useSlot<T>(name);

  const visible = items.filter((item) => {
    if (item.when && !item.when(context as T)) return false;
    return !!item.render;
  });

  if (visible.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <div className={className} data-plugin-slot={name}>
      {visible.map((item, i) => (
        <React.Fragment key={`${item.pluginId}-${i}`}>{item.render!(context as T)}</React.Fragment>
      ))}
    </div>
  );
}
