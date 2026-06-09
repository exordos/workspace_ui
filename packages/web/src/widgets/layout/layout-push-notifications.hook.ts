import { useEffect } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { normalizeRealm } from "~/shared/api/zulip-realm.internal";
import {
  registerNotifiedMessageId,
  wasRecentlyNotified,
} from "~/shared/lib/notification-dedup.lib";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { notificationService } from "~/shared/lib/notifications";
import { shouldDesktopNotify } from "~/shared/lib/notifications-policy";
import { pushService, type PushMessagePayload } from "~/shared/lib/push/push.service";
import { buildStreamMessageNotificationFlags } from "~/shared/lib/stream-notification-notify.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { buildNotificationFallbackTag } from "./layout-notification-tag.lib";

function readViewportState(): { windowFocused: boolean; windowHidden: boolean } {
  if (typeof document === "undefined") {
    return { windowFocused: true, windowHidden: false };
  }
  return {
    windowFocused: document.hasFocus(),
    windowHidden: document.hidden,
  };
}

function resolvePushNotificationInstanceId(payload: PushMessagePayload): string | null {
  const store = useInstancesStore.getState();
  const currentInstanceId = store.currentInstanceId;
  const realmUri = payload.realm_uri?.trim() ?? "";
  if (realmUri.length === 0) {
    return currentInstanceId;
  }

  const normalizedRealm = normalizeRealm(realmUri).toLowerCase();
  if (normalizedRealm.length === 0) {
    return currentInstanceId;
  }

  const matchedInstance = store.instances.find(
    (instance) => normalizeRealm(instance.realm).toLowerCase() === normalizedRealm,
  );
  return matchedInstance?.id ?? currentInstanceId;
}

function handleForegroundPush(payload: PushMessagePayload): void {
  if (payload.event !== "message" || payload.message == null) return;

  const message = payload.message;
  const messageId = message.id;
  if (messageId != null && wasRecentlyNotified(messageId)) {
    return;
  }

  const mute = useMuteStore.getState();
  let isMuted = false;
  let isTopicFollowed = false;
  if (message.type === "stream" && message.stream_id != null) {
    const topic = normalizeTopicForIdentity(message.topic ?? "");
    isMuted = mute.isEffectivelyMuted(message.stream_id, topic);
    isTopicFollowed = mute.isTopicFollowed(message.stream_id, topic);
  }

  const serverSettings = useNotificationSettingsStore.getState().settings;
  const localSound = useSettingsStore.getState().notificationSound;
  const resolvedPreset = resolveNotificationSoundPreset(
    serverSettings.notificationSound,
    localSound,
  );

  const streamFlags =
    message.type === "stream" && message.stream_id != null
      ? buildStreamMessageNotificationFlags(message.stream_id, serverSettings, mute)
      : {
          streamAllMessagesNotifyEnabled: false,
          streamAllMessagesAudibleEnabled: false,
        };

  const decision = shouldDesktopNotify({
    message: {
      type: message.type,
      flags: message.flags,
      isTopicFollowed,
      ...streamFlags,
    },
    viewport: {
      isFromSelf: false,
      isOnScreenInCurrentChat: false,
      isMuted,
      ...readViewportState(),
    },
    settings: serverSettings,
  });

  if (!decision.notify) return;

  if (messageId != null) {
    registerNotifiedMessageId(messageId);
  }

  const title = message.sender_full_name ?? "New message";
  const body = (message.content ?? "").slice(0, 100);
  const playSound = decision.playSound && resolvedPreset !== "none";
  const instanceId = resolvePushNotificationInstanceId(payload);

  void notificationService
    .show({
      title,
      body,
      tag:
        messageId != null
          ? buildNotificationFallbackTag(messageId, instanceId)
          : `push-${Date.now()}`,
      silent: true,
    })
    .catch((err) => {
      reportUnexpectedError("notifications", err, { phase: "foreground-push-show" });
    });

  if (playSound) {
    playNotificationSound(resolvedPreset);
  }
}

export function useLayoutPushNotifications(options: { enabled: boolean }): void {
  const { enabled } = options;

  useEffect(() => {
    if (!enabled) return;
    return pushService.onMessage(handleForegroundPush);
  }, [enabled]);
}
