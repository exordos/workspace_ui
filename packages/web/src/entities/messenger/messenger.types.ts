import type {
  WorkspaceMessengerFolderItemChatType,
  WorkspaceMessengerSourceDto,
  WorkspaceMessengerSourceName,
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";

// Domain ids are still UUID strings, but UI never depends on backend field names.
export type MessengerUuid = string;
export type MessengerConversationId = string;
export type MessengerAudience = "channel" | "private";

export interface MessengerStream {
  uuid: MessengerUuid;
  projectId: MessengerUuid;
  ownerUuid: MessengerUuid;
  userUuid: MessengerUuid;
  role: "guest" | "member" | "moderator" | "administrator" | "owner";
  notificationMode: WorkspaceMessengerStreamNotificationMode;
  name: string;
  description: string;
  unreadCount: number;
  sourceName: WorkspaceMessengerSourceName;
  source: WorkspaceMessengerSourceDto;
  audience: MessengerAudience;
  isPrivate: boolean;
  inviteOnly: boolean;
  announce: boolean;
  isArchived: boolean;
  directUserUuid: MessengerUuid | null;
  createdAt: string;
  updatedAt: string;
}

// Bindings let the domain track stream membership without reading raw DTOs.
export interface MessengerStreamBinding {
  uuid: MessengerUuid;
  projectId: MessengerUuid;
  streamUuid: MessengerUuid;
  userUuid: MessengerUuid;
  whoUuid: MessengerUuid;
  role: "guest" | "member" | "moderator" | "administrator" | "owner";
  notificationMode: WorkspaceMessengerStreamNotificationMode;
  createdAt: string;
  updatedAt: string;
}

export interface MessengerTopic {
  uuid: MessengerUuid;
  projectId: MessengerUuid;
  streamUuid: MessengerUuid;
  userUuid: MessengerUuid;
  name: string;
  unreadCount: number;
  isDefault: boolean;
  isDone: boolean;
  notificationMode: WorkspaceMessengerTopicNotificationMode;
  createdAt: string;
  updatedAt: string;
}

export interface MessengerConversation {
  id: MessengerConversationId;
  streamUuid: MessengerUuid;
  topicUuid?: MessengerUuid;
  title: string;
  audience: MessengerAudience;
  isPrivate: boolean;
  unreadCount: number;
  isArchived?: boolean;
  directUserUuid?: MessengerUuid | null;
  notificationMode?:
    | WorkspaceMessengerStreamNotificationMode
    | WorkspaceMessengerTopicNotificationMode;
  isDone?: boolean;
  isDefaultTopic?: boolean;
}

export interface MessengerMessage {
  uuid: MessengerUuid;
  conversationId: MessengerConversationId;
  projectId: MessengerUuid;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  authorUuid: MessengerUuid;
  userUuid: MessengerUuid;
  markdown: string;
  read: boolean;
  pinned: boolean;
  starred: boolean;
  isOwn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessengerFolderItem {
  uuid: MessengerUuid;
  projectId: MessengerUuid;
  folderUuid: MessengerUuid;
  userUuid: MessengerUuid;
  streamUuid: MessengerUuid;
  conversationId: MessengerConversationId;
  chatType: WorkspaceMessengerFolderItemChatType;
  orderIndex: number | null;
  pinnedAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessengerFolder {
  uuid: MessengerUuid;
  title: string;
  backgroundColorValue: number | null;
  unreadCount: number;
  systemType: "all" | "created" | null;
  items: MessengerFolderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface MessengerUser {
  uuid: MessengerUuid;
  username: string;
  status: "active" | "idle" | "offline" | "do_not_disturb";
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  lastPingAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Bootstrap is the first full snapshot for one runtime owner.
export interface MessengerBootstrapPayload {
  streams: MessengerStream[];
  streamBindings: MessengerStreamBinding[];
  topics: MessengerTopic[];
  conversations: MessengerConversation[];
  folders: MessengerFolder[];
  users: MessengerUser[];
}

export interface MessengerDeletedStream {
  uuid: MessengerUuid;
}

export interface MessengerDeletedTopic {
  uuid: MessengerUuid;
  streamUuid: MessengerUuid;
}

export interface MessengerDeletedMessage {
  uuid: MessengerUuid;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
}

export interface MessengerDeletedFolder {
  uuid: MessengerUuid;
}

export interface MessengerDeletedFolderItem {
  uuid: MessengerUuid;
}

export interface MessengerSkippedRealtimeEvent {
  epochVersion: number;
  reason: string;
}
