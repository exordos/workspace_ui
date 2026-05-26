import { useSyncExternalStore } from "react";
import {
  getConnectionHealthSnapshot,
  subscribeConnectionHealth,
  type ConnectionHealthSnapshot,
} from "~/shared/lib/connection-health";

export function useConnectionHealthSnapshot(): ConnectionHealthSnapshot {
  return useSyncExternalStore(
    subscribeConnectionHealth,
    getConnectionHealthSnapshot,
    getConnectionHealthSnapshot,
  );
}
