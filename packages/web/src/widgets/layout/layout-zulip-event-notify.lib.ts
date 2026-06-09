/**
 * Desktop notification decision + delivery for incoming Zulip messages.
 */
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { registerNotifiedMessageId } from "~/shared/lib/notification-dedup.lib";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { shouldDesktopNotify } from "~/shared/lib/notifications-policy";
import { buildRouteFromMessage } from "~/shared/lib/push-click";
import { buildStreamMessageNotificationFlags } from "~/shared/lib/stream-notification-notify.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { buildNotificationFallbackTag } from "./layout-notification-tag.lib";
import {
  buildNotificationTitleContextFromMessage,
  formatNotificationTitle,
} from "./layout-notification-title.lib";
import { readViewportState } from "./layout-zulip-event-viewport.lib";
import { upsertNotificationAggregate } from "./notification-aggregate-registry.lib";
import type { LayoutZulipEventDispatchContext } from "./layout-zulip-event-dispatch.types";

export function resolveStreamMessageMuteState(
  raw: ZulipRawMessage,
  mute: LayoutZulipEventDispatchContext["mute"],
): { isMuted: boolean; isTopicFollowed: boolean } {
  if (raw.type !== "stream" || raw.stream_id == null) {
    return { isMuted: false, isTopicFollowed: false };
  }
  const topic = normalizeTopicForIdentity(raw.subject ?? "");
  const isStreamMuted = mute.isStreamMuted(raw.stream_id);
  return {
    isMuted: isStreamMuted || mute.isEffectivelyMuted(raw.stream_id, topic),
    isTopicFollowed: mute.isTopicFollowed(raw.stream_id, topic),
  };
}

export function deliverDesktopNotificationForMessage(
  raw: ZulipRawMessage,
  notifications: LayoutZulipEventDispatchContext["notifications"],
  playSound: boolean,
  soundPreset: ReturnType<typeof resolveNotificationSoundPreset>,
  currentUserId: number | null,
  currentInstanceId: string | null,
): void {
  registerNotifiedMessageId(raw.id);

  const contentPreview = plainTextPreviewFromMessageBody(raw.content ?? "").slice(0, 100);
  const clickRoute =
    buildRouteFromMessage(
      {
        id: raw.id,
        stream_id: raw.stream_id ?? null,
        display_recipient: raw.display_recipient,
        subject: raw.subject ?? "",
      },
      currentUserId,
    ) ?? undefined;
  const titleContext = buildNotificationTitleContextFromMessage(raw, currentUserId);
  const aggregate = upsertNotificationAggregate({
    message: raw,
    currentUserId,
    currentInstanceId,
    body: contentPreview,
    clickRoute,
    titleContext,
  });
  const notificationTitle =
    aggregate != null
      ? formatNotificationTitle(aggregate.titleContext, aggregate.count)
      : formatNotificationTitle(titleContext);
  const notificationTag = aggregate?.tag ?? buildNotificationFallbackTag(raw.id, currentInstanceId);

  notifications
    .show({
      title: notificationTitle,
      body: contentPreview,
      tag: notificationTag,
      silent: true,
      ...(clickRoute != null ? { clickRoute } : {}),
    })
    .catch((err) => reportUnexpectedError("layout:notification", err, { messageId: raw.id }));

  if (playSound && soundPreset !== "none") {
    notifications.playSound(soundPreset);
  }

  notifications.requestAttentionIfNotFocused();
}

export function maybeNotifyNewMessage(
  ctx: LayoutZulipEventDispatchContext,
  raw: ZulipRawMessage,
  currentUserId: number | null,
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

  const streamFlags =
    raw.type === "stream" && raw.stream_id != null
      ? buildStreamMessageNotificationFlags(raw.stream_id, serverSettings, ctx.mute)
      : {
          streamAllMessagesNotifyEnabled: false,
          streamAllMessagesAudibleEnabled: false,
        };

  const decision = shouldDesktopNotify({
    message: {
      type: raw.type ?? "stream",
      flags: raw.flags,
      isTopicFollowed,
      ...streamFlags,
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

  deliverDesktopNotificationForMessage(
    raw,
    ctx.notifications,
    decision.playSound,
    resolvedPreset,
    currentUserId,
    ctx.currentInstanceId,
  );
}
