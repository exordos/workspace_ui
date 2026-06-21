/** Types for the chat-list Zustand store — state and public actions consumed by layout/widgets. */
import type { MessengerUnreadMessagesSnapshot } from "~/shared/api/messenger-unread.lib";
import type {
  MockMessage,
  MessengerGroupSettingValue,
  WorkspaceRawMessage,
} from "~/shared/api/messenger.types";
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
  private?: boolean;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
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
  isDefault?: boolean;
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
  /** True after authoritative subscriptions metadata is applied (bootstrap/register). */
  streamMetadataHydrated: boolean;
  currentUserId: UserId | null;
  lastAppliedMessages: WorkspaceRawMessage[] | null;
  messageIdToLocation: Map<MessageId, MessageLocation>;
  /** Inverted index streamId+topic → message ids; patched incrementally on location changes. */
  streamTopicMessageIds: Map<string, MessageId[]>;
  /** Sum of stream topic unread counts; updated incrementally or on full rebuild. */
  sidebarStreamsUnread: number;
  /** Sum of DM unread counts; updated incrementally or on full rebuild. */
  sidebarDmsUnread: number;
  /** Unread @mentions tracked for sidebar badge and personal indicator. */
  mentionsUnreadCount: number;
  /** Message ids counted in `mentionsUnreadCount` (in-memory; rebuilt from API/register). */
  mentionedUnreadMessageIds: Set<MessageId>;
  /** True when `mentionsUnreadCount` hit page cap (more unread mentions may exist server-side). */
  mentionsUnreadCapped: boolean;
  /** After authoritative GET is:mentioned+is:unread sync, register mention ids are not applied. */
  mentionsUnreadApiSynced: boolean;
  /** Last sidebar bootstrap failure message, cleared on successful rebuild. */
  bootstrapError: string | null;
  setBootstrapError: (error: string | null) => void;
  clearBootstrapError: () => void;
  setFromMessages: (messages: WorkspaceRawMessage[], currentUserId: UserId | null) => void;
  /** Restore sidebar maps from IndexedDB snapshot (no raw `lastAppliedMessages`). */
  hydrateFromIndexedDbSnapshot: (snapshot: ChatListSnapshotSerialized) => void;
  /** Authoritative unread reconcile from server snapshot (e.g. `is:unread`). */
  reconcileUnreadFromMessages: (
    messages: readonly WorkspaceRawMessage[],
    currentUserId: UserId | null,
  ) => void;
  /** Authoritative unread reconcile from register `unread_msgs` buckets. */
  reconcileUnreadFromSnapshot: (
    snapshot: MessengerUnreadMessagesSnapshot,
    currentUserId: UserId | null,
  ) => void;
  /** Authoritative replace of unread mention ids/count from GET is:mentioned+is:unread. */
  reconcileMentionsFromServer: (
    messages: readonly MockMessage[],
    options?: { capped?: boolean },
  ) => void;
  /** Register fallback for mention ids until first API sync. */
  reconcileMentionsFromRegisterIds: (messageIds: readonly MessageId[]) => void;
  decrementMentionsForReadMessages: (messageIds: readonly MessageId[]) => void;
  addMessage: (message: WorkspaceRawMessage, options?: { suppressUnreadBump?: boolean }) => void;
  addMessages: (messages: WorkspaceRawMessage[]) => void;
  /**
   * Adds `messageIdToLocation` entries for unread messages without touching previews/unread totals.
   * Needed so `update_message_flags(read)` can decrement totals for messages that were loaded in the open chat
   * but not previously indexed by sidebar bootstrap/lazy hydrate.
   */
  upsertUnreadMessageLocations: (messages: WorkspaceRawMessage[]) => void;
  /** Indexes mention message locations from API sync (stream/topic/DM rows for sidebar @ badge). */
  upsertMentionMessageLocations: (messages: readonly MockMessage[]) => void;
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
  decrementUnreadForMessages: (messageIds: MessageId[]) => void;
  decrementUnreadForTopic: (streamId: string, topic: string, count: number) => void;
  decrementUnreadForDmKey: (dmKey: string, count: number) => void;
  incrementUnreadForMessages: (messageIds: MessageId[]) => void;
  handleDeleteMessages: (
    messageIds: MessageId[],
    options?: ChatListHandleDeleteMessagesOptions,
  ) => void;
  streams: () => StreamWithLast[];
  dms: () => Extract<SidebarChat, { type: "dm" }>[];
}
