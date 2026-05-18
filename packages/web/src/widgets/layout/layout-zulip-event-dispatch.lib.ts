import { useInstancesStore } from "~/entities/instance/instance.model";
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
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { extractTopicMoveFromUpdateEvent } from "~/shared/lib/update-message-topic-move.lib";
import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import type {
  LayoutMessageFlagOp,
  LayoutNotificationsActions,
  LayoutZulipEventDispatchContext,
} from "./layout-zulip-event-dispatch.types";

// ---
// Разбор payload подписок
// ---

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parsePositiveInteger(value: unknown): number | null {
  return isPositiveInteger(value) ? value : null;
}

function parseSubscriptionRows(value: unknown): {
  streamId: number;
  name: string;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
}[] {
  if (!Array.isArray(value)) return [];
  const rows: {
    streamId: number;
    name: string;
    isArchived?: boolean;
    creatorId?: number;
    inviteOnly?: boolean;
    canAddSubscribersGroup?: ZulipGroupSettingValue;
    canRemoveSubscribersGroup?: ZulipGroupSettingValue;
    canAdministerChannelGroup?: ZulipGroupSettingValue;
  }[] = [];
  for (const row of value) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) continue;
    const parsed = parseOneSubscriptionRow(row as Record<string, unknown>);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

function parseOneSubscriptionRow(record: Record<string, unknown>): {
  streamId: number;
  name: string;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
} | null {
  const streamIdRaw = record.stream_id;
  const name = record.name;
  if (!isPositiveInteger(streamIdRaw) || typeof name !== "string") return null;
  const creatorId = isPositiveInteger(record.creator_id) ? record.creator_id : undefined;
  const canAddSubscribersGroup = normalizeGroupSettingValue(record.can_add_subscribers_group);
  const canRemoveSubscribersGroup = normalizeGroupSettingValue(record.can_remove_subscribers_group);
  const canAdministerChannelGroup = normalizeGroupSettingValue(record.can_administer_channel_group);
  return {
    streamId: streamIdRaw,
    name: name.trim(),
    ...(typeof record.is_archived === "boolean" ? { isArchived: record.is_archived } : {}),
    ...(creatorId != null ? { creatorId } : {}),
    ...(typeof record.invite_only === "boolean" ? { inviteOnly: record.invite_only } : {}),
    ...(canAddSubscribersGroup != null ? { canAddSubscribersGroup } : {}),
    ...(canRemoveSubscribersGroup != null ? { canRemoveSubscribersGroup } : {}),
    ...(canAdministerChannelGroup != null ? { canAdministerChannelGroup } : {}),
  };
}

function parseSubscriptionStreamIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const raw of value) {
    if (!isPositiveInteger(raw)) continue;
    ids.push(raw);
  }
  return ids;
}

// ---
// Побочный эффект в IndexedDB
// ---

function applyMessageCacheIndexedDb(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  const instance = getCurrentInstance();
  if (!instance?.id || !isChatMessagesPersistToIndexedDbEnabled()) return;
  void applyZulipEventToMessageIndexedDb({
    instanceId: instance.id,
    currentUserId: ctx.chatList.currentUserId,
    event,
  }).catch(() => {});
}

// ---
// Обработчики по типам событий.
// Это держит cognitive complexity у `dispatchZulipEvent` на низком уровне.
// ---

