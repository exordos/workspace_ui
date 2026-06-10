/** Types for the chat-list Zustand store — state and public actions consumed by layout/widgets. */
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type {
  MockMessage,
  ZulipGroupSettingValue,
  ZulipRawMessage,
} from "~/shared/api/zulip.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export interface ChatListStreamMetadataRow {
  streamId: number;
  name: string;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  canResolveTopicsGroup?: ZulipGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: ZulipGroupSettingValue;
}

export interface ChatListDmMetadataRow {
  userIds: number[];
  lastActivityTs?: number;
  lastMessageId?: number | null;
  unreadCount?: number;
}

export type MessageLocation =
  | { type: "stream"; stream_id: number; topic: string }
  | { type: "dm"; dmKey: string };

export interface ChatListPreviewSourceMessage {
  id: number;
  stream_id?: number | null;
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
  streamsMap: Map<number, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  /**
   * True once the sidebar can rely on local chat sources: first setFromMessages/addMessages,
   * metadata upserts that changed maps, or IDB hydrate with non-empty maps. False after clear.
   */
  sidebarDataHydrated: boolean;
  /** True after authoritative subscriptions metadata is applied (bootstrap/register). */
  streamMetadataHydrated: boolean;
  currentUserId: number | null;
  lastAppliedMessages: ZulipRawMessage[] | null;
  messageIdToLocation: Map<number, MessageLocation>;
  /** Inverted index streamId+topic → message ids; patched incrementally on location changes. */
  streamTopicMessageIds: Map<string, number[]>;
  /** Sum of stream topic unread counts; updated incrementally or on full rebuild. */
  sidebarStreamsUnread: number;
  /** Sum of DM unread counts; updated incrementally or on full rebuild. */
  sidebarDmsUnread: number;
  /** Unread @mentions tracked for sidebar badge and personal indicator. */
  mentionsUnreadCount: number;
  /** Message ids counted in `mentionsUnreadCount` (in-memory; rebuilt from API/register). */
  mentionedUnreadMessageIds: Set<number>;
  /** True when `mentionsUnreadCount` hit page cap (more unread mentions may exist server-side). */
  mentionsUnreadCapped: boolean;
  /** After authoritative GET is:mentioned+is:unread sync, register mention ids are not applied. */
  mentionsUnreadApiSynced: boolean;
  /** Last sidebar bootstrap failure message, cleared on successful rebuild. */
  bootstrapError: string | null;
  setBootstrapError: (error: string | null) => void;
  clearBootstrapError: () => void;
  setFromMessages: (messages: ZulipRawMessage[], currentUserId: number | null) => void;
  /** Restore sidebar maps from IndexedDB snapshot (no raw `lastAppliedMessages`). */
  hydrateFromIndexedDbSnapshot: (snapshot: ChatListSnapshotSerialized) => void;
  /** Authoritative unread reconcile from server snapshot (e.g. `is:unread`). */
  reconcileUnreadFromMessages: (
    messages: readonly ZulipRawMessage[],
    currentUserId: number | null,
  ) => void;
  /** Authoritative unread reconcile from register `unread_msgs` buckets. */
  reconcileUnreadFromSnapshot: (
    snapshot: ZulipUnreadMessagesSnapshot,
    currentUserId: number | null,
  ) => void;
  /** Authoritative replace of unread mention ids/count from GET is:mentioned+is:unread. */
  reconcileMentionsFromServer: (
    messages: readonly MockMessage[],
    options?: { capped?: boolean },
  ) => void;
  /** Register fallback for mention ids until first API sync. */
  reconcileMentionsFromRegisterIds: (messageIds: readonly number[]) => void;
  decrementMentionsForReadMessages: (messageIds: readonly number[]) => void;
  addMessage: (message: ZulipRawMessage, options?: { suppressUnreadBump?: boolean }) => void;
  addMessages: (messages: ZulipRawMessage[]) => void;
  /**
   * Adds `messageIdToLocation` entries for unread messages without touching previews/unread totals.
   * Needed so `update_message_flags(read)` can decrement totals for messages that were loaded in the open chat
   * but not previously indexed by sidebar bootstrap/lazy hydrate.
   */
  upsertUnreadMessageLocations: (messages: ZulipRawMessage[]) => void;
  /** Indexes mention message locations from API sync (stream/topic/DM rows for sidebar @ badge). */
  upsertMentionMessageLocations: (messages: readonly MockMessage[]) => void;
  /** Stream/topic preview only — does not bump unread (metadata-first stream batch). */
  applyStreamSidebarPreviewsFromMessages: (messages: ZulipRawMessage[]) => void;
  /** Ensures topic shells exist for a stream (used when expanding channel in sidebar). */
  upsertStreamTopicShells: (streamId: number, topics: string[]) => void;
  /** Adds channels from subscriptions metadata even when no messages for them are in memory. */
  upsertStreamMetadataRows: (rows: ChatListStreamMetadataRow[]) => void;
  /** Marks stream metadata readiness from authoritative subscriptions sources. */
  setStreamMetadataHydrated: (value: boolean) => void;
  /** Optimistically toggles archived state for a stream; `undefined` clears local override. */
  setStreamArchived: (streamId: number, isArchived: boolean | undefined) => void;
  /** Upserts DM rows from metadata and the local DM index (not only from loaded messages). */
  upsertDmMetadataRows: (rows: ChatListDmMetadataRow[]) => void;
  setCurrentUserId: (id: number | null) => void;
  renameStream: (streamId: number, nextName: string) => void;
  moveStreamTopic: (params: {
    streamId: number;
    oldTopic: string;
    newTopic: string;
    messageIds?: number[];
    anchorMessageId?: number;
  }) => void;
  moveTopicToStream: (params: {
    sourceStreamId: number;
    targetStreamId: number;
    oldTopic: string;
    newTopic: string;
    messageIds?: number[];
    anchorMessageId?: number;
  }) => void;
  removeStreamTopic: (streamId: number, topic: string) => void;
  removeStream: (streamId: number) => void;
  /** After a user profile is fetched, refresh personal DM row titles that still use placeholders. */
  patchPersonalDmRowLabelsForUser: (userId: number) => void;
  /** Recomputes sidebar unread totals, mentions count, and stream-topic index from current maps. */
  syncDerivedScalars: () => void;
  clear: () => void;
  decrementUnreadForMessages: (messageIds: number[]) => void;
  decrementUnreadForTopic: (streamId: number, topic: string, count: number) => void;
  decrementUnreadForDmKey: (dmKey: string, count: number) => void;
  incrementUnreadForMessages: (messageIds: number[]) => void;
  handleDeleteMessages: (
    messageIds: number[],
    options?: ChatListHandleDeleteMessagesOptions,
  ) => void;
  streams: () => StreamWithLast[];
  dms: () => Extract<SidebarChat, { type: "dm" }>[];
}
