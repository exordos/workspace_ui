/**
 * Workspace realtime handlers: subscriptions, streams, user_topic.
 */
import type { MessengerEvent } from "~/shared/api/messenger.types";
import type { MessengerGroupSettingValue } from "~/shared/api/messenger.types";
import { normalizeGroupSettingValue } from "~/shared/lib/messenger-group-setting.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function parseStreamUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const streamUuid = value.trim().toLowerCase();
  return streamUuid.length > 0 ? streamUuid : null;
}

export function parseSubscriptionRows(value: unknown): {
  streamUuid: string;
  name: string;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
}[] {
  if (!Array.isArray(value)) return [];
  const rows: {
    streamUuid: string;
    name: string;
    isArchived?: boolean;
    creatorId?: number;
    inviteOnly?: boolean;
    canAddSubscribersGroup?: MessengerGroupSettingValue;
    canRemoveSubscribersGroup?: MessengerGroupSettingValue;
    canAdministerChannelGroup?: MessengerGroupSettingValue;
    canResolveTopicsGroup?: MessengerGroupSettingValue;
    canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
  }[] = [];
  for (const row of value) {
    if (row == null || typeof row !== "object" || Array.isArray(row)) continue;
    const parsed = parseOneSubscriptionRow(row as Record<string, unknown>);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

export function parseOneSubscriptionRow(record: Record<string, unknown>): {
  streamUuid: string;
  name: string;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  canResolveTopicsGroup?: MessengerGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
} | null {
  const streamUuidRaw = parseStreamUuid(record.stream_uuid);
  const name = record.name;
  if (streamUuidRaw == null || typeof name !== "string") return null;
  const creatorId = isPositiveInteger(record.creator_id) ? record.creator_id : undefined;
  const canAddSubscribersGroup = normalizeGroupSettingValue(record.can_add_subscribers_group);
  const canRemoveSubscribersGroup = normalizeGroupSettingValue(record.can_remove_subscribers_group);
  const canAdministerChannelGroup = normalizeGroupSettingValue(record.can_administer_channel_group);
  const canResolveTopicsGroup = normalizeGroupSettingValue(record.can_resolve_topics_group);
  const canMoveMessagesOutOfChannelGroup = normalizeGroupSettingValue(
    record.can_move_messages_out_of_channel_group,
  );
  return {
    streamUuid: streamUuidRaw,
    name: name.trim(),
    ...(typeof record.is_archived === "boolean" ? { isArchived: record.is_archived } : {}),
    ...(creatorId != null ? { creatorId } : {}),
    ...(typeof record.invite_only === "boolean" ? { inviteOnly: record.invite_only } : {}),
    ...(canAddSubscribersGroup != null ? { canAddSubscribersGroup } : {}),
    ...(canRemoveSubscribersGroup != null ? { canRemoveSubscribersGroup } : {}),
    ...(canAdministerChannelGroup != null ? { canAdministerChannelGroup } : {}),
    ...(canResolveTopicsGroup != null ? { canResolveTopicsGroup } : {}),
    ...(canMoveMessagesOutOfChannelGroup != null ? { canMoveMessagesOutOfChannelGroup } : {}),
  };
}

export function parseSubscriptionStreamUuids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const raw of value) {
    const streamUuid = parseStreamUuid(raw);
    if (streamUuid == null) continue;
    ids.push(streamUuid);
  }
  return ids;
}
export function handleSubscriptionAdd(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  const rows = parseSubscriptionRows(event.subscriptions);
  if (rows.length > 0) {
    ctx.chatList.upsertStreamMetadataRows(rows);
  }
}

export function handleSubscriptionRemove(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  const { chatList } = ctx;
  const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamUuid);
  const fromIds = parseSubscriptionStreamUuids(event.stream_uuids);
  const ids = Array.from(new Set([...fromArray, ...fromIds]));
  for (const streamUuid of ids) {
    chatList.removeStream(streamUuid);
  }
}

export function handleSubscriptionPeer(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  const fromArray = parseSubscriptionRows(event.subscriptions).map((row) => row.streamUuid);
  const fromIds = parseSubscriptionStreamUuids(event.stream_uuids);
  const streamUuids = Array.from(new Set([...fromArray, ...fromIds]));
  if (streamUuids.length > 0) {
    ctx.onStreamPeerMembersChanged?.(streamUuids);
  }
}

