import type { ChatListStreamMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

interface StreamMetadataAccessFields {
  isArchived?: boolean;
  creatorId?: StreamEntryInternal["creatorId"];
  inviteOnly?: boolean;
  private?: boolean;
  color?: number;
  sourceName?: StreamEntryInternal["sourceName"];
  source?: StreamEntryInternal["source"];
  canAddSubscribersGroup?: StreamEntryInternal["canAddSubscribersGroup"];
  canRemoveSubscribersGroup?: StreamEntryInternal["canRemoveSubscribersGroup"];
  canAdministerChannelGroup?: StreamEntryInternal["canAdministerChannelGroup"];
  canResolveTopicsGroup?: StreamEntryInternal["canResolveTopicsGroup"];
  canMoveMessagesOutOfChannelGroup?: StreamEntryInternal["canMoveMessagesOutOfChannelGroup"];
}

function resolveStreamMetadataAccessFields(
  row: ChatListStreamMetadataRow,
  existing: StreamEntryInternal | undefined,
): StreamMetadataAccessFields {
  return {
    isArchived: row.isArchived ?? existing?.isArchived,
    creatorId: row.creatorId ?? existing?.creatorId,
    inviteOnly: row.inviteOnly ?? existing?.inviteOnly,
    private: row.private ?? existing?.private,
    color: row.color ?? existing?.color,
    sourceName: row.sourceName ?? existing?.sourceName,
    source: row.source ?? existing?.source,
    canAddSubscribersGroup: row.canAddSubscribersGroup ?? existing?.canAddSubscribersGroup,
    canRemoveSubscribersGroup: row.canRemoveSubscribersGroup ?? existing?.canRemoveSubscribersGroup,
    canAdministerChannelGroup: row.canAdministerChannelGroup ?? existing?.canAdministerChannelGroup,
    canResolveTopicsGroup: row.canResolveTopicsGroup ?? existing?.canResolveTopicsGroup,
    canMoveMessagesOutOfChannelGroup:
      row.canMoveMessagesOutOfChannelGroup ?? existing?.canMoveMessagesOutOfChannelGroup,
  };
}

function spreadStreamMetadataAccessFields(
  fields: StreamMetadataAccessFields,
): Partial<StreamEntryInternal> {
  return {
    ...(fields.isArchived != null ? { isArchived: fields.isArchived } : {}),
    ...(fields.creatorId != null ? { creatorId: fields.creatorId } : {}),
    ...(fields.inviteOnly != null ? { inviteOnly: fields.inviteOnly } : {}),
    ...(fields.private != null ? { private: fields.private } : {}),
    ...(fields.color != null ? { color: fields.color } : {}),
    ...(fields.sourceName != null ? { sourceName: fields.sourceName } : {}),
    ...(fields.source != null ? { source: fields.source } : {}),
    ...(fields.canAddSubscribersGroup != null
      ? { canAddSubscribersGroup: fields.canAddSubscribersGroup }
      : {}),
    ...(fields.canRemoveSubscribersGroup != null
      ? { canRemoveSubscribersGroup: fields.canRemoveSubscribersGroup }
      : {}),
    ...(fields.canAdministerChannelGroup != null
      ? { canAdministerChannelGroup: fields.canAdministerChannelGroup }
      : {}),
    ...(fields.canResolveTopicsGroup != null
      ? { canResolveTopicsGroup: fields.canResolveTopicsGroup }
      : {}),
    ...(fields.canMoveMessagesOutOfChannelGroup != null
      ? { canMoveMessagesOutOfChannelGroup: fields.canMoveMessagesOutOfChannelGroup }
      : {}),
  };
}

/** Creates or updates a stream row from metadata without touching message history. */
export function buildStreamMetadataEntry(
  row: ChatListStreamMetadataRow,
  existing: StreamEntryInternal | undefined,
): StreamEntryInternal {
  const name = row.name.trim();
  const unreadCount = row.unreadCount ?? existing?.unreadCount ?? 0;
  const accessFields = resolveStreamMetadataAccessFields(row, existing);
  const accessSpread = spreadStreamMetadataAccessFields(accessFields);
  const defaultTopicUuid =
    "defaultTopicUuid" in row ? (row.defaultTopicUuid ?? null) : existing?.defaultTopicUuid;
  const defaultTopicSpread = defaultTopicUuid !== undefined ? { defaultTopicUuid } : {};
  const streamUuid = row.streamUuid;
  if (existing) {
    return {
      ...existing,
      name: name.length > 0 ? name : existing.name,
      streamUuid,
      unreadCount,
      ...defaultTopicSpread,
      ...accessSpread,
    };
  }
  return {
    streamUuid,
    name: name.length > 0 ? name : row.streamUuid,
    lastMessage: "",
    lastMessageSenderName: undefined,
    time: "",
    ts: 0,
    unreadCount,
    ...defaultTopicSpread,
    ...accessSpread,
    topics: new Map(),
  };
}
