import type { ChatListStreamMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import type { CurrentChatContext } from "~/entities/message/message.model";
import type { IncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call.model";
import type {
  MessageReactions,
  MockMessage,
  MessengerUserMember,
  WorkspaceUserPresenceStatus,
  WorkspaceRawMessage,
  WorkspaceStreamNotificationMode,
  WorkspaceTopicNotificationMode,
} from "~/shared/api/messenger.types";
import type { WorkspaceFolder } from "~/shared/api/workspace-client";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { LinkPreviewData } from "~/shared/lib/message-link-preview.types";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

export type LayoutMessageFlagOp = "add" | "remove";

export interface LayoutChatListActions {
  currentUserId: UserId | null;
  // Current stream metadata map (partial channel-level permission updates).
  streamsMap: Map<string, StreamEntryInternal>;
  addMessage: (message: WorkspaceRawMessage) => void;
  // Ensures topic rows exist or refreshes their metadata after backend topic events.
  upsertStreamTopicShells: (
    streamUuid: string,
    topics: readonly {
      topicUuid: string;
      streamUuid: string;
      name: string;
      unreadCount?: number;
      isDone?: boolean;
    }[],
  ) => void;
  // Upsert channels from metadata and subscription events.
  upsertStreamMetadataRows: (rows: ChatListStreamMetadataRow[]) => void;
  // Rename channel on subscription update(name).
  renameStream: (streamId: string, nextName: string) => void;
  // Move topic within channel on update_message rename (resolved/unresolved).
  moveStreamTopic: (params: {
    streamId: string;
    oldTopic: string;
    newTopic: string;
    messageIds?: MessageId[];
    anchorMessageId?: MessageId;
  }) => void;
  // Move topic to another channel on update_message with new_stream_uuid.
  moveTopicToStream: (params: {
    sourceStreamId: string;
    targetStreamId: string;
    oldTopic: string;
    newTopic: string;
    messageIds?: MessageId[];
    anchorMessageId?: MessageId;
  }) => void;
  // Remove a topic row from the sidebar after backend topic.deleted events.
  removeStreamTopic: (streamId: string, topic: string) => void;
  // Remove channel from sidebar on unsubscribe/remove.
  removeStream: (streamId: string) => void;
  handleDeleteMessages: (messageIds: MessageId[]) => void;
}

export interface LayoutCurrentChatActions {
  context: CurrentChatContext | null;
  hasNewerMessages: boolean;
  appendMessage: (message: MockMessage) => void;
  updateMessageFlags: (messageIds: MessageId[], flag: string, op: LayoutMessageFlagOp) => void;
  replaceMessageReactions: (messageId: MessageId, reactions: MessageReactions) => void;
  removeMessages: (messageIds: MessageId[]) => void;
  updateMessageContent: (messageId: MessageId, content: string, markdownSource?: string) => void;
  updateMessageSource: (
    messageId: MessageId,
    sourceName: MockMessage["source_name"],
    source: MockMessage["source"],
  ) => void;
  updateMessageLinkPreview: (messageId: MessageId, linkPreview: LinkPreviewData | null) => void;
  moveStreamTopicMessages: (params: {
    streamId: string;
    oldTopic: string;
    newTopic: string;
    messageIds?: MessageId[];
    anchorMessageId?: MessageId;
  }) => void;
  moveTopicToStreamMessages: (params: {
    sourceStreamId: string;
    targetStreamId: string;
    targetStreamName: string;
    oldTopic: string;
    newTopic: string;
    messageIds?: MessageId[];
    anchorMessageId?: MessageId;
  }) => void;
}

export interface LayoutUsersActions {
  mergeUser: (user: MessengerUserMember) => void;
  mergeFromMessage: (message: WorkspaceRawMessage) => void;
  setPresenceByEmail: (
    email: string,
    presence: { status: WorkspaceUserPresenceStatus; timestamp: number },
  ) => void;
  setStatus: (
    userId: UserId,
    status: {
      text: string;
      emojiName?: string;
      emojiCode?: string;
      reactionType?: "unicode_emoji" | "realm_emoji";
      away: boolean;
    } | null,
    updatedAtMs: number,
  ) => void;
}

export interface LayoutTypingActions {
  setTyping: (chatKey: string, userId: number, isTyping: boolean) => void;
}

export interface LayoutMuteActions {
  isStreamMuted: (streamId: string) => boolean;
  isEffectivelyMuted: (streamId: string, topic: string) => boolean;
  isTopicFollowed: (streamId: string, topic: string) => boolean;
  getStreamNotificationMode: (streamId: string) => WorkspaceStreamNotificationMode;
  muteStream: (streamId: string) => void;
  unmuteStream: (streamId: string) => void;
  muteTopic: (streamId: string, topic: string) => void;
  unmuteTopic: (streamId: string, topic: string) => void;
  followTopic: (streamId: string, topic: string) => void;
  clearTopicVisibilityOverride: (streamId: string, topic: string) => void;
  setStreamNotificationMode: (
    streamId: string,
    notificationMode: WorkspaceStreamNotificationMode,
  ) => void;
  setTopicNotificationMode: (
    streamId: string,
    topic: string,
    notificationMode: WorkspaceTopicNotificationMode,
  ) => void;
}

export interface LayoutActivityActions {
  markStale: () => void;
  markStarredSummaryStale: () => void;
  applyStarredSummaryFlagEvent: (op: "add" | "remove", messageIds: readonly MessageId[]) => void;
}

export interface LayoutInboxActions {
  markStale: () => void;
  clearEntries: () => void;
}

export interface LayoutNotificationsActions {
  show: (options: {
    title: string;
    body: string;
    tag: string;
    silent?: boolean;
    clickRoute?: string;
  }) => Promise<void>;
  closeByTag: (tag: string) => void;
  playSound: (preset?: string) => void;
  getSoundPreset: () => string;
  requestAttentionIfNotFocused: () => void;
}

export interface LayoutJitsiCallActions {
  ingestIncomingInvite: (invite: IncomingDmCallInvite) => void;
}

export interface LayoutFolderSyncActions {
  applyRealtimeFolderSnapshot: (folder: WorkspaceFolder) => void;
  applyRealtimeFolderDeleted: (folderId: string) => void;
  applyRealtimeFolderItemDeleted: (folderItemId: string) => void;
}

export interface LayoutChatInfoActions {
  applyStreamMetadataUpdate: (params: {
    instanceId: string | null;
    streamUuid: string;
    name?: string;
    description?: string | null;
  }) => void;
}

export interface LayoutMessengerEventDispatchContext {
  currentInstanceId: string | null;
  chatList: LayoutChatListActions;
  currentChat: LayoutCurrentChatActions;
  users: LayoutUsersActions;
  typing: LayoutTypingActions;
  mute: LayoutMuteActions;
  activity: LayoutActivityActions;
  inbox: LayoutInboxActions;
  notifications: LayoutNotificationsActions;
  jitsiCall: LayoutJitsiCallActions;
  folderSync?: LayoutFolderSyncActions;
  chatInfo?: LayoutChatInfoActions;
  updateLatestMessageId: (id: MessageId) => void;
  // Notifies stream member changes from peer_add/peer_remove for external index updates.
  onStreamPeerMembersChanged?: (streamIds: string[]) => void;
  onMessage?: (message: WorkspaceRawMessage) => void;
}
