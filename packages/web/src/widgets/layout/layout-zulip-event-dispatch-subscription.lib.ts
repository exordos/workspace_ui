/**
 * Zulip realtime handlers: subscriptions, streams, user_topic.
 */
import type { ZulipEvent } from "~/shared/api/zulip.types";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { normalizeGroupSettingValue } from "~/shared/lib/zulip-group-setting.lib";
import type { LayoutZulipEventDispatchContext } from "./layout-zulip-event-dispatch.types";

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function parsePositiveInteger(value: unknown): number | null {
  return isPositiveInteger(value) ? value : null;
}

export function parseSubscriptionRows(value: unknown): {
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
    canResolveTopicsGroup?: ZulipGroupSettingValue;
  }[] = [];
  for (const row of value) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) continue;
    const parsed = parseOneSubscriptionRow(row as Record<string, unknown>);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

export function parseOneSubscriptionRow(record: Record<string, unknown>): {
  streamId: number;
  name: string;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  canResolveTopicsGroup?: ZulipGroupSettingValue;
} | null {
  const streamIdRaw = record.stream_id;
  const name = record.name;
  if (!isPositiveInteger(streamIdRaw) || typeof name !== "string") return null;
  const creatorId = isPositiveInteger(record.creator_id) ? record.creator_id : undefined;
  const canAddSubscribersGroup = normalizeGroupSettingValue(record.can_add_subscribers_group);
  const canRemoveSubscribersGroup = normalizeGroupSettingValue(record.can_remove_subscribers_group);
  const canAdministerChannelGroup = normalizeGroupSettingValue(record.can_administer_channel_group);
  const canResolveTopicsGroup = normalizeGroupSettingValue(record.can_resolve_topics_group);
  return {
    streamId: streamIdRaw,
    name: name.trim(),
    ...(typeof record.is_archived === "boolean" ? { isArchived: record.is_archived } : {}),
    ...(creatorId != null ? { creatorId } : {}),
    ...(typeof record.invite_only === "boolean" ? { inviteOnly: record.invite_only } : {}),
    ...(canAddSubscribersGroup != null ? { canAddSubscribersGroup } : {}),
    ...(canRemoveSubscribersGroup != null ? { canRemoveSubscribersGroup } : {}),
    ...(canAdministerChannelGroup != null ? { canAdministerChannelGroup } : {}),
    ...(canResolveTopicsGroup != null ? { canResolveTopicsGroup } : {}),
  };
}

export function parseSubscriptionStreamIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const raw of value) {
    if (!isPositiveInteger(raw)) continue;
    ids.push(raw);
  }
  return ids;
}
export function handleSubscriptionAdd(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  const rows = parseSubscriptionRows(event.subscriptions);
  if (rows.length > 0) {
    ctx.chatList.upsertStreamMetadataRows(rows);
  }
}

export function handleSubscriptionRemove(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  const { chatList } = ctx;
  const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamId);
  const fromIds = parseSubscriptionStreamIds(event.stream_ids);
  const ids = Array.from(new Set([...fromArray, ...fromIds]));
  for (const streamId of ids) {
    chatList.removeStream(streamId);
  }
}

export function handleSubscriptionPeer(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamId);
  const fromIds = parseSubscriptionStreamIds(event.stream_ids);
  const streamIds = Array.from(new Set([...fromArray, ...fromIds]));
  if (streamIds.length > 0) {
    ctx.onStreamPeerMembersChanged?.(streamIds);
  }
}

export function buildStreamMetadataRowFromExisting(
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
    ...(existing?.canResolveTopicsGroup != null
      ? { canResolveTopicsGroup: existing.canResolveTopicsGroup }
      : {}),
  };
}

export function applySubscriptionMetadataField(
  row: {
    streamId: number;
    name: string;
    isArchived?: boolean;
    inviteOnly?: boolean;
    canAddSubscribersGroup?: ZulipGroupSettingValue;
    canRemoveSubscribersGroup?: ZulipGroupSettingValue;
    canAdministerChannelGroup?: ZulipGroupSettingValue;
    canResolveTopicsGroup?: ZulipGroupSettingValue;
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
  if (property === "can_administer_channel_group") {
    const parsed = normalizeGroupSettingValue(event.value);
    if (parsed != null) {
      row.canAdministerChannelGroup = parsed;
    }
    return;
  }
  if (property === "can_resolve_topics_group") {
    const parsed = normalizeGroupSettingValue(event.value);
    if (parsed != null) {
      row.canResolveTopicsGroup = parsed;
    }
  }
}

export function handleSubscriptionPropertyUpdate(
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
    property !== "can_resolve_topics_group" &&
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

export function handleSubscription(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
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

export function handleStreamPropertyUpdate(
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
    property !== "can_resolve_topics_group" &&
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

export function handleStream(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
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

export function handleUserTopic(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
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
