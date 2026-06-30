// React hook to start/stop centralized chat-list snapshot sync in IDB.
import { useEffect } from "react";
import { startChatListSnapshotSync } from "./layout-chat-list-snapshot-sync.lib";

export function useLayoutChatListSnapshotSync(
  currentInstanceId: string | null,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    if (currentInstanceId == null) return;
    return startChatListSnapshotSync({ instanceId: currentInstanceId });
  }, [currentInstanceId, enabled]);
}