export function buildStreamMetadataRowFromExisting(
  streamUuid: string,
  existing: ReturnType<LayoutMessengerEventDispatchContext["chatList"]["streamsMap"]["get"]>,
): {
  streamUuid: string;
  name: string;
  isArchived?: boolean;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
} | null {
  const streamName = existing?.name?.trim() ?? "";
  if (streamName.length === 0) return null;
  return {
    streamUuid,
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
    ...(existing?.canMoveMessagesOutOfChannelGroup != null
      ? { canMoveMessagesOutOfChannelGroup: existing.canMoveMessagesOutOfChannelGroup }
      : {}),
  };
}

interface SubscriptionMetadataRow {
  streamUuid: string;
  name: string;
  isArchived?: boolean;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  canResolveTopicsGroup?: MessengerGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
}

function applyBooleanSubscriptionMetadataField(
  row: SubscriptionMetadataRow,
  event: MessengerEvent,
  field: "isArchived" | "inviteOnly",
): void {
  if (typeof event.value === "boolean") {
    row[field] = event.value;
  }
}

function applyGroupSubscriptionMetadataField(
  row: SubscriptionMetadataRow,
  event: MessengerEvent,
  field:
    | "canAddSubscribersGroup"
    | "canRemoveSubscribersGroup"
    | "canAdministerChannelGroup"
    | "canResolveTopicsGroup"
    | "canMoveMessagesOutOfChannelGroup",
): void {
  const parsed = normalizeGroupSettingValue(event.value);
  if (parsed != null) {
    row[field] = parsed;
  }
}

const SUBSCRIPTION_METADATA_FIELD_HANDLERS: Record<
  string,
  (row: SubscriptionMetadataRow, event: MessengerEvent) => void
> = {
  is_archived: (row, event) => applyBooleanSubscriptionMetadataField(row, event, "isArchived"),
  invite_only: (row, event) => applyBooleanSubscriptionMetadataField(row, event, "inviteOnly"),
  can_add_subscribers_group: (row, event) =>
    applyGroupSubscriptionMetadataField(row, event, "canAddSubscribersGroup"),
  can_remove_subscribers_group: (row, event) =>
    applyGroupSubscriptionMetadataField(row, event, "canRemoveSubscribersGroup"),
  can_administer_channel_group: (row, event) =>
    applyGroupSubscriptionMetadataField(row, event, "canAdministerChannelGroup"),
  can_resolve_topics_group: (row, event) =>
    applyGroupSubscriptionMetadataField(row, event, "canResolveTopicsGroup"),
  can_move_messages_out_of_channel_group: (row, event) =>
    applyGroupSubscriptionMetadataField(row, event, "canMoveMessagesOutOfChannelGroup"),
};

export function applySubscriptionMetadataField(
  row: SubscriptionMetadataRow,
  property: string,
  event: MessengerEvent,
): void {
  SUBSCRIPTION_METADATA_FIELD_HANDLERS[property]?.(row, event);
}

export function handleSubscriptionPropertyUpdate(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
  streamUuid: string,
  property: string,
): void {
  const { chatList, mute } = ctx;
  if (property === "is_muted") {
    const value = event.value as boolean | undefined;
    if (value == null) return;
    if (value) {
      mute.muteStream(streamUuid);
    } else {
      mute.unmuteStream(streamUuid);
    }
    return;
  }
  if (property === "desktop_notifications") {
    const value = event.value as boolean | undefined;
    if (typeof value !== "boolean") return;
    mute.setStreamDesktopNotifications(streamUuid, value);
    return;
  }
  if (property === "audible_notifications") {
    const value = event.value as boolean | undefined;
    if (typeof value !== "boolean") return;
    mute.setStreamAudibleNotifications(streamUuid, value);
    return;
  }
  if (property === "name") {
    const value = event.value as string | undefined;
    if (typeof value === "string" && value.trim().length > 0) {
      chatList.renameStream(streamUuid, value);
    }
    return;
  }
  if (
    property !== "is_archived" &&
    property !== "can_add_subscribers_group" &&
    property !== "can_remove_subscribers_group" &&
    property !== "can_administer_channel_group" &&
    property !== "can_resolve_topics_group" &&
    property !== "can_move_messages_out_of_channel_group" &&
    property !== "invite_only"
  ) {
    return;
  }

  const existing = chatList.streamsMap.get(streamUuid);
  const row = buildStreamMetadataRowFromExisting(streamUuid, existing);
  if (row == null) return;
  applySubscriptionMetadataField(row, property, event);
  chatList.upsertStreamMetadataRows([row]);
}

