import type {
  WorkspaceMessengerFolderItemChatType,
  WorkspaceMessengerSourceDto,
  WorkspaceMessengerSourceName,
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";

// These are domain types for the new path, not raw Workspace API responses.
// Backend fields such as stream_uuid are converted here into app fields such as streamUuid.
export type MessengerUuid = string;
export type MessengerConversationId = string;
export type MessengerAudience = "channel" | "private";
export type WorkspaceConversationUiKind = "channel" | "directPrivate";

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
  lastMessageUuid: MessengerUuid | null;
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
  lastMessageUuid: MessengerUuid | null;
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
  lastMessageUuid?: MessengerUuid | null;
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
  systemType: "all" | "created" | "personal" | "channels" | null;
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

export interface MessengerSidebarMessagePreview {
  messageUuid: MessengerUuid;
  text: string;
  senderName?: string;
}

// These types describe the ready sidebar view, not backend data:
// title for the row, route for navigation, and unreadCount for the badge.
export interface MessengerSidebarTopicItem {
  id: MessengerConversationId;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  title: string;
  unreadCount: number;
  isDone: boolean;
  route: string;
  preview: MessengerSidebarMessagePreview | null;
  updatedAt: string;
}

export interface MessengerSidebarStreamItem {
  id: MessengerConversationId;
  streamUuid: MessengerUuid;
  title: string;
  audience: MessengerAudience;
  isPrivate: boolean;
  uiKind: WorkspaceConversationUiKind;
  unreadCount: number;
  pinnedAt: string | null;
  orderIndex: number | null;
  route: string;
  topics: MessengerSidebarTopicItem[];
  preview: MessengerSidebarMessagePreview | null;
  updatedAt: string;
  lastMessageCreatedAt: string | null;
}

export interface MessengerSidebarFolderView {
  folderUuid: MessengerUuid;
  title: string;
  backgroundColorValue: number | null;
  unreadCount: number;
  systemType: MessengerFolder["systemType"];
  items: MessengerFolderItem[];
}
