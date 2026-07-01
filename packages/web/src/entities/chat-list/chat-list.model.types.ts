/** Types for the chat-list Zustand store — state and public actions consumed by layout/widgets. */
import type { MessengerGroupSettingValue, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export interface ChatListStreamMetadataRow {
  /** Workspace stream UUID used as the stream identity and for gateway reads/writes. */
  streamUuid: string;
  name: string;
  unreadCount?: number;
  private?: boolean;
  isArchived?: boolean;
  creatorId?: string;
  inviteOnly?: boolean;
  /** Server-owned stream color as 0xRRGGBB. */
  color?: number;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  canResolveTopicsGroup?: MessengerGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
}

export interface ChatListStreamTopicMetadataRow {
  topicUuid: string;
  streamUuid: string;
  name: string;
  unreadCount?: number;
  isDefault?: boolean;
  isDone?: boolean;
  /** Server-owned topic color as 0xRRGGBB. */
  color?: number;
}

export interface ChatListDmMetadataRow {
  userIds: UserId[];
  streamUuid?: string;
  userUuid?: string;
  name?: string;
  lastActivityTs?: number;
  lastMessageId?: MessageId | null;
  unreadCount?: number;
}

export type MessageLocation =
  | { type: "stream"; streamUuid: string; topic: string; topicUuid?: string }
  | { type: "dm"; dmKey: string };

export interface ChatListPreviewSourceMessage {
  id: MessageId;
  stream_uuid?: string | null;
  display_recipient?:
    | string
    | { id: number; full_name: string; email?: string; avatar_url?: string }[];
  subject?: string;
  topic_uuid?: string;
  content: string;
  timestamp: number;
  sender_full_name?: string;
}

export interface ChatListHandleDeleteMessagesOptions {
  replacementMessages?: readonly ChatListPreviewSourceMessage[];
  resolveMissingPreview?: boolean;
}

export interface ChatListState {
  streamsMap: Map<string, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  /**
   * True once the sidebar can rely on local chat sources: first setFromMessages/addMessages,
   * metadata upserts that changed maps, or IDB hydrate with non-empty maps. False after clear.
   */
  sidebarDataHydrated: boolean;
  /** True after authoritative stream metadata is applied. */
  streamMetadataHydrated: boolean;
  currentUserId: UserId | null;
  lastAppliedMessages: WorkspaceRawMessage[] | null;
  messageIdToLocation: Map<MessageId, MessageLocation>;
  /** Inverted index streamId+topic → message ids; patched incrementally on location changes. */
  streamTopicMessageIds: Map<string, MessageId[]>;
  /** Server-owned stream unread total; local maps must not derive it. */
  sidebarStreamsUnread: number;
  /** Server-owned DM unread total; local maps must not derive it. */
  sidebarDmsUnread: number;
  /** Server-backed unread @mentions count. Kept zero until the new backend exposes this value. */
  mentionsUnreadCount: number;
  /** Message ids counted in `mentionsUnreadCount`; empty until the new backend exposes them. */
  mentionedUnreadMessageIds: Set<MessageId>;
  /** Last sidebar bootstrap failure message, cleared on successful rebuild. */
  bootstrapError: string | null;
  setBootstrapError: (error: string | null) => void;
  clearBootstrapError: () => void;
  setFromMessages: (messages: WorkspaceRawMessage[], currentUserId: UserId | null) => void;
  /** Restore sidebar maps from IndexedDB snapshot (no raw `lastAppliedMessages`). */
  hydrateFromIndexedDbSnapshot: (snapshot: ChatListSnapshotSerialized) => void;
  addMessage: (message: WorkspaceRawMessage) => void;
  addMessages: (messages: WorkspaceRawMessage[]) => void;
  /** Adds `messageIdToLocation` entries for loaded messages without touching previews/unread totals. */
  upsertMessageLocations: (messages: WorkspaceRawMessage[]) => void;
  /** Stream/topic preview only — does not bump unread (metadata-first stream batch). */
  applyStreamSidebarPreviewsFromMessages: (messages: WorkspaceRawMessage[]) => void;
  /** Ensures topic rows exist for a stream (used by Workspace stream_topics API). */
  upsertStreamTopicShells: (
    streamUuid: string,
    topics: readonly ChatListStreamTopicMetadataRow[],
  ) => void;
  /** Adds channels from subscriptions metadata even when no messages for them are in memory. */
  upsertStreamMetadataRows: (rows: ChatListStreamMetadataRow[]) => void;
  /** Marks stream metadata readiness from authoritative subscriptions sources. */
  setStreamMetadataHydrated: (value: boolean) => void;
  /** Optimistically toggles archived state for a stream; `undefined` clears local override. */
  setStreamArchived: (streamId: string, isArchived: boolean | undefined) => void;
  /** Upserts DM rows from metadata and the local DM index (not only from loaded messages). */
  upsertDmMetadataRows: (rows: ChatListDmMetadataRow[]) => void;
  setCurrentUserId: (id: UserId | null) => void;
  renameStream: (streamId: string, nextName: string) => void;
  moveStreamTopic: (params: {
    streamId: string;
    oldTopic: string;
    newTopic: string;
    messageIds?: MessageId[];
    anchorMessageId?: MessageId;
  }) => void;
  moveTopicToStream: (params: {
    sourceStreamId: string;
    targetStreamId: string;
    oldTopic: string;
    newTopic: string;
    messageIds?: MessageId[];
    anchorMessageId?: MessageId;
  }) => void;
  removeStreamTopic: (streamId: string, topic: string) => void;
  removeStream: (streamId: string) => void;
  /** After a user profile is fetched, refresh personal DM row titles that still use placeholders. */
  patchPersonalDmRowLabelsForUser: (userId: UserId) => void;
  /** Recomputes sidebar unread totals, mentions count, and stream-topic index from current maps. */
  syncDerivedScalars: () => void;
  clear: () => void;
  handleDeleteMessages: (
    messageIds: MessageId[],
    options?: ChatListHandleDeleteMessagesOptions,
  ) => void;
  streams: () => StreamWithLast[];
  dms: () => Extract<SidebarChat, { type: "dm" }>[];
}
