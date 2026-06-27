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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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

export function parseWorkspaceStreamCreatedRow(value: unknown): {
  streamUuid: string;
  name: string;
  unreadCount?: number;
  private?: boolean;
  inviteOnly?: boolean;
} | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const streamUuid = parseStreamUuid(record.uuid);
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (streamUuid == null || name.length === 0) return null;
  return {
    streamUuid,
    name,
    ...(isNonNegativeInteger(record.unread_count) ? { unreadCount: record.unread_count } : {}),
    ...(typeof record.private === "boolean" ? { private: record.private } : {}),
    ...(typeof record.invite_only === "boolean" ? { inviteOnly: record.invite_only } : {}),
  };
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

export function handleStream(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "stream" || event.kind !== "stream.created") return;
  const row = parseWorkspaceStreamCreatedRow(event.stream);
  if (row == null) return;
  ctx.chatList.upsertStreamMetadataRows([row]);
}

export function handleStreamBinding(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "stream_binding" || event.kind !== "stream_bindings.created") return;
  const streamUuids = new Set<string>();
  const eventStreamUuid = parseStreamUuid(event.stream_uuid);
  if (eventStreamUuid != null) {
    streamUuids.add(eventStreamUuid);
  }
  if (Array.isArray(event.stream_bindings)) {
    for (const binding of event.stream_bindings) {
      if (binding == null || typeof binding !== "object" || Array.isArray(binding)) {
        continue;
      }
      const bindingStreamUuid = parseStreamUuid((binding as Record<string, unknown>).stream_uuid);
      if (bindingStreamUuid != null) {
        streamUuids.add(bindingStreamUuid);
      }
    }
  }
  if (streamUuids.size > 0) {
    ctx.onStreamPeerMembersChanged?.(Array.from(streamUuids));
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
