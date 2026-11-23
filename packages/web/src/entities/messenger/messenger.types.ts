import type {
  WorkspaceMessengerDeliveryDto,
  WorkspaceMessengerFolderItemChatType,
  WorkspaceMessengerProviderDto,
  WorkspaceMessengerSourceName,
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
  WorkspaceMessengerTopicSummaryReasoningEffort,
} from "~/shared/api/messenger.types";
import type { PresenceVisual } from "~/shared/ui/presence-indicator";

// These are domain types for the new path, not raw Workspace API responses.
// Backend fields such as stream_uuid are converted here into app fields such as streamUuid.

export type MessengerUuid = string;
export type MessengerConversationId = string;
export type MessengerAudience = "channel" | "private";
export type WorkspaceConversationUiKind = "channel" | "directPrivate";

// Counts and bounded complete user lists stay separate in the domain.
// A missing user-list key means count-only and never a partial list.
export type MessengerReactionCountsByName = Record<string, number>;
export type MessengerReactionUserUuidsByName = Record<string, MessengerUuid[]>;
export type MessengerOptimisticReactionUserUuidsByName = Record<string, MessengerUuid[] | null>;

// Локальная проекция собственных реакций нужна только для действий текущего
// пользователя: по emoji_name быстро понять, есть ли моя реакция, и какой
// reactionUuid нужно отправить в DELETE. Это не часть серверного aggregate.
export type MessengerOwnReactionUuidsByName = Record<string, MessengerUuid>;

export type MessengerPendingOwnReactionOperation = "add" | "remove";

export interface MessengerPendingOwnReactionState {
  readonly requestId: string;
  readonly operation: MessengerPendingOwnReactionOperation;
  readonly previousCount: number;
  readonly previousOwnReactionUuid: MessengerUuid | null;
}

// Pending-проекция живет только в runtime message store. Она не подменяет
// reactionUuid, не попадает в IndexedDB и нужна, чтобы UI сразу показывал
// счетчик/подсветку до ответа Workspace API.
export type MessengerPendingOwnReactionsByName = Record<string, MessengerPendingOwnReactionState>;

export interface MessengerMarkdownPayload {
  readonly kind: "markdown";
  readonly content: string;
}

export interface MessengerPollPayload {
  readonly kind: "poll";
  readonly questions: readonly {
    readonly uuid: string;
    readonly text: string;
    readonly options: readonly { readonly uuid: string; readonly text: string }[];
    readonly correctOptionUuids: readonly string[];
  }[];
  readonly multipleAnswers: boolean;
  readonly isAnonymous: boolean;
  readonly allowRevote: boolean;
  readonly resultsVisibility: "always" | "after_vote";
  readonly allowAddingOptions: boolean;
  readonly closesAt: string | null;
  readonly closedAt: string | null;
}
export interface MessengerPollState {
  readonly revision: number;
  readonly isClosed: boolean;
  readonly voterCount: number;
  readonly questions: readonly {
    readonly questionUuid: string;
    readonly voterCount: number;
    readonly optionCounts: Readonly<Record<string, number>>;
    readonly optionVoterPreviews?: Readonly<Record<string, readonly string[]>>;
  }[];
  readonly myVotes: readonly {
    readonly questionUuid: string;
    readonly optionUuids: readonly string[];
  }[];
}

export interface MessengerEncryptedPayload {
  readonly kind: "e2ee";
  readonly keyUuid: string;
  readonly content: string;
}
export interface MessengerKeyRequestPayload {
  readonly kind: "key_request";
  readonly keyUuid: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly publicKey: string;
}
export interface MessengerKeyGrantPayload {
  readonly kind: "key_grant";
  readonly keyUuid: string;
  readonly requestMessageUuid: string;
  readonly senderDeviceId: string;
  readonly recipientDeviceId: string;
  readonly content: string;
}
export interface MessengerKeyAnnouncedPayload {
  readonly kind: "key_announced";
  readonly keyUuid: string;
}
export interface MessengerKeyRejectPayload {
  readonly kind: "key_reject";
  readonly keyUuid: string;
  readonly requestMessageUuid: string;
  readonly senderDeviceId: string;
  readonly recipientDeviceId: string;
}
export type MessengerE2eePayload =
  | MessengerEncryptedPayload
  | MessengerKeyRequestPayload
  | MessengerKeyGrantPayload
  | MessengerKeyAnnouncedPayload
  | MessengerKeyRejectPayload;
