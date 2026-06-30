import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerFolderItemDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerUserDto,
} from "~/shared/api/messenger.types";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import type {
  MessengerConversation,
  MessengerBootstrapPayload,
  MessengerFolder,
  MessengerFolderItem,
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUser,
} from "./messenger.types";

// UI uses a simple audience label while backend source of truth is stream.private.
function streamAudience(
  stream: Pick<WorkspaceMessengerStreamDto, "private">,
): "channel" | "private" {
  return stream.private ? "private" : "channel";
}

export function adaptMessengerStream(dto: WorkspaceMessengerStreamDto): MessengerStream {
  return {
    uuid: dto.uuid,
    projectId: dto.project_id,
    ownerUuid: dto.owner,
    userUuid: dto.user_uuid,
    role: dto.role,
    notificationMode: dto.notification_mode,
    name: dto.name,
    description: dto.description,
    unreadCount: dto.unread_count,
    sourceName: dto.source_name,
    source: dto.source,
    audience: streamAudience(dto),
    isPrivate: dto.private,
    inviteOnly: dto.invite_only,
    announce: dto.announce,
    isArchived: dto.is_archived,
    directUserUuid: dto.direct_user_uuid ?? null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

// Adapters are the only place where raw backend field names enter the domain.
export function adaptMessengerStreamBinding(
  dto: WorkspaceMessengerStreamBindingDto,
): MessengerStreamBinding {
  return {
    uuid: dto.uuid,
    projectId: dto.project_id,
    streamUuid: dto.stream_uuid,
    userUuid: dto.user_uuid,
    whoUuid: dto.who_uuid,
    role: dto.role,
    notificationMode: dto.notification_mode,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function adaptMessengerTopic(dto: WorkspaceMessengerTopicDto): MessengerTopic {
  return {
    uuid: dto.uuid,
    projectId: dto.project_id,
    streamUuid: dto.stream_uuid,
    userUuid: dto.user_uuid,
    name: dto.name,
    unreadCount: dto.unread_count,
    isDefault: dto.is_default,
    isDone: dto.is_done,
    notificationMode: dto.notification_mode,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function adaptStreamToMessengerConversation(
  stream: WorkspaceMessengerStreamDto,
): MessengerConversation {
  return {
    id: conversationIdForStream(stream.uuid),
    streamUuid: stream.uuid,
    title: stream.name,
    audience: streamAudience(stream),
    isPrivate: stream.private,
    unreadCount: stream.unread_count,
    isArchived: stream.is_archived,
    directUserUuid: stream.direct_user_uuid ?? null,
    notificationMode: stream.notification_mode,
  };
}

export function adaptTopicToMessengerConversation(
  topic: WorkspaceMessengerTopicDto,
  stream: WorkspaceMessengerStreamDto,
): MessengerConversation {
  if (topic.stream_uuid !== stream.uuid) {
    throw new TypeError("Topic stream does not match conversation stream");
  }

  return {
    id: conversationIdForTopic(stream.uuid, topic.uuid),
    streamUuid: stream.uuid,
    topicUuid: topic.uuid,
    title: topic.name,
    audience: streamAudience(stream),
    isPrivate: stream.private,
    unreadCount: topic.unread_count,
    isArchived: stream.is_archived,
    directUserUuid: stream.direct_user_uuid,
    notificationMode: topic.notification_mode,
    isDone: topic.is_done,
    isDefaultTopic: topic.is_default,
  };
}

export function adaptMessengerMessage(dto: WorkspaceMessengerMessageDto): MessengerMessage {
  return {
    uuid: dto.uuid,
    conversationId: conversationIdForTopic(dto.stream_uuid, dto.topic_uuid),
    projectId: dto.project_id,
    streamUuid: dto.stream_uuid,
    topicUuid: dto.topic_uuid,
    authorUuid: dto.author_uuid,
    userUuid: dto.user_uuid,
    markdown: dto.payload.content,
    read: dto.read,
    pinned: dto.pinned,
    starred: dto.starred,
    isOwn: dto.is_own,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function adaptMessengerFolderItem(
  dto: WorkspaceMessengerFolderItemDto,
): MessengerFolderItem {
  const folderUuid = dto.folder_uuid ?? dto.folder;
  if (folderUuid == null) {
    throw new TypeError("Folder item does not reference a folder");
  }

  return {
    uuid: dto.uuid,
    projectId: dto.project_id,
    folderUuid,
    userUuid: dto.user_uuid,
    streamUuid: dto.stream_uuid,
    conversationId: conversationIdForStream(dto.stream_uuid),
    chatType: dto.chat_type,
    orderIndex: dto.order_index,
    pinnedAt: dto.pinned_at,
    unreadCount: dto.unread_count,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function adaptMessengerFolder(dto: WorkspaceMessengerFolderDto): MessengerFolder {
  return {
    uuid: dto.uuid,
    title: dto.title,
    backgroundColorValue: dto.background_color_value ?? null,
    unreadCount: dto.unread_count,
    systemType: dto.system_type,
    items: dto.folder_items.map(adaptMessengerFolderItem),
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function adaptMessengerUser(dto: WorkspaceMessengerUserDto): MessengerUser {
  return {
    uuid: dto.uuid,
    username: dto.username,
    status: dto.status,
    firstName: dto.first_name,
    lastName: dto.last_name,
    email: dto.email,
    lastPingAt: dto.last_ping_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export interface WorkspaceMessengerBootstrapDtoPayload {
  streams: WorkspaceMessengerStreamDto[];
  streamBindings?: WorkspaceMessengerStreamBindingDto[];
  topics: WorkspaceMessengerTopicDto[];
  folders: WorkspaceMessengerFolderDto[];
  users: WorkspaceMessengerUserDto[];
}

export function adaptMessengerBootstrapPayload(
  payload: WorkspaceMessengerBootstrapDtoPayload,
): MessengerBootstrapPayload {
  const streams = payload.streams.map(adaptMessengerStream);
  const streamBindings = (payload.streamBindings ?? []).map(adaptMessengerStreamBinding);
  const topics = payload.topics.map(adaptMessengerTopic);
  const folders = payload.folders.map(adaptMessengerFolder);
  const users = payload.users.map(adaptMessengerUser);
  const streamDtosById: Record<string, WorkspaceMessengerStreamDto> = {};
  const conversations: MessengerConversation[] = [];

  for (const streamDto of payload.streams) {
    streamDtosById[streamDto.uuid] = streamDto;
    conversations.push(adaptStreamToMessengerConversation(streamDto));
  }

  for (const topicDto of payload.topics) {
    const streamDto = streamDtosById[topicDto.stream_uuid];
    if (streamDto == null) continue;

    conversations.push(adaptTopicToMessengerConversation(topicDto, streamDto));
  }

  return {
    streams,
    streamBindings,
    topics,
    conversations,
    folders,
    users,
  };
}