function handleIncomingMessage(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "message" || !event.message) return;
  const { chatList, currentChat, users, activity, inbox, jitsiCall } = ctx;
  const raw = event.message as unknown as ZulipRawMessage;
  ctx.onMessage?.(raw);
  users.mergeFromMessage(raw);
  chatList.addMessage(raw);
  // Что делает: fallback для серверов/сценариев, где rename канала приходит не отдельным stream-event,
  // а заметен только через новое display_recipient в message-событии.
  if (
    raw.type === "stream" &&
    Number.isInteger(raw.stream_id) &&
    raw.stream_id != null &&
    typeof raw.display_recipient === "string" &&
    raw.display_recipient.trim().length > 0
  ) {
    chatList.renameStream(raw.stream_id, raw.display_recipient);
  }
  ctx.updateLatestMessageId(raw.id);
  activity.markStale();

  const currentUserId = chatList.currentUserId;
  const isForCurrentChat =
    currentChat.context != null &&
    !currentChat.hasNewerMessages &&
    isMessageForContext(raw, currentChat.context, currentUserId);
  if (isForCurrentChat) {
    currentChat.appendMessage(rawMessageToMockMessage(raw));
  }

  inbox.markStale();

  const isFromSelf = raw.sender_id === currentUserId;
  if (!isFromSelf && !isForCurrentChat) {
    maybeNotifyNewMessage(ctx, raw, currentUserId, isForCurrentChat, isFromSelf);
  }

  const jitsiMeetBaseUrl = useInstancesStore.getState().jitsiMeetBaseUrl;
  const incomingInvite = resolveIncomingDmCallInvite(raw, currentUserId, {
    serverBaseUrl: jitsiMeetBaseUrl,
  });
  if (incomingInvite != null) {
    jitsiCall.ingestIncomingInvite(incomingInvite);
  }
}

function maybeNotifyNewMessage(
  ctx: LayoutZulipEventDispatchContext,
  raw: ZulipRawMessage,
  currentUserId: number | null,
  isForCurrentChat: boolean,
  isFromSelf: boolean,
): void {
  const { mute, notifications } = ctx;
  let isMuted = false;
  if (raw.type === "stream" && raw.stream_id != null) {
    const topic = normalizeTopicForIdentity(raw.subject ?? "");
    isMuted = mute.isEffectivelyMuted(raw.stream_id, topic);
  }

  if (!shouldNotify({ isFromSelf, isForCurrentChat, isMuted })) return;

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

function handleUpdateMessageFlags(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "update_message_flags") return;
  const { chatList, currentChat, activity, inbox, notifications } = ctx;
  const op = event.op as LayoutMessageFlagOp;
  const flag = event.flag as string;
  const messageIds = (event.messages ?? []) as number[];
  if (messageIds.length === 0) return;
  activity.markStale();
  if (flag === "starred") {
    activity.markStarredSummaryStale();
  }
  if (flag !== "read") return;
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

function handleReaction(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "reaction") return;
  const { currentChat, activity } = ctx;
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
  if (!reaction) return;
  const op = (event.op as LayoutMessageFlagOp) ?? "add";
  currentChat.updateMessageReaction(messageId, reaction, op);
}

function deleteMessageIdsFromEvent(event: ZulipEvent): number[] {
  if (event.type !== "delete_message") return [];
  if (event.message_ids) return event.message_ids as number[];
  if (event.message_id != null) return [event.message_id as number];
  return [];
}

function handleDeleteMessage(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "delete_message") return;
  const { chatList, currentChat, activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  const messageIds = deleteMessageIdsFromEvent(event);
  if (messageIds.length === 0) return;
  chatList.handleDeleteMessages(messageIds);
  currentChat.removeMessages(messageIds);
}

function handleTyping(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "typing") return;
  const { typing, chatList } = ctx;
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
}

function handleUpdateMessage(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "update_message") return;
  const { currentChat, chatList, activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  const messageId = event.message_id as number | undefined;
  const renderingOnly = event.rendering_only === true;
  const newMarkdown =
    !renderingOnly && typeof event.content === "string" ? event.content : undefined;
  if (messageId == null) return;
  if (newMarkdown != null) {
    const trimmed = newMarkdown.trim();
    currentChat.updateMessageContent(
      messageId,
      newMarkdown,
      trimmed.length > 0 ? newMarkdown : undefined,
    );
  }

  const topicMovePayload = extractTopicMoveFromUpdateEvent(event);
  if (topicMovePayload == null) return;
  chatList.moveStreamTopic(topicMovePayload);
  currentChat.moveStreamTopicMessages(topicMovePayload);
}

