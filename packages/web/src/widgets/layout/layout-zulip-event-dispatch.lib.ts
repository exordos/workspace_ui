import { isMessageForContext } from "~/entities/message/message.model";
import { resolveIncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call-invite.lib";
import { resolveTypingEventRoute } from "~/features/typing-indicator/typing-event-routing";
import { getCurrentInstance } from "~/shared/api/client";
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip";
import { rawMessageToMockMessage } from "~/shared/api/zulip";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { getElectronAPI } from "~/shared/lib/electron";
import {
  applyZulipEventToMessageIndexedDb,
  isChatMessagesPersistToIndexedDbEnabled,
} from "~/shared/lib/message-idb-from-zulip.lib";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { shouldNotify } from "~/shared/lib/notifications-policy";
import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import type {
  LayoutMessageFlagOp,
  LayoutNotificationsActions,
  LayoutZulipEventDispatchContext,
} from "./layout-zulip-event-dispatch.types";

// Проверяет, что значение является валидным положительным id.
function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Что делает: приводит payload subscription/add к metadata-формату для store.
function parseSubscriptionRows(value: unknown): {
  streamId: number;
  name: string;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
}[] {
  if (!Array.isArray(value)) return [];
  const rows: {
    streamId: number;
    name: string;
    inviteOnly?: boolean;
    canAddSubscribersGroup?: ZulipGroupSettingValue;
    canAdministerChannelGroup?: ZulipGroupSettingValue;
  }[] = [];
  for (const row of value) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const streamIdRaw = record.stream_id;
    const name = record.name;
    if (!isPositiveInteger(streamIdRaw) || typeof name !== "string") continue;
    const canAddSubscribersGroup = normalizeGroupSettingValue(record.can_add_subscribers_group);
    const canAdministerChannelGroup = normalizeGroupSettingValue(
      record.can_administer_channel_group,
    );
    rows.push({
      streamId: streamIdRaw,
      name: name.trim(),
      ...(typeof record.invite_only === "boolean" ? { inviteOnly: record.invite_only } : {}),
      ...(canAddSubscribersGroup != null ? { canAddSubscribersGroup } : {}),
      ...(canAdministerChannelGroup != null ? { canAdministerChannelGroup } : {}),
    });
  }
  return rows;
}

// Что делает: читает stream_ids из subscription/remove, где сервер иногда шлет только массив id.
function parseSubscriptionStreamIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const raw of value) {
    if (!isPositiveInteger(raw)) continue;
    ids.push(raw);
  }
  return ids;
}

