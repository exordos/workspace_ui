import type { ReactNode } from "react";
import type { SlotName } from "./types";

export interface PluginSlotProps<T = unknown> {
  name: SlotName;
  /** Props passed to each contribution's render function. */
  context?: T;
  /** Wrapper className for the slot container. */
  className?: string;
  /** Fallback when no plugins contribute to this slot. */
  fallback?: ReactNode;
}