function handlePresence(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "presence") return;
  const { users } = ctx;
  const email = event.email as string | undefined;
  const presenceData = event.presence as
    | Record<string, { status?: string; timestamp?: number }>
    | undefined;
  if (!email || !presenceData) return;
  const agg = presenceData.aggregated ?? presenceData.website;
  if (agg?.status == null || agg?.timestamp == null) return;
  users.setPresenceByEmail(email, {
    status: agg.status === "idle" ? "idle" : "active",
    timestamp: agg.timestamp,
  });
}

function handleUserStatus(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "user_status") return;
  const { users } = ctx;
  const userId = event.user_id as number | undefined;
  if (userId == null) return;
  const statusText = typeof event.status_text === "string" ? event.status_text.trim() : "";
  const emojiName = typeof event.emoji_name === "string" ? event.emoji_name.trim() : "";
  const emojiCode = typeof event.emoji_code === "string" ? event.emoji_code.trim() : "";
  const reactionTypeRaw = typeof event.reaction_type === "string" ? event.reaction_type : undefined;
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

function handleSubscriptionAdd(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  const rows = parseSubscriptionRows(event.subscriptions);
  if (rows.length > 0) {
    ctx.chatList.upsertStreamMetadataRows(rows);
  }
}

function handleSubscriptionRemove(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  const { chatList } = ctx;
  const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamId);
  const fromIds = parseSubscriptionStreamIds(event.stream_ids);
  const ids = Array.from(new Set([...fromArray, ...fromIds]));
  for (const streamId of ids) {
    chatList.removeStream(streamId);
  }
}

function handleSubscriptionPeer(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamId);
  const fromIds = parseSubscriptionStreamIds(event.stream_ids);
  const streamIds = Array.from(new Set([...fromArray, ...fromIds]));
  if (streamIds.length > 0) {
    ctx.onStreamPeerMembersChanged?.(streamIds);
  }
}

function buildStreamMetadataRowFromExisting(
  streamId: number,
  existing: ReturnType<LayoutZulipEventDispatchContext["chatList"]["streamsMap"]["get"]>,
): {
  streamId: number;
  name: string;
  isArchived?: boolean;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
} | null {
  const streamName = existing?.name?.trim() ?? "";
  if (streamName.length === 0) return null;
  return {
    streamId,
    name: streamName,
    ...(existing?.isArchived != null ? { isArchived: existing.isArchived } : {}),
    ...(existing?.inviteOnly != null ? { inviteOnly: existing.inviteOnly } : {}),
    ...(existing?.canAddSubscribersGroup != null
      ? { canAddSubscribersGroup: existing.canAddSubscribersGroup }
      : {}),
    ...(existing?.canRemoveSubscribersGroup != null
      ? { canRemoveSubscribersGroup: existing.canRemoveSubscribersGroup }
      : {}),
    ...(existing?.canAdministerChannelGroup != null
      ? { canAdministerChannelGroup: existing.canAdministerChannelGroup }
      : {}),
  };
}

function applySubscriptionMetadataField(
  row: {
    streamId: number;
    name: string;
    isArchived?: boolean;
    inviteOnly?: boolean;
    canAddSubscribersGroup?: ZulipGroupSettingValue;
    canRemoveSubscribersGroup?: ZulipGroupSettingValue;
    canAdministerChannelGroup?: ZulipGroupSettingValue;
  },
  property: string,
  event: ZulipEvent,
): void {
  if (property === "is_archived") {
    if (typeof event.value === "boolean") {
      row.isArchived = event.value;
    }
    return;
  }
  if (property === "invite_only") {
    if (typeof event.value === "boolean") {
      row.inviteOnly = event.value;
    }
    return;
  }
  if (property === "can_add_subscribers_group") {
    const parsed = normalizeGroupSettingValue(event.value);
    if (parsed != null) {
      row.canAddSubscribersGroup = parsed;
    }
    return;
  }
  if (property === "can_remove_subscribers_group") {
    const parsed = normalizeGroupSettingValue(event.value);
    if (parsed != null) {
      row.canRemoveSubscribersGroup = parsed;
    }
    return;
  }
  const parsed = normalizeGroupSettingValue(event.value);
  if (parsed != null) {
    row.canAdministerChannelGroup = parsed;
  }
}