// Encoded payloads are preserved in store/cache; decoding belongs at the crypto boundary.
export type MessengerMessagePayload =
  | MessengerMarkdownPayload
  | MessengerPollPayload
  | MessengerE2eePayload;

// Минимальная строка собственной реакции для обогащения message store из cache
// или SWR. Store не зависит от IndexedDB-типа и принимает только доменные поля,
// которые действительно нужны для projection.
export interface MessengerOwnReactionProjectionRow {
  emojiName: string;
  reactionUuid: MessengerUuid;
}

export interface MessengerStream {
  readonly uuid: MessengerUuid;
  readonly projectId: MessengerUuid;
  readonly ownerUuid: MessengerUuid;
  readonly userUuid: MessengerUuid;
  readonly role: "guest" | "member" | "moderator" | "administrator" | "owner";
  readonly notificationMode: WorkspaceMessengerStreamNotificationMode;
  readonly name: string;
  readonly description: string;
  readonly unreadCount: number;
  readonly activeUnreadCount?: number;
  readonly passiveUnreadCount?: number;
  readonly sourceName: WorkspaceMessengerSourceName;
  readonly providerUuid?: MessengerUuid | null;
  readonly providerIdentity?: string | null;
  readonly audience: MessengerAudience;
  readonly isPrivate: boolean;
  readonly encryption?: boolean;
  readonly allowKeySharingByHolders?: boolean;
  readonly keySharingUpdatedAt?: string;
  readonly currentEncryptionKey?: { readonly keyUuid: string } | null;
  readonly inviteOnly: boolean;
  readonly announce: boolean;
  readonly isArchived: boolean;
  readonly color?: number | null;
  readonly directUserUuid: MessengerUuid | null;
  readonly lastMessageUuid: MessengerUuid | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// Bindings let the domain track stream membership without reading raw DTOs.
export interface MessengerStreamBinding {
  readonly uuid: MessengerUuid;
  readonly projectId: MessengerUuid;
  readonly streamUuid: MessengerUuid;
  readonly userUuid: MessengerUuid;
  readonly whoUuid: MessengerUuid;
  readonly role: "guest" | "member" | "moderator" | "administrator" | "owner";
  readonly notificationMode: WorkspaceMessengerStreamNotificationMode;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MessengerTopic {
  readonly uuid: MessengerUuid;
  readonly projectId: MessengerUuid;
  readonly streamUuid: MessengerUuid;
  readonly userUuid: MessengerUuid;
  readonly name: string;
  readonly unreadCount: number;
  readonly activeUnreadCount?: number;
  readonly passiveUnreadCount?: number;
  readonly isDefault: boolean;
  readonly isDone: boolean;
  readonly notificationMode: WorkspaceMessengerTopicNotificationMode;
  readonly color?: number | null;
  readonly lastMessageUuid: MessengerUuid | null;
  readonly summary?: string | null;
  readonly summaryLastMessageUuid?: MessengerUuid | null;
  readonly summaryHasNewMessages?: boolean | null;
  readonly summaryEnabled?: boolean;
  readonly summarySystemPrompt?: string | null;
  readonly summaryReasoningEffort?: WorkspaceMessengerTopicSummaryReasoningEffort | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MessengerConversation {
  readonly id: MessengerConversationId;
  readonly streamUuid: MessengerUuid;
  readonly topicUuid?: MessengerUuid;
  readonly title: string;
  readonly audience: MessengerAudience;
  readonly isPrivate: boolean;
  readonly unreadCount: number;
  readonly activeUnreadCount?: number;
  readonly passiveUnreadCount?: number;
  readonly isArchived?: boolean;
  readonly directUserUuid?: MessengerUuid | null;
  readonly lastMessageUuid?: MessengerUuid | null;
  readonly notificationMode?:
    | WorkspaceMessengerStreamNotificationMode
    | WorkspaceMessengerTopicNotificationMode;
  readonly isDone?: boolean;
  readonly isDefaultTopic?: boolean;
}

export interface MessengerMessage {
  readonly uuid: MessengerUuid;
  readonly conversationId: MessengerConversationId;
  readonly projectId: MessengerUuid;
  readonly streamUuid: MessengerUuid;
  readonly topicUuid: MessengerUuid;
  readonly authorUuid: MessengerUuid;
  readonly userUuid: MessengerUuid;
  readonly payload: MessengerMessagePayload;
  readonly pollState?: MessengerPollState | null;
  readonly read: boolean;
  readonly pinned: boolean;
  readonly starred: boolean;
  readonly isOwn: boolean;
  // The fields below stay optional because durable cache rows can predate provenance.
  readonly mentioned?: boolean;
  readonly sourceName?: WorkspaceMessengerSourceName;
  readonly providerUuid?: MessengerUuid | null;
  readonly providerIdentity?: string | null;
  readonly provider?:
    | (Readonly<Omit<WorkspaceMessengerProviderDto, "capabilities">> & {
        readonly capabilities?: Readonly<Record<string, unknown>>;
      })
    | null;
  readonly delivery?: Readonly<WorkspaceMessengerDeliveryDto> | null;
  readonly reactions: Readonly<MessengerReactionCountsByName>;
  readonly reactionUserUuidsByEmojiName: Readonly<Record<string, readonly MessengerUuid[]>>;
  readonly optimisticReactionUserUuidsByEmojiName?: Readonly<
    Record<string, readonly MessengerUuid[] | null>
  >;
  readonly ownReactionUuidsByEmojiName: Readonly<MessengerOwnReactionUuidsByName>;
  readonly pendingOwnReactionsByEmojiName?: Readonly<MessengerPendingOwnReactionsByName>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MessengerFolderItem {
  readonly uuid: MessengerUuid;
  readonly projectId: MessengerUuid;
  readonly folderUuid: MessengerUuid;
  readonly userUuid: MessengerUuid;
  readonly streamUuid: MessengerUuid;
  readonly conversationId: MessengerConversationId;
  readonly chatType: WorkspaceMessengerFolderItemChatType;
  readonly orderIndex: number | null;
  readonly pinnedAt: string | null;
  readonly unreadCount: number;
  readonly activeUnreadCount?: number;
  readonly passiveUnreadCount?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MessengerFolder {
  readonly uuid: MessengerUuid;
  readonly title: string;
  readonly backgroundColorValue: number | null;
  readonly unreadCount: number;
  readonly systemType: "all" | "created" | "personal" | "channels" | null;
  readonly items: readonly MessengerFolderItem[];
  readonly createdAt: string;
  readonly updatedAt: string;
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
  /** Encrypted content is resolved only in mounted presentation memory. */
  encrypted?: true;
}

// Ready topic-list projection shared by messenger surfaces, not a backend DTO:
// title is display-ready, route handles navigation, and counts drive badges.
export interface MessengerTopicListItem {
  id: MessengerConversationId;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  title: string;
  unreadCount: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  /** Best-effort flag computed from unread messages currently known to the client. */
  hasUnreadPersonalMention?: boolean;
  isDefault: boolean;
  isDone: boolean;
  notificationMode: WorkspaceMessengerTopicNotificationMode;
  color: number | null;
  route: string;
  preview: MessengerSidebarMessagePreview | null;
  lastMessageCreatedAt: string | null;
  updatedAt: string;
}

/** Compatibility alias for sidebar call sites while topic projections are shared across surfaces. */
export type MessengerSidebarTopicItem = MessengerTopicListItem;

export interface MessengerSidebarStreamItem {
  id: MessengerConversationId;
  streamUuid: MessengerUuid;
  directUserUuid: MessengerUuid | null;
  title: string;
  /** Additional profile fields for direct-chat search, never displayed as the title. */
  directUserSearchText?: string;
  audience: MessengerAudience;
  isPrivate: boolean;
  encryption?: boolean;
  isArchived: boolean;
  uiKind: WorkspaceConversationUiKind;
  notificationMode: WorkspaceMessengerStreamNotificationMode | null;
  unreadCount: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  /** Best-effort flag computed from unread messages currently known to the client. */
  hasUnreadPersonalMention?: boolean;
  pinnedAt: string | null;
  orderIndex: number | null;
  route: string;
  topics: MessengerTopicListItem[];
  preview: MessengerSidebarMessagePreview | null;
  color?: number | null;
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
  items: readonly MessengerFolderItem[];
}
