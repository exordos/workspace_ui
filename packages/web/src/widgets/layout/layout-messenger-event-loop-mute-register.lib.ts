import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { persistMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import type { LayoutMuteSnapshot } from "./layout-instance-bootstrap.hook";

export function applyLayoutRegisterMuteSnapshot(options: {
  cancelled: boolean;
  currentInstanceId: string | null;
  snapshot: LayoutMuteSnapshot;
  markRegisterMuteSnapshotApplied: () => void;
}): void {
  if (options.cancelled) {
    return;
  }
  options.markRegisterMuteSnapshotApplied();
  useMuteStore.getState().setFromServer(options.snapshot);
  if (options.currentInstanceId == null) {
    return;
  }
  void persistMuteSnapshotRow({
    instanceId: options.currentInstanceId,
    version: 4,
    savedAt: Date.now(),
    mutedStreamIds: options.snapshot.mutedStreamIds,
    streamNotificationModes: options.snapshot.streamNotificationModes,
    topicNotificationModes: options.snapshot.topicNotificationModes,
  });
}
