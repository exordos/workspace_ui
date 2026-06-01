/**
 * Desktop notification decision + delivery for incoming Zulip messages.
 */
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import type { ZulipRawMessage } from "~/shared/api/zulip";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { registerNotifiedMessageId } from "~/shared/lib/notification-dedup.lib";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { shouldDesktopNotify } from "~/shared/lib/notifications-policy";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { readViewportState } from "./layout-zulip-event-viewport.lib";
import type { LayoutZulipEventDispatchContext } from "./layout-zulip-event-dispatch.types";

export function resolveStreamMessageMuteState(
  raw: ZulipRawMessage,
  mute: LayoutZulipEventDispatchContext["mute"],
): { isMuted: boolean; isTopicFollowed: boolean } {
  if (raw.type !== "stream" || raw.stream_id == null) {
    return { isMuted: false, isTopicFollowed: false };
  }
  const topic = normalizeTopicForIdentity(raw.subject ?? "");
  return {
    isMuted: mute.isEffectivelyMuted(raw.stream_id, topic),
    isTopicFollowed: mute.isTopicFollowed(raw.stream_id, topic),
  };
}

export function deliverDesktopNotificationForMessage(
  raw: ZulipRawMessage,
  notifications: LayoutZulipEventDispatchContext["notifications"],
  playSound: boolean,
  soundPreset: ReturnType<typeof resolveNotificationSoundPreset>,
): void {
  registerNotifiedMessageId(raw.id);

  const senderName = raw.sender_full_name ?? "New message";
  const contentPreview = plainTextPreviewFromMessageBody(raw.content ?? "").slice(0, 100);

  notifications
    .show({
      title: senderName,
      body: contentPreview,
      tag: `msg-${raw.id}`,
      silent: true,
    })
    .catch(() => {});

  if (playSound && soundPreset !== "none") {
    notifications.playSound(soundPreset);
  }

  notifications.requestAttentionIfNotFocused();
}

export function maybeNotifyNewMessage(
  ctx: LayoutZulipEventDispatchContext,
  raw: ZulipRawMessage,
  _currentUserId: number | null,
  isForCurrentChat: boolean,
  isFromSelf: boolean,
): void {
  const { isMuted, isTopicFollowed } = resolveStreamMessageMuteState(raw, ctx.mute);
  const serverSettings = useNotificationSettingsStore.getState().settings;
  const localSound = useSettingsStore.getState().notificationSound;
  const resolvedPreset = resolveNotificationSoundPreset(
    serverSettings.notificationSound,
    localSound,
  );

  const decision = shouldDesktopNotify({
    message: {
      type: raw.type ?? "stream",
      flags: raw.flags,
      isTopicFollowed,
    },
    viewport: {
      isFromSelf,
      isOnScreenInCurrentChat: isForCurrentChat,
      isMuted,
      ...readViewportState(),
    },
    settings: serverSettings,
  });

  if (!decision.notify) return;

  deliverDesktopNotificationForMessage(raw, ctx.notifications, decision.playSound, resolvedPreset);
}
