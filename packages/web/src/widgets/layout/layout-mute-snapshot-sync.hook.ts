/**
 * React-хук жизненного цикла mute snapshot sync.
 * Зачем нужен: запускать/останавливать централизованный sync автоматически при смене инстанса.
 */
import { useEffect } from "react";
import { startMuteSnapshotSync } from "./layout-mute-snapshot-sync.lib";

// Поднимает sync только при наличии активного instanceId.
export function useLayoutMuteSnapshotSync(currentInstanceId: string | null): void {
  useEffect(() => {
    if (!currentInstanceId) return;
    return startMuteSnapshotSync({ instanceId: currentInstanceId });
  }, [currentInstanceId]);
}
