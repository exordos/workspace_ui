import type {
  WorkspaceMessengerFolderItemChatType,
  WorkspaceMessengerSourceDto,
  WorkspaceMessengerSourceName,
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";

// These are domain types for the new path, not raw Workspace API responses.
// Backend fields such as stream_uuid are converted here into app fields such as streamUuid.
import type { PresenceVisual } from "~/shared/ui/presence-indicator.types";

export type MessengerUuid = string;
export type MessengerConversationId = string;
export type MessengerAudience = "channel" | "private";
export type WorkspaceConversationUiKind = "channel" | "directPrivate";

// Агрегат реакций в Workspace-домене совпадает с backend contract:
// ключом является стабильное emoji_name, значением - серверный счетчик.
// Здесь намеренно нет Zulip-полей reaction_type/emoji_code и нет списка
// пользователей, потому что таких данных backend message snapshot не несет.
export type MessengerReactionCountsByName = Record<string, number>;

// Локальная проекция собственных реакций нужна только для действий текущего
// пользователя: по emoji_name быстро понять, есть ли моя реакция, и какой
// reactionUuid нужно отправить в DELETE. Это не часть серверного aggregate.
export type MessengerOwnReactionUuidsByName = Record<string, MessengerUuid>;

export type MessengerPendingOwnReactionOperation = "add" | "remove";

export interface MessengerPendingOwnReactionState {
  requestId: string;
  operation: MessengerPendingOwnReactionOperation;
  previousCount: number;
  previousOwnReactionUuid: MessengerUuid | null;
}

// Pending-проекция живет только в runtime message store. Она не подменяет
// reactionUuid, не попадает в IndexedDB и нужна, чтобы UI сразу показывал
// счетчик/подсветку до ответа Workspace API.
export type MessengerPendingOwnReactionsByName = Record<string, MessengerPendingOwnReactionState>;

export interface MessengerMarkdownPayload {
  kind: "markdown";
  content: string;
}

// Domain payload mirrors the Workspace API envelope. Add new message kinds
// here when the backend contract grows instead of flattening them into text.
export type MessengerMessagePayload = MessengerMarkdownPayload;

// Минимальная строка собственной реакции для обогащения message store из cache
// или SWR. Store не зависит от IndexedDB-типа и принимает только доменные поля,
// которые действительно нужны для projection.
export interface MessengerOwnReactionProjectionRow {
  emojiName: string;
  reactionUuid: MessengerUuid;
}

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
  payload: MessengerMessagePayload;
  read: boolean;
  pinned: boolean;
  starred: boolean;
  isOwn: boolean;
  reactions: MessengerReactionCountsByName;
  ownReactionUuidsByEmojiName: MessengerOwnReactionUuidsByName;
  pendingOwnReactionsByEmojiName?: MessengerPendingOwnReactionsByName;
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

// Bootstrap is the first full snapshot for one runtime owner.
export interface MessengerBootstrapPayload {
  streams: MessengerStream[];
  streamBindings: MessengerStreamBinding[];
  topics: MessengerTopic[];
  conversations: MessengerConversation[];
  folders: MessengerFolder[];
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
  route?: string;
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
  lastMessageCreatedAt: string | null;
  updatedAt: string;
}

export interface MessengerSidebarStreamItem {
  id: MessengerConversationId;
  streamUuid: MessengerUuid;
  directUserUuid: MessengerUuid | null;
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
  avatarUrl?: string | null;
  presence?: PresenceVisual;
  statusEmoji?: string | null;
  statusText?: string | null;
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
