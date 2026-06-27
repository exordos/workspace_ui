import { guard } from "~/shared/lib/guards";
import { optimisticMutation } from "~/shared/lib/optimistic-mutation.lib";
import { useMuteStore } from "./mute-chat.model";
import {
  streamNotificationLevelToMode,
  type NotificationLevel,
  type StreamNotificationMode,
} from "./notification-level.lib";

interface StreamNotificationSnapshot {
  mode: StreamNotificationMode;
}

function captureStreamNotificationSnapshot(streamId: string): StreamNotificationSnapshot {
  const muteStore = useMuteStore.getState();
  return {
    mode: muteStore.getStreamNotificationMode(streamId),
  };
}

function restoreStreamNotificationSnapshot(
  streamId: string,
  snapshot: StreamNotificationSnapshot,
): void {
  useMuteStore.getState().setStreamNotificationMode(streamId, snapshot.mode);
}

function applyStreamNotificationLevelOptimistic(streamId: string, level: NotificationLevel): void {
  useMuteStore.getState().setStreamNotificationMode(streamId, streamNotificationLevelToMode(level));
}

interface RunOptimisticStreamNotificationLevelUpdateParams {
  streamId: string;
  level: NotificationLevel;
  request: () => Promise<boolean>;
}

export async function runOptimisticStreamNotificationLevelUpdate({
  streamId,
  level,
  request,
}: RunOptimisticStreamNotificationLevelUpdateParams): Promise<boolean> {
  guard.streamUuid(streamId, "runOptimisticStreamNotificationLevelUpdate");
  const snapshot = captureStreamNotificationSnapshot(streamId);
  const result = await optimisticMutation({
    apply: () => applyStreamNotificationLevelOptimistic(streamId, level),
    request,
    reconcile: () => {},
    rollback: () => restoreStreamNotificationSnapshot(streamId, snapshot),
    rollbackOnFalsy: true,
    label: "stream-notification-level",
  });
  return result === true;
}
