// React-хук для запуска/остановки централизованного синка chat-list snapshot в IDB.
import { useEffect } from "react";
import { startChatListSnapshotSync } from "./layout-chat-list-snapshot-sync.lib";

// Синк активируется только для выбранного инстанса.
export function useLayoutChatListSnapshotSync(currentInstanceId: string | null): void {
  useEffect(() => {
    if (currentInstanceId == null) return;
    return startChatListSnapshotSync({ instanceId: currentInstanceId });
  }, [currentInstanceId]);
}
