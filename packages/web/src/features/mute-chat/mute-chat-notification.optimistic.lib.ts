import { guard } from "~/shared/lib/guards";
import { optimisticMutation } from "~/shared/lib/optimistic-mutation.lib";
import { useMuteStore } from "./mute-chat.model";
import type { NotificationLevel } from "./notification-level.lib";

interface StreamNotificationSnapshot {
  isMuted: boolean;
  desktopEnabled: boolean;
  desktopDisabled: boolean;
  audibleEnabled: boolean;
  audibleDisabled: boolean;
}

function captureStreamNotificationSnapshot(streamId: number): StreamNotificationSnapshot {
  const muteStore = useMuteStore.getState();
  return {
    isMuted: muteStore.isStreamMuted(streamId),
    desktopEnabled: muteStore.streamDesktopNotifyEnabledIds.has(streamId),
    desktopDisabled: muteStore.streamDesktopNotifyDisabledIds.has(streamId),
    audibleEnabled: muteStore.streamAudibleNotifyEnabledIds.has(streamId),
    audibleDisabled: muteStore.streamAudibleNotifyDisabledIds.has(streamId),
  };
}

function restoreStreamNotificationSnapshot(
  streamId: number,
  snapshot: StreamNotificationSnapshot,
): void {
  const muteStore = useMuteStore.getState();
  if (snapshot.isMuted) {
    muteStore.muteStream(streamId);
  } else {
    muteStore.unmuteStream(streamId);
  }

  if (snapshot.desktopEnabled) {
    muteStore.setStreamDesktopNotifications(streamId, true);
  } else if (snapshot.desktopDisabled) {
    muteStore.setStreamDesktopNotifications(streamId, false);
  } else {
    muteStore.clearStreamDesktopNotificationsOverride(streamId);
  }

  if (snapshot.audibleEnabled) {
    muteStore.setStreamAudibleNotifications(streamId, true);
  } else if (snapshot.audibleDisabled) {
    muteStore.setStreamAudibleNotifications(streamId, false);
  } else {
    muteStore.clearStreamAudibleNotificationsOverride(streamId);
  }
}

function applyStreamNotificationLevelOptimistic(streamId: number, level: NotificationLevel): void {
  const muteStore = useMuteStore.getState();
  if (level === "muted") {
    muteStore.muteStream(streamId);
    return;
  }
  muteStore.unmuteStream(streamId);
  if (level === "subscribed") {
    muteStore.setStreamDesktopNotifications(streamId, true);
    muteStore.setStreamAudibleNotifications(streamId, true);
    return;
  }
  muteStore.setStreamDesktopNotifications(streamId, false);
  muteStore.setStreamAudibleNotifications(streamId, false);
}

interface RunOptimisticStreamNotificationLevelUpdateParams {
  streamId: number;
  level: NotificationLevel;
  request: () => Promise<boolean>;
}

export async function runOptimisticStreamNotificationLevelUpdate({
  streamId,
  level,
  request,
}: RunOptimisticStreamNotificationLevelUpdateParams): Promise<boolean> {
  guard.streamId(streamId, "runOptimisticStreamNotificationLevelUpdate");
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
