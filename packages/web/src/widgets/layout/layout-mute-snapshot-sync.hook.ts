/**
 * React lifecycle hook for mute snapshot sync — starts/stops on instance change.
 */
import { useEffect } from "react";
import { startMuteSnapshotSync } from "./layout-mute-snapshot-sync.lib";

export function useLayoutMuteSnapshotSync(currentInstanceId: string | null, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (!currentInstanceId) return;
    return startMuteSnapshotSync({ instanceId: currentInstanceId });
  }, [currentInstanceId, enabled]);
}
