import type { ChatListStreamMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

interface StreamMetadataAccessFields {
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
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
  const accessFields = resolveStreamMetadataAccessFields(row, existing);
  const accessSpread = spreadStreamMetadataAccessFields(accessFields);
  if (existing) {
    return {
      ...existing,
      name: name.length > 0 ? name : existing.name,
      ...accessSpread,
    };
  }
  return {
    stream_id: row.streamId,
    name: name.length > 0 ? name : String(row.streamId),
    lastMessage: "",
    lastMessageSenderName: undefined,
    time: "",
    ts: 0,
    ...accessSpread,
    topics: new Map(),
  };
}