function handleSubscriptionPropertyUpdate(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
  streamId: number,
  property: string,
): void {
  const { chatList, mute } = ctx;
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
    const value = event.value as string | undefined;
    if (typeof value === "string" && value.trim().length > 0) {
      chatList.renameStream(streamId, value);
    }
    return;
  }
  if (
    property !== "is_archived" &&
    property !== "can_add_subscribers_group" &&
    property !== "can_remove_subscribers_group" &&
    property !== "can_administer_channel_group" &&
    property !== "invite_only"
  ) {
    return;
  }

  const existing = chatList.streamsMap.get(streamId);
  const row = buildStreamMetadataRowFromExisting(streamId, existing);
  if (row == null) return;
  applySubscriptionMetadataField(row, property, event);
  chatList.upsertStreamMetadataRows([row]);
}

function handleSubscription(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "subscription") return;
  const op = event.op as "update" | "add" | "remove" | "peer_add" | "peer_remove" | undefined;
  if (op === "add") {
    handleSubscriptionAdd(event, ctx);
    return;
  }
  if (op === "remove") {
    handleSubscriptionRemove(event, ctx);
    return;
  }
  if (op === "peer_add" || op === "peer_remove") {
    handleSubscriptionPeer(event, ctx);
    return;
  }
  if (op !== "update") return;

  const streamId = event.stream_id as number | undefined;
  const property = event.property as string | undefined;
  if (!Number.isInteger(streamId) || streamId == null || streamId <= 0 || property == null) {
    return;
  }
  handleSubscriptionPropertyUpdate(event, ctx, streamId, property);
}

function handleStreamPropertyUpdate(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
  streamId: number,
  property: string,
): void {
  // Что делает: применяет точечный update полей канала из stream:update.
  // Зачем: часть серверов шлет rename/ACL изменения именно stream-событием, не subscription.
  const { chatList } = ctx;
  if (property === "name") {
    // Что делает: поддерживает оба формата payload (name может прийти в value или в name).
    // Зачем: разные версии/инсталляции Zulip могут отличаться по форме update payload.
    const nameFromValue = typeof event.value === "string" ? event.value : null;
    const nameFromField = typeof event.name === "string" ? event.name : null;
    const nextName = nameFromValue ?? nameFromField;
    if (nextName != null && nextName.trim().length > 0) {
      chatList.renameStream(streamId, nextName);
    }
    return;
  }
  if (
    property !== "is_archived" &&
    property !== "can_add_subscribers_group" &&
    property !== "can_remove_subscribers_group" &&
    property !== "can_administer_channel_group" &&
    property !== "invite_only"
  ) {
    return;
  }

  // Переиспользуем общий metadata-applier, чтобы не дублировать update-логику.
  const existing = chatList.streamsMap.get(streamId);
  const row = buildStreamMetadataRowFromExisting(streamId, existing);
  if (row == null) return;
  applySubscriptionMetadataField(row, property, event);
  chatList.upsertStreamMetadataRows([row]);
}

