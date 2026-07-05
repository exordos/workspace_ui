/**
 * Workspace realtime handlers: subscriptions, streams, user_topic.
 */
import type { MessengerEvent, MessengerGroupSettingValue } from "~/shared/api/messenger.types";
import { normalizeGroupSettingValue } from "~/shared/lib/messenger-group-setting.lib";
import { parseWorkspaceStreamNotificationMode } from "~/shared/lib/stream-notification-resolve.lib";
import { parseWorkspaceTopicNotificationMode } from "~/shared/lib/topic-notification-resolve.lib";
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

const WORKSPACE_COLOR_MAX_VALUE = 0xffffff;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseWorkspaceColor(value: unknown): number | undefined {
  return isNonNegativeInteger(value) && value <= WORKSPACE_COLOR_MAX_VALUE ? value : undefined;
}

export function parseStreamUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const streamUuid = value.trim().toLowerCase();
  return streamUuid.length > 0 ? streamUuid : null;
}

function parseOwnerUuid(record: Record<string, unknown>): string | undefined {
  return parseStreamUuid(record.owner) ?? undefined;
}

export function parseSubscriptionRows(value: unknown): {
  streamUuid: string;
  name: string;
  isArchived?: boolean;
  creatorId?: string;
  inviteOnly?: boolean;
  color?: number;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  notificationMode?: ReturnType<typeof parseWorkspaceStreamNotificationMode>;
}[] {
  if (!Array.isArray(value)) return [];
  const rows: {
    streamUuid: string;
    name: string;
    isArchived?: boolean;
    creatorId?: string;
    inviteOnly?: boolean;
    canAddSubscribersGroup?: MessengerGroupSettingValue;
    canRemoveSubscribersGroup?: MessengerGroupSettingValue;
    canAdministerChannelGroup?: MessengerGroupSettingValue;
    canResolveTopicsGroup?: MessengerGroupSettingValue;
    canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
    notificationMode?: ReturnType<typeof parseWorkspaceStreamNotificationMode>;
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
  creatorId?: string;
  inviteOnly?: boolean;
  color?: number;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  canResolveTopicsGroup?: MessengerGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
  notificationMode?: ReturnType<typeof parseWorkspaceStreamNotificationMode>;
} | null {
  const streamUuidRaw = parseStreamUuid(record.stream_uuid);
  const name = record.name;
  if (streamUuidRaw == null || typeof name !== "string") return null;
  const creatorId = parseOwnerUuid(record);
  const canAddSubscribersGroup = normalizeGroupSettingValue(record.can_add_subscribers_group);
  const canRemoveSubscribersGroup = normalizeGroupSettingValue(record.can_remove_subscribers_group);
  const canAdministerChannelGroup = normalizeGroupSettingValue(record.can_administer_channel_group);
  const canResolveTopicsGroup = normalizeGroupSettingValue(record.can_resolve_topics_group);
  const canMoveMessagesOutOfChannelGroup = normalizeGroupSettingValue(
    record.can_move_messages_out_of_channel_group,
  );
  const notificationMode = parseWorkspaceStreamNotificationMode(record.notification_mode);
  const color = parseWorkspaceColor(record.color);
  return {
    streamUuid: streamUuidRaw,
    name: name.trim(),
    ...(typeof record.is_archived === "boolean" ? { isArchived: record.is_archived } : {}),
    ...(creatorId != null ? { creatorId } : {}),
    ...(typeof record.invite_only === "boolean" ? { inviteOnly: record.invite_only } : {}),
    ...(color != null ? { color } : {}),
    ...(canAddSubscribersGroup != null ? { canAddSubscribersGroup } : {}),
    ...(canRemoveSubscribersGroup != null ? { canRemoveSubscribersGroup } : {}),
    ...(canAdministerChannelGroup != null ? { canAdministerChannelGroup } : {}),
    ...(canResolveTopicsGroup != null ? { canResolveTopicsGroup } : {}),
    ...(canMoveMessagesOutOfChannelGroup != null ? { canMoveMessagesOutOfChannelGroup } : {}),
    ...(notificationMode != null ? { notificationMode } : {}),
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

export interface WorkspaceStreamEventRow {
  streamUuid: string;
  name?: string;
  description?: string | null;
  unreadCount?: number;
  private?: boolean;
  inviteOnly?: boolean;
  isArchived?: boolean;
  creatorId?: string;
  color?: number;
  notificationMode?: ReturnType<typeof parseWorkspaceStreamNotificationMode>;
}

export function parseWorkspaceStreamEventRow(value: unknown): WorkspaceStreamEventRow | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const streamUuid = parseStreamUuid(record.uuid);
  if (streamUuid == null) return null;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  let description: string | null | undefined;
  if (typeof record.description === "string") {
    description = record.description;
  } else if (record.description === null) {
    description = null;
  }
  const creatorId = parseOwnerUuid(record);
  const notificationMode = parseWorkspaceStreamNotificationMode(record.notification_mode);
  const color = parseWorkspaceColor(record.color);
  return {
    streamUuid,
    ...(name.length > 0 ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(isNonNegativeInteger(record.unread_count) ? { unreadCount: record.unread_count } : {}),
    ...(typeof record.private === "boolean" ? { private: record.private } : {}),
    ...(typeof record.invite_only === "boolean" ? { inviteOnly: record.invite_only } : {}),
    ...(typeof record.is_archived === "boolean" ? { isArchived: record.is_archived } : {}),
    ...(creatorId != null ? { creatorId } : {}),
    ...(color != null ? { color } : {}),
    ...(notificationMode != null ? { notificationMode } : {}),
  };
}

function buildChatListStreamMetadataRow(
  row: WorkspaceStreamEventRow,
  existing: ReturnType<LayoutMessengerEventDispatchContext["chatList"]["streamsMap"]["get"]>,
) {
  const name = row.name ?? existing?.name;
  if (name == null || name.trim().length === 0) return null;
  return {
    streamUuid: row.streamUuid,
    name,
    ...(row.unreadCount != null ? { unreadCount: row.unreadCount } : {}),
    ...(row.private != null ? { private: row.private } : {}),
    ...(row.inviteOnly != null ? { inviteOnly: row.inviteOnly } : {}),
    ...(row.isArchived != null ? { isArchived: row.isArchived } : {}),
    ...(row.creatorId != null ? { creatorId: row.creatorId } : {}),
    ...(row.color != null ? { color: row.color } : {}),
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
  for (const row of rows) {
    if (row.notificationMode != null) {
      ctx.mute.setStreamNotificationMode(row.streamUuid, row.notificationMode);
    }
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
  color?: number;
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
    ...(existing?.color != null ? { color: existing.color } : {}),
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
  color?: number;
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

function applyColorSubscriptionMetadataField(
  row: SubscriptionMetadataRow,
  event: MessengerEvent,
): void {
  const color = parseWorkspaceColor(event.value);
  if (color != null) {
    row.color = color;
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
  color: (row, event) => applyColorSubscriptionMetadataField(row, event),
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
  if (property === "notification_mode") {
    const notificationMode = parseWorkspaceStreamNotificationMode(event.value);
    if (notificationMode == null) return;
    mute.setStreamNotificationMode(streamUuid, notificationMode);
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
    property !== "invite_only" &&
    property !== "color"
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
  if (event.type !== "stream") return;
  if (
    event.kind !== "stream.created" &&
    event.kind !== "stream.updated" &&
    event.kind !== "stream.read" &&
    event.kind !== "stream.deleted"
  ) {
    return;
  }
  const row = parseWorkspaceStreamEventRow(event.stream);
  if (row == null) return;
  if (event.kind === "stream.deleted") {
    ctx.chatList.removeStream(row.streamUuid);
    return;
  }
  const chatListRow = buildChatListStreamMetadataRow(
    row,
    ctx.chatList.streamsMap.get(row.streamUuid),
  );
  if (chatListRow != null) {
    ctx.chatList.upsertStreamMetadataRows([chatListRow]);
  }
  if (row.notificationMode != null) {
    ctx.mute.setStreamNotificationMode(row.streamUuid, row.notificationMode);
  }
  if (event.kind !== "stream.updated") return;
  ctx.chatInfo?.applyStreamMetadataUpdate({
    instanceId: ctx.currentInstanceId,
    streamUuid: row.streamUuid,
    ...(row.name != null ? { name: row.name } : {}),
    ...("description" in row ? { description: row.description ?? null } : {}),
  });
}

type WorkspaceTopicEventKind = "topic.created" | "topic.updated" | "topic.read" | "topic.deleted";

interface WorkspaceTopicEventRow {
  topicUuid: string;
  streamUuid: string;
  name?: string;
  unreadCount?: number;
  isDone?: boolean;
  color?: number;
  notificationMode?: ReturnType<typeof parseWorkspaceTopicNotificationMode>;
}

function isWorkspaceTopicEventKind(kind: unknown): kind is WorkspaceTopicEventKind {
  return (
    kind === "topic.created" ||
    kind === "topic.updated" ||
    kind === "topic.read" ||
    kind === "topic.deleted"
  );
}

function parseWorkspaceTopicEventRow(value: unknown): WorkspaceTopicEventRow | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const topicUuid = parseStreamUuid(record.uuid);
  const streamUuid = parseStreamUuid(record.stream_uuid);
  if (topicUuid == null || streamUuid == null) return null;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const notificationMode = parseWorkspaceTopicNotificationMode(record.notification_mode);
  const color = parseWorkspaceColor(record.color);
  return {
    topicUuid,
    streamUuid,
    ...(name.length > 0 ? { name } : {}),
    ...(isNonNegativeInteger(record.unread_count) ? { unreadCount: record.unread_count } : {}),
    ...(typeof record.is_done === "boolean" ? { isDone: record.is_done } : {}),
    ...(color != null ? { color } : {}),
    ...(notificationMode != null ? { notificationMode } : {}),
  };
}

function findExistingTopicSubjectByUuid(
  ctx: LayoutMessengerEventDispatchContext,
  streamUuid: string,
  topicUuid: string,
): string | undefined {
  const normalizedTopicUuid = topicUuid.trim().toLowerCase();
  const stream = ctx.chatList.streamsMap.get(streamUuid);
  if (stream == null) return undefined;
  for (const topic of stream.topics.values()) {
    if (topic.topicUuid?.trim().toLowerCase() === normalizedTopicUuid) {
      return topic.subject;
    }
  }
  return undefined;
}

export function handleTopic(event: MessengerEvent, ctx: LayoutMessengerEventDispatchContext): void {
  if (event.type !== "topic" || !isWorkspaceTopicEventKind(event.kind)) return;
  const row = parseWorkspaceTopicEventRow(event.topic);
  if (row == null) return;

  if (event.kind === "topic.deleted") {
    ctx.chatList.removeStreamTopic(row.streamUuid, row.topicUuid);
    ctx.mute.clearTopicVisibilityOverride(row.streamUuid, row.topicUuid);
    return;
  }

  if (row.notificationMode != null) {
    ctx.mute.setTopicNotificationMode(row.streamUuid, row.topicUuid, row.notificationMode);
  }

  const topicName = row.name ?? findExistingTopicSubjectByUuid(ctx, row.streamUuid, row.topicUuid);
  if (topicName == null) return;
  ctx.chatList.upsertStreamTopicShells(row.streamUuid, [
    {
      topicUuid: row.topicUuid,
      streamUuid: row.streamUuid,
      name: topicName,
      ...(row.unreadCount != null ? { unreadCount: row.unreadCount } : {}),
      ...(row.isDone != null ? { isDone: row.isDone } : {}),
      ...(row.color != null ? { color: row.color } : {}),
    },
  ]);
}

export function handleStreamBinding(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "stream_binding" || event.kind !== "stream_bindings.created") return;
  const streamUuids = new Set<string>();
  const eventStreamUuid = parseStreamUuid(event.stream_uuid) ?? parseStreamUuid(event.uuid);
  if (eventStreamUuid != null) {
    streamUuids.add(eventStreamUuid);
  }
  const bindings = Array.isArray(event.stream_bindings) ? event.stream_bindings : event.items;
  if (Array.isArray(bindings)) {
    for (const binding of bindings) {
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
