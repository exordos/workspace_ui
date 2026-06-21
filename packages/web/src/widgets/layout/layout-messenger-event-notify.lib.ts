/**
 * Desktop notification decision + delivery for incoming messenger messages.
 */
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { registerNotifiedMessageId } from "~/shared/lib/notification-dedup.lib";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { shouldDesktopNotify } from "~/shared/lib/notifications-policy";
import { buildRouteFromMessage } from "~/shared/lib/push-click";
import { buildStreamMessageNotificationFlags } from "~/shared/lib/stream-notification-notify.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { readViewportState } from "./layout-messenger-event-viewport.lib";
import { buildNotificationFallbackTag } from "./layout-notification-tag.lib";
import {
  buildNotificationTitleContextFromMessage,
  formatNotificationTitle,
} from "./layout-notification-title.lib";
import { upsertNotificationAggregate } from "./notification-aggregate-registry.lib";
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

export function resolveStreamMessageMuteState(
  raw: WorkspaceRawMessage,
  mute: LayoutMessengerEventDispatchContext["mute"],
): { isMuted: boolean; isTopicFollowed: boolean } {
  if (raw.type !== "stream" || raw.stream_uuid == null) {
    return { isMuted: false, isTopicFollowed: false };
  }
  const topic = normalizeTopicForIdentity(raw.subject ?? "");
  const isStreamMuted = mute.isStreamMuted(raw.stream_uuid);
  return {
    isMuted: isStreamMuted || mute.isEffectivelyMuted(raw.stream_uuid, topic),
    isTopicFollowed: mute.isTopicFollowed(raw.stream_uuid, topic),
  };
}

export function deliverDesktopNotificationForMessage(
  raw: WorkspaceRawMessage,
  notifications: LayoutMessengerEventDispatchContext["notifications"],
  playSound: boolean,
  soundPreset: ReturnType<typeof resolveNotificationSoundPreset>,
  currentUserId: UserId | null,
  currentInstanceId: string | null,
): void {
  registerNotifiedMessageId(raw.id);

  const contentPreview = plainTextPreviewFromMessageBody(raw.content ?? "").slice(0, 100);
  const clickRoute =
    buildRouteFromMessage(
      {
        id: raw.id,
        stream_uuid: raw.stream_uuid ?? null,
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
  ctx: LayoutMessengerEventDispatchContext,
  raw: WorkspaceRawMessage,
  currentUserId: UserId | null,
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
    raw.type === "stream" && raw.stream_uuid != null
      ? buildStreamMessageNotificationFlags(raw.stream_uuid, serverSettings, ctx.mute)
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