export function dispatchZulipEvent(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  const { chatList, currentChat, users, typing, mute, activity, inbox, notifications, jitsiCall } =
    ctx;

  const instance = getCurrentInstance();
  if (instance?.id && isChatMessagesPersistToIndexedDbEnabled()) {
    void applyZulipEventToMessageIndexedDb({
      instanceId: instance.id,
      currentUserId: chatList.currentUserId,
      event,
    }).catch(() => {});
  }

  if (event.type === "message" && event.message) {
    const raw = event.message as unknown as ZulipRawMessage;
    // Зачем: даем внешнему обработчику обновить побочные индексы (например, локальный DM-индекс).
    ctx.onMessage?.(raw);
    users.mergeFromMessage(raw);
    chatList.addMessage(raw);
    ctx.updateLatestMessageId(raw.id);
    activity.markStale();

    const currentUserId = chatList.currentUserId;
    const isForCurrentChat = currentChat.context
      ? isMessageForContext(raw, currentChat.context, currentUserId)
      : false;
    if (isForCurrentChat) {
      currentChat.appendMessage(rawMessageToMockMessage(raw));
    }

    inbox.markStale();

    const isFromSelf = raw.sender_id === currentUserId;
    if (!isFromSelf && !isForCurrentChat) {
      let isMuted = false;
      if (raw.type === "stream" && raw.stream_id != null) {
        const topic = (raw.subject ?? "").trim() || "general";
        isMuted = mute.isEffectivelyMuted(raw.stream_id, topic);
      }

      if (shouldNotify({ isFromSelf, isForCurrentChat, isMuted })) {
        const senderName = raw.sender_full_name ?? "New message";
        const contentPreview = plainTextPreviewFromMessageBody(raw.content ?? "").slice(0, 100);
        notifications
          .show({
            title: senderName,
            body: contentPreview,
            tag: `msg-${raw.id}`,
          })
          .catch(() => {});

        const soundPreset = notifications.getSoundPreset();
        if (soundPreset !== "none") {
          notifications.playSound(soundPreset);
        }

        notifications.requestAttentionIfNotFocused();
      }
    }
    const incomingInvite = resolveIncomingDmCallInvite(raw, currentUserId);
    if (incomingInvite != null) {
      jitsiCall.ingestIncomingInvite(incomingInvite);
    }
    return;
  }

  if (event.type === "update_message_flags") {
    const op = event.op as LayoutMessageFlagOp;
    const flag = event.flag as string;
    const messageIds = (event.messages ?? []) as number[];
    if (messageIds.length === 0) return;
    activity.markStale();
    if (flag === "starred") {
      activity.markStarredSummaryStale();
    }
    if (flag === "read") {
      inbox.markStale();
      if (op === "add") {
        closeReadMessageNotifications(notifications.closeByTag, messageIds);
        chatList.decrementUnreadForMessages(messageIds);
        currentChat.updateMessageFlags(messageIds, "read", "add");
      } else {
        chatList.incrementUnreadForMessages(messageIds);
        currentChat.updateMessageFlags(messageIds, "read", "remove");
      }
    }
    return;
  }

  if (event.type === "reaction") {
    activity.markStale();
    const messageId = event.message_id as number;
    const reaction =
      event.emoji_name != null
        ? {
            emoji_name: event.emoji_name as string,
            emoji_code: (event.emoji_code as string) ?? "",
            reaction_type:
              (event.reaction_type as "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji") ??
              "unicode_emoji",
            user_id: event.user_id as number,
          }
        : null;
    if (reaction) {
      const op = (event.op as LayoutMessageFlagOp) ?? "add";
      currentChat.updateMessageReaction(messageId, reaction, op);
    }
    return;
  }

  if (event.type === "delete_message") {
    activity.markStale();
    activity.markStarredSummaryStale();
    const messageIds = event.message_ids
      ? (event.message_ids as number[])
      : event.message_id != null
        ? [event.message_id as number]
        : [];
    if (messageIds.length > 0) {
      chatList.handleDeleteMessages(messageIds);
      currentChat.removeMessages(messageIds);
    }
    return;
  }

  if (event.type === "typing") {
    const sender = event.sender as { user_id: number } | undefined;
    const recipients = event.recipients as { user_id: number }[] | undefined;
    const currentUserId = chatList.currentUserId;
    const route = resolveTypingEventRoute({
      op: event.op as string | undefined,
      messageType: event.message_type as string | undefined,
      senderUserId: sender?.user_id,
      recipients,
      streamId: event.stream_id as number | undefined,
      topic: event.topic as string | undefined,
      currentUserId,
    });
    if (route) {
      typing.setTyping(route.chatKey, route.userId, route.isTyping);
    }
    return;
  }

  if (event.type === "update_message") {
    activity.markStale();
    activity.markStarredSummaryStale();
    const messageId = event.message_id as number | undefined;
    const renderingOnly = event.rendering_only === true;
    const newMarkdown =
      !renderingOnly && typeof event.content === "string" ? event.content : undefined;
    const newHtml = event.rendered_content as string | undefined;
    if (messageId == null) return;
    if (renderingOnly) {
      return;
    }
    if (newMarkdown != null) {
      const trimmed = newMarkdown.trim();
      currentChat.updateMessageContent(
        messageId,
        newMarkdown,
        trimmed.length > 0 ? newMarkdown : undefined,
      );
      return;
    }
    if (newHtml != null) {
      currentChat.updateMessageContent(messageId, newHtml);
    }
    return;
  }

  if (event.type === "presence") {
    const email = event.email as string | undefined;
    const presenceData = event.presence as
      | Record<string, { status?: string; timestamp?: number }>
      | undefined;
    if (email && presenceData) {
      const agg = presenceData.aggregated ?? presenceData.website;
      if (agg?.status != null && agg?.timestamp != null) {
        users.setPresenceByEmail(email, {
          status: agg.status === "idle" ? "idle" : "active",
          timestamp: agg.timestamp,
        });
      }
    }
    return;
  }

  if (event.type === "user_status") {
    const userId = event.user_id as number | undefined;
    if (userId != null) {
      const statusText = typeof event.status_text === "string" ? event.status_text.trim() : "";
      const emojiName = typeof event.emoji_name === "string" ? event.emoji_name.trim() : "";
      const emojiCode = typeof event.emoji_code === "string" ? event.emoji_code.trim() : "";
      const reactionTypeRaw =
        typeof event.reaction_type === "string" ? event.reaction_type : undefined;
      const reactionType =
        reactionTypeRaw === "unicode_emoji" ||
        reactionTypeRaw === "realm_emoji" ||
        reactionTypeRaw === "zulip_extra_emoji"
          ? reactionTypeRaw
          : undefined;
      const away = event.away === true;
      const hasStatus = statusText.length > 0 || emojiName.length > 0 || away;
      users.setStatus(
        userId,
        hasStatus
          ? {
              text: statusText,
              emojiName: emojiName || undefined,
              emojiCode: emojiCode || undefined,
              reactionType,
              away,
            }
          : null,
        Date.now(),
      );
    }
    return;
  }

  if (event.type === "subscription") {
    const op = event.op as "update" | "add" | "remove" | "peer_add" | "peer_remove" | undefined;
    if (op === "add") {
      // Что делает: добавляет новый канал в sidebar даже если сообщений по нему еще не пришло.
      const rows = parseSubscriptionRows(event.subscriptions);
      if (rows.length > 0) {
        chatList.upsertStreamMetadataRows(rows);
      }
      return;
    }
    if (op === "remove") {
      // Что делает: удаляет канал из списка, поддерживая оба формата события от Zulip.
      const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamId);
      const fromIds = parseSubscriptionStreamIds(event.stream_ids);
      const ids = Array.from(new Set([...fromArray, ...fromIds]));
      for (const streamId of ids) {
        chatList.removeStream(streamId);
      }
      return;
    }
    if (op === "peer_add" || op === "peer_remove") {
      const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamId);
      const fromIds = parseSubscriptionStreamIds(event.stream_ids);
      const streamIds = Array.from(new Set([...fromArray, ...fromIds]));
      if (streamIds.length > 0) {
        ctx.onStreamPeerMembersChanged?.(streamIds);
      }
      return;
    }
    if (op === "update") {
      const streamId = event.stream_id as number | undefined;
      const property = event.property as string | undefined;
      if (!Number.isInteger(streamId) || streamId == null || streamId <= 0) {
        return;
      }
      if (property === "is_muted") {
        const value = event.value as boolean | undefined;
        if (value == null) return;
        if (value) {
          mute.muteStream(streamId);
        } else {
          mute.unmuteStream(streamId);
        }
        return;
      }
      if (property === "name") {
        // Что делает: обновляет название канала без пересборки всего списка.
        const value = event.value as string | undefined;
        if (typeof value === "string" && value.trim().length > 0) {
          chatList.renameStream(streamId, value);
        }
        return;
      }
      if (
        property === "can_add_subscribers_group" ||
        property === "can_administer_channel_group" ||
        property === "invite_only"
      ) {
        // Что делает: собирает partial metadata update для конкретного канала.
        // Берем текущее состояние из streamsMap и обновляем только изменившееся поле.
        const existing = chatList.streamsMap.get(streamId);
        const streamName = existing?.name?.trim() ?? "";
        if (streamName.length === 0) return;
        const row: {
          streamId: number;
          name: string;
          inviteOnly?: boolean;
          canAddSubscribersGroup?: ZulipGroupSettingValue;
          canAdministerChannelGroup?: ZulipGroupSettingValue;
        } = {
          streamId,
          name: streamName,
          ...(existing?.inviteOnly != null ? { inviteOnly: existing.inviteOnly } : {}),
          ...(existing?.canAddSubscribersGroup != null
            ? { canAddSubscribersGroup: existing.canAddSubscribersGroup }
            : {}),
          ...(existing?.canAdministerChannelGroup != null
            ? { canAdministerChannelGroup: existing.canAdministerChannelGroup }
            : {}),
        };
        if (property === "invite_only") {
          if (typeof event.value === "boolean") {
            row.inviteOnly = event.value;
          }
        } else if (property === "can_add_subscribers_group") {
          // Что делает: нормализует group-setting в единый формат перед записью в store.
          const parsed = normalizeGroupSettingValue(event.value);
          if (parsed != null) {
            row.canAddSubscribersGroup = parsed;
          }
        } else {
          // Что делает: нормализует channel-admin group-setting и синхронизирует metadata.
          const parsed = normalizeGroupSettingValue(event.value);
          if (parsed != null) {
            row.canAdministerChannelGroup = parsed;
          }
        }
        chatList.upsertStreamMetadataRows([row]);
      }
    }
    return;
  }

  if (event.type === "user_topic") {
    const streamId = event.stream_id as number | undefined;
    const topicName = event.topic_name as string | undefined;
    const visibilityPolicy = event.visibility_policy as number | undefined;
    if (streamId != null && topicName != null && visibilityPolicy != null) {
      if (visibilityPolicy === 1) {
        mute.muteTopic(streamId, topicName);
      } else if (visibilityPolicy === 2 || visibilityPolicy === 3) {
        mute.unmuteTopic(streamId, topicName);
      } else {
        mute.clearTopicVisibilityOverride(streamId, topicName);
      }
    }
  }
}

export function buildLayoutNotificationsActions(options: {
  show: LayoutNotificationsActions["show"];
  closeByTag: LayoutNotificationsActions["closeByTag"];
  playSound: (preset?: string) => void;
  getSoundPreset: () => string;
}): LayoutNotificationsActions {
  return {
    show: options.show,
    closeByTag: options.closeByTag,
    playSound: options.playSound,
    getSoundPreset: options.getSoundPreset,
    requestAttentionIfNotFocused: () => {
      if (typeof document !== "undefined" && !document.hasFocus()) {
        // In web runtime, this is a no-op (no Electron API).
        getElectronAPI()?.os?.requestAttention?.();
      }
    },
  };
}