function handleStream(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "stream") return;
  // Что делает: централизованно обрабатывает stream create/update/delete.
  // Зачем: без этого rename/create/delete канала может дойти до сети, но не попасть в sidebar state.
  const op = event.op as "create" | "delete" | "update" | undefined;
  if (op === "create") {
    // Что делает: добавляет каналы из stream:create payload.
    // Зачем: канал должен появиться в sidebar даже без новых сообщений в message-window.
    const rows = parseSubscriptionRows(event.streams);
    if (rows.length > 0) {
      ctx.chatList.upsertStreamMetadataRows(rows);
    }
    return;
  }
  if (op === "delete") {
    // Что делает: удаляет канал по всем возможным полям (streams, stream_ids, stream_id).
    // Зачем: payload удаления канала может приходить в разных форматах, нужно покрыть все.
    const fromRows = parseSubscriptionRows(event.streams).map((row) => row.streamId);
    const fromIds = parseSubscriptionStreamIds(event.stream_ids);
    const fromSingle = parsePositiveInteger(event.stream_id);
    const ids = Array.from(
      new Set([...fromRows, ...fromIds, ...(fromSingle != null ? [fromSingle] : [])]),
    );
    for (const streamId of ids) {
      ctx.chatList.removeStream(streamId);
    }
    return;
  }
  if (op !== "update") return;
  const streamId = parsePositiveInteger(event.stream_id);
  if (streamId == null) return;
  const property = typeof event.property === "string" ? event.property : null;
  if (property != null) {
    // Что делает: route для property-based update (name, invite_only, can_*_group).
    // Зачем: держим ветвление в одном месте и упрощаем поддержку форматов событий.
    handleStreamPropertyUpdate(event, ctx, streamId, property);
    return;
  }
  // Что делает: fallback для update без property, но с новым name.
  // Зачем: часть серверов присылает rename в "плоском" формате.
  const nextName = typeof event.name === "string" ? event.name : null;
  if (nextName != null && nextName.trim().length > 0) {
    ctx.chatList.renameStream(streamId, nextName);
  }
}

function handleUserTopic(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "user_topic") return;
  const { mute } = ctx;
  const streamId = event.stream_id as number | undefined;
  const topicName = event.topic_name as string | undefined;
  const visibilityPolicy = event.visibility_policy as number | undefined;
  if (streamId == null || topicName == null || visibilityPolicy == null) return;
  const normalizedTopic = normalizeTopicForIdentity(topicName);
  if (visibilityPolicy === 1) {
    mute.muteTopic(streamId, normalizedTopic);
  } else if (visibilityPolicy === 2) {
    mute.unmuteTopic(streamId, normalizedTopic);
  } else if (visibilityPolicy === 3) {
    mute.followTopic(streamId, normalizedTopic);
  } else {
    mute.clearTopicVisibilityOverride(streamId, normalizedTopic);
  }
}

export function dispatchZulipEvent(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  applyMessageCacheIndexedDb(event, ctx);

  if (event.type === "message" && event.message) {
    handleIncomingMessage(event, ctx);
    return;
  }

  if (event.type === "update_message_flags") {
    handleUpdateMessageFlags(event, ctx);
    return;
  }

  if (event.type === "reaction") {
    handleReaction(event, ctx);
    return;
  }

  if (event.type === "delete_message") {
    handleDeleteMessage(event, ctx);
    return;
  }

  if (event.type === "typing") {
    handleTyping(event, ctx);
    return;
  }

  if (event.type === "update_message") {
    handleUpdateMessage(event, ctx);
    return;
  }

  if (event.type === "presence") {
    handlePresence(event, ctx);
    return;
  }

  if (event.type === "user_status") {
    handleUserStatus(event, ctx);
    return;
  }

  if (event.type === "subscription") {
    handleSubscription(event, ctx);
    return;
  }

  if (event.type === "stream") {
    // Что делает: применяет lifecycle-события канала (create/update/delete) в chat-list.
    // Зачем: без этой ветки UI не отражает rename/create/delete канала в реальном времени.
    handleStream(event, ctx);
    return;
  }

  if (event.type === "user_topic") {
    handleUserTopic(event, ctx);
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
        getElectronAPI()?.os?.requestAttention?.();
      }
    },
  };
}