export function handleSubscription(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
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

  const streamUuid = parseStreamUuid(event.stream_uuid);
  const property = event.property as string | undefined;
  if (streamUuid == null || property == null) {
    return;
  }
  handleSubscriptionPropertyUpdate(event, ctx, streamUuid, property);
}

export function handleStreamPropertyUpdate(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
  streamUuid: string,
  property: string,
): void {
  // Apply targeted stream field updates from stream:update — some servers send rename/ACL via stream event, not subscription.
  const { chatList } = ctx;
  if (property === "name") {
    // Support name in value or name field — Workspace payload shape varies by version.
    const nameFromValue = typeof event.value === "string" ? event.value : null;
    const nameFromField = typeof event.name === "string" ? event.name : null;
    const nextName = nameFromValue ?? nameFromField;
    if (nextName != null && nextName.trim().length > 0) {
      chatList.renameStream(streamUuid, nextName);
    }
    return;
  }
  if (
    property !== "is_archived" &&
    property !== "can_add_subscribers_group" &&
    property !== "can_remove_subscribers_group" &&
    property !== "can_administer_channel_group" &&
    property !== "can_resolve_topics_group" &&
    property !== "can_move_messages_out_of_channel_group" &&
    property !== "invite_only"
  ) {
    return;
  }

  // Reuse shared metadata applier to avoid duplicating update logic.
  const existing = chatList.streamsMap.get(streamUuid);
  const row = buildStreamMetadataRowFromExisting(streamUuid, existing);
  if (row == null) return;
  applySubscriptionMetadataField(row, property, event);
  chatList.upsertStreamMetadataRows([row]);
}

export function handleStream(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "stream") return;
  // Central stream create/update/delete — without this, sidebar state misses channel changes from the network.
  const op = event.op as "create" | "delete" | "update" | undefined;
  if (op === "create") {
    // stream:create — show channel in sidebar even when message-window has no messages yet.
    const rows = parseSubscriptionRows(event.streams);
    if (rows.length > 0) {
      ctx.chatList.upsertStreamMetadataRows(rows);
    }
    return;
  }
  if (op === "delete") {
    // stream:delete — cover streams, stream_uuids, and stream_uuid payload variants.
    const fromRows = parseSubscriptionRows(event.streams).map((row) => row.streamUuid);
    const fromIds = parseSubscriptionStreamUuids(event.stream_uuids);
    const fromSingle = parseStreamUuid(event.stream_uuid);
    const ids = Array.from(
      new Set([...fromRows, ...fromIds, ...(fromSingle != null ? [fromSingle] : [])]),
    );
    for (const streamUuid of ids) {
      ctx.chatList.removeStream(streamUuid);
    }
    return;
  }
  if (op !== "update") return;
  const streamUuid = parseStreamUuid(event.stream_uuid);
  if (streamUuid == null) return;
  const property = typeof event.property === "string" ? event.property : null;
  if (property != null) {
    // Property-based updates (name, invite_only, can_*_group) — keep format branching in one place.
    handleStreamPropertyUpdate(event, ctx, streamUuid, property);
    return;
  }
  // Fallback: flat rename payload without property field.
  const nextName = typeof event.name === "string" ? event.name : null;
  if (nextName != null && nextName.trim().length > 0) {
    ctx.chatList.renameStream(streamUuid, nextName);
  }
}

export function handleUserTopic(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "user_topic") return;
  const { mute } = ctx;
  const streamUuid = parseStreamUuid(event.stream_uuid);
  const topicName = event.topic_name as string | undefined;
  const visibilityPolicy = event.visibility_policy as number | undefined;
  if (streamUuid == null || topicName == null || visibilityPolicy == null) return;
  const normalizedTopic = normalizeTopicForIdentity(topicName);
  if (visibilityPolicy === 1) {
    mute.muteTopic(streamUuid, normalizedTopic);
  } else if (visibilityPolicy === 2) {
    mute.unmuteTopic(streamUuid, normalizedTopic);
  } else if (visibilityPolicy === 3) {
    mute.followTopic(streamUuid, normalizedTopic);
  } else {
    mute.clearTopicVisibilityOverride(streamUuid, normalizedTopic);
  }
}
