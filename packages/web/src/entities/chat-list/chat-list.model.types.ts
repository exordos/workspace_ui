// Типы Zustand-store для chat-list.
// Здесь описаны состояние и публичные actions, которые используют layout/widgets.
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type { ZulipGroupSettingValue, ZulipRawMessage } from "~/shared/api/zulip.types";
import type { ChatListSnapshotSerialized } from "~/shared/lib/chat-list-snapshot-serialize.lib";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export interface ChatListStreamMetadataRow {
  // Что делает: id канала из subscriptions/register metadata.
  streamId: number;
  // Что делает: текущее имя канала.
  name: string;
  // Что делает: признак архивированного канала.
  isArchived?: boolean;
  // Что делает: id создателя канала (если сервер вернул creator_id).
  creatorId?: number;
  // Что делает: признак приватности канала.
  inviteOnly?: boolean;
  // Что делает: channel-level группа, которой разрешено добавлять участников.
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  // Что делает: channel-level группа, которой разрешено удалять участников.
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  // Что делает: channel-level группа администраторов канала.
  canAdministerChannelGroup?: ZulipGroupSettingValue;
}

export interface ChatListDmMetadataRow {
  // Что делает: участники DM, по ним строится стабильный ключ диалога.
  userIds: number[];
  // Что делает: время активности, нужно для сортировки диалогов.
  lastActivityTs?: number;
  // Что делает: последний известный message id в диалоге.
  lastMessageId?: number | null;
  // Что делает: количество непрочитанных сообщений, если оно известно.
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
  /** Unread @mentions in lastAppliedMessages bootstrap snapshot. */
  mentionsUnreadCount: number;
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
  addMessage: (message: ZulipRawMessage) => void;
  addMessages: (messages: ZulipRawMessage[]) => void;
  /**
   * Adds `messageIdToLocation` entries for unread messages without touching previews/unread totals.
   * Needed so `update_message_flags(read)` can decrement totals for messages that were loaded in the open chat
   * but not previously indexed by sidebar bootstrap/lazy hydrate.
   */
  upsertUnreadMessageLocations: (messages: ZulipRawMessage[]) => void;
  /** Stream/topic preview only — does not bump unread (metadata-first stream batch). */
  applyStreamSidebarPreviewsFromMessages: (messages: ZulipRawMessage[]) => void;
  /** Ensures topic shells exist for a stream (used when expanding channel in sidebar). */
  upsertStreamTopicShells: (streamId: number, topics: string[]) => void;
  // Что делает: добавляет каналы в список из metadata, даже если сообщений по ним нет в памяти.
  upsertStreamMetadataRows: (rows: ChatListStreamMetadataRow[]) => void;
  /** Marks stream metadata readiness from authoritative subscriptions sources. */
  setStreamMetadataHydrated: (value: boolean) => void;
  /** Optimistically toggles archived state for a stream; `undefined` clears local override. */
  setStreamArchived: (streamId: number, isArchived: boolean | undefined) => void;
  // Что делает: добавляет/обновляет DM-строки из metadata и локального DM-индекса.
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
