import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import type {
  MessengerBootstrapPayload,
  MessengerConversation,
  MessengerConversationId,
  MessengerDeletedFolder,
  MessengerDeletedFolderItem,
  MessengerDeletedMessage,
  MessengerDeletedStream,
  MessengerDeletedTopic,
  MessengerFolder,
  MessengerFolderItem,
  MessengerMessage,
  MessengerSkippedRealtimeEvent,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

const EMPTY_STREAMS_BY_ID: Record<MessengerUuid, MessengerStream> = {};
const EMPTY_STREAM_BINDINGS_BY_ID: Record<MessengerUuid, MessengerStreamBinding> = {};
const EMPTY_STREAM_BINDING_IDS_BY_STREAM_ID: Record<MessengerUuid, MessengerUuid[]> = {};
const EMPTY_TOPICS_BY_ID: Record<MessengerUuid, MessengerTopic> = {};
const EMPTY_CONVERSATIONS_BY_ID: Record<MessengerConversationId, MessengerConversation> = {};
const EMPTY_FOLDERS_BY_ID: Record<MessengerUuid, MessengerFolder> = {};
const EMPTY_IDS: string[] = [];
const EMPTY_CONVERSATIONS: MessengerConversation[] = [];
const EMPTY_FOLDERS: MessengerFolder[] = [];
const EMPTY_SKIPPED_REALTIME_EVENTS: MessengerSkippedRealtimeEvent[] = [];
type MessengerFreshnessState = Pick<
  MessengerDomainData,
  "streamsById" | "topicsById" | "conversationsById"
>;

// Store keeps Workspace data separate from old Zulip stores.
// This matters for migration: the new backend must not adapt to the old source of truth.
// This store is scoped by ownerKey so several accounts/projects can coexist safely.
export interface MessengerDomainData {
  streamsById: Record<MessengerUuid, MessengerStream>;
  streamIds: MessengerUuid[];
  streamBindingsById: Record<MessengerUuid, MessengerStreamBinding>;
  streamBindingIds: MessengerUuid[];
  streamBindingIdsByStreamId: Record<MessengerUuid, MessengerUuid[]>;
  streamBindingsLoadedByStreamId: Record<MessengerUuid, true>;
  topicsById: Record<MessengerUuid, MessengerTopic>;
  topicIds: MessengerUuid[];
  conversationsById: Record<MessengerConversationId, MessengerConversation>;
  conversationIds: MessengerConversationId[];
  foldersById: Record<MessengerUuid, MessengerFolder>;
  folderIds: MessengerUuid[];
  lastEpochVersion: number | null;
  skippedRealtimeEvents: MessengerSkippedRealtimeEvent[];
}

export interface MessengerStoreState extends MessengerDomainData {
  ownerKey: string | null;
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: number | null;

  startBootstrap: (ownerKey: string) => void;
  finishBootstrapSilently: (ownerKey: string) => void;
  replaceBootstrapState: (ownerKey: string, payload: MessengerBootstrapPayload) => void;
  replaceFolderSnapshots: (ownerKey: string, folders: MessengerFolder[]) => void;
  upsertStream: (ownerKey: string, stream: MessengerStream) => void;
  removeStream: (ownerKey: string, stream: MessengerDeletedStream) => void;
  upsertStreamBindings: (ownerKey: string, bindings: MessengerStreamBinding[]) => void;
  replaceStreamBindingsForStream: (
    ownerKey: string,
    streamUuid: MessengerUuid,
    bindings: MessengerStreamBinding[],
  ) => void;
  markStreamBindingsLoaded: (ownerKey: string, streamUuid: MessengerUuid) => void;
  removeStreamBinding: (
    ownerKey: string,
    binding: Pick<MessengerStreamBinding, "uuid" | "streamUuid">,
  ) => void;
  upsertTopic: (ownerKey: string, topic: MessengerTopic) => void;
  removeTopic: (ownerKey: string, topic: MessengerDeletedTopic) => void;
  applyMessagePointer: (ownerKey: string, message: MessengerMessage) => void;
  clearMessagePointer: (ownerKey: string, message: MessengerDeletedMessage) => void;
  applyFolderSnapshot: (ownerKey: string, folder: MessengerFolder) => void;
  removeFolder: (ownerKey: string, folder: MessengerDeletedFolder) => void;
  upsertFolderItem: (ownerKey: string, folderItem: MessengerFolderItem) => void;
  removeFolderItem: (
    ownerKey: string,
    folderItem: MessengerDeletedFolderItem,
    options?: MessengerFolderItemRemovalOptions,
  ) => void;
  setRealtimeCursor: (ownerKey: string, epochVersion: number) => void;
  markRealtimeEventSkipped: (ownerKey: string, epochVersion: number, reason: string) => void;
  setBootstrapError: (ownerKey: string, error: string) => void;
  clear: () => void;
}

export interface MessengerFolderItemRemovalOptions {
  preserveFolderUnreadCount?: boolean;
}

function createEmptyMessengerData(): MessengerDomainData {
  return {
    streamsById: EMPTY_STREAMS_BY_ID,
    streamIds: EMPTY_IDS,
    streamBindingsById: EMPTY_STREAM_BINDINGS_BY_ID,
    streamBindingIds: EMPTY_IDS,
    streamBindingIdsByStreamId: EMPTY_STREAM_BINDING_IDS_BY_STREAM_ID,
    streamBindingsLoadedByStreamId: {},
    topicsById: EMPTY_TOPICS_BY_ID,
    topicIds: EMPTY_IDS,
    conversationsById: EMPTY_CONVERSATIONS_BY_ID,
    conversationIds: EMPTY_IDS,
    foldersById: EMPTY_FOLDERS_BY_ID,
    folderIds: EMPTY_IDS,
    lastEpochVersion: null,
    skippedRealtimeEvents: EMPTY_SKIPPED_REALTIME_EVENTS,
  };
}

function createInitialState(): Omit<
  MessengerStoreState,
  | "startBootstrap"
  | "finishBootstrapSilently"
  | "replaceBootstrapState"
  | "replaceFolderSnapshots"
  | "upsertStream"
  | "removeStream"
  | "upsertStreamBindings"
  | "replaceStreamBindingsForStream"
  | "markStreamBindingsLoaded"
  | "removeStreamBinding"
  | "upsertTopic"
  | "removeTopic"
  | "applyMessagePointer"
  | "clearMessagePointer"
  | "applyFolderSnapshot"
  | "removeFolder"
  | "upsertFolderItem"
  | "removeFolderItem"
  | "setRealtimeCursor"
  | "markRealtimeEventSkipped"
  | "setBootstrapError"
  | "clear"
> {
  return {
    ownerKey: null,
    isLoading: false,
    error: null,
    lastLoadedAt: null,
    ...createEmptyMessengerData(),
  };
}

function appendUniqueId<TId extends string>(ids: TId[], id: TId): TId[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function removeId<TId extends string>(ids: TId[], id: TId): TId[] {
  return ids.filter((item) => item !== id);
}

function compareIsoDateStrings(a: string | null | undefined, b: string | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a.localeCompare(b);
}

function isMessageFreshForContainer(
  message: MessengerMessage,
  currentLastMessageUuid: MessengerUuid | null | undefined,
  containerUpdatedAt?: string,
): boolean {
  if (currentLastMessageUuid == null) return true;
  if (currentLastMessageUuid === message.uuid) return true;
  return (
    containerUpdatedAt == null || compareIsoDateStrings(message.createdAt, containerUpdatedAt) >= 0
  );
}

function applyMessageFreshness(
  state: MessengerFreshnessState,
  message: MessengerMessage,
): MessengerFreshnessState {
  let nextStreamsById = state.streamsById;
  let nextTopicsById = state.topicsById;
  let nextConversationsById = state.conversationsById;

  const stream = state.streamsById[message.streamUuid];
  if (
    stream != null &&
    isMessageFreshForContainer(message, stream.lastMessageUuid, stream.updatedAt)
  ) {
    nextStreamsById = {
      ...nextStreamsById,
      [stream.uuid]: {
        ...stream,
        lastMessageUuid: message.uuid,
        updatedAt:
          compareIsoDateStrings(message.createdAt, stream.updatedAt) > 0
            ? message.createdAt
            : stream.updatedAt,
      },
    };
  }

  const topic = state.topicsById[message.topicUuid];
  if (
    topic != null &&
    isMessageFreshForContainer(message, topic.lastMessageUuid, topic.updatedAt)
  ) {
    nextTopicsById = {
      ...nextTopicsById,
      [topic.uuid]: {
        ...topic,
        lastMessageUuid: message.uuid,
        updatedAt:
          compareIsoDateStrings(message.createdAt, topic.updatedAt) > 0
            ? message.createdAt
            : topic.updatedAt,
      },
    };
  }

  const streamConversationId = conversationIdForStream(message.streamUuid);
  const streamConversation = state.conversationsById[streamConversationId];
  if (
    streamConversation != null &&
    isMessageFreshForContainer(message, streamConversation.lastMessageUuid)
  ) {
    nextConversationsById = {
      ...nextConversationsById,
      [streamConversationId]: {
        ...streamConversation,
        lastMessageUuid: message.uuid,
      },
    };
  }

  const topicConversation = state.conversationsById[message.conversationId];
  if (
    topicConversation != null &&
    isMessageFreshForContainer(message, topicConversation.lastMessageUuid)
  ) {
    nextConversationsById = {
      ...nextConversationsById,
      [message.conversationId]: {
        ...topicConversation,
        lastMessageUuid: message.uuid,
      },
    };
  }

  return {
    streamsById: nextStreamsById,
    topicsById: nextTopicsById,
    conversationsById: nextConversationsById,
  };
}

function clearDeletedMessageFreshness(
  state: Pick<MessengerDomainData, "streamsById" | "topicsById" | "conversationsById">,
  message: MessengerDeletedMessage,
): Pick<MessengerDomainData, "streamsById" | "topicsById" | "conversationsById"> {
  let nextStreamsById = state.streamsById;
  let nextTopicsById = state.topicsById;
  let nextConversationsById = state.conversationsById;

  const stream = state.streamsById[message.streamUuid];
  if (stream?.lastMessageUuid === message.uuid) {
    nextStreamsById = {
      ...nextStreamsById,
      [stream.uuid]: {
        ...stream,
        lastMessageUuid: null,
      },
    };
  }

  const topic = state.topicsById[message.topicUuid];
  if (topic?.lastMessageUuid === message.uuid) {
    nextTopicsById = {
      ...nextTopicsById,
      [topic.uuid]: {
        ...topic,
        lastMessageUuid: null,
      },
    };
  }

  const streamConversationId = conversationIdForStream(message.streamUuid);
  const streamConversation = state.conversationsById[streamConversationId];
  if (streamConversation?.lastMessageUuid === message.uuid) {
    nextConversationsById = {
      ...nextConversationsById,
      [streamConversationId]: {
        ...streamConversation,
        lastMessageUuid: null,
      },
    };
  }

  const topicConversationId = conversationIdForTopic(message.streamUuid, message.topicUuid);
  const topicConversation = state.conversationsById[topicConversationId];
  if (topicConversation?.lastMessageUuid === message.uuid) {
    nextConversationsById = {
      ...nextConversationsById,
      [topicConversationId]: {
        ...topicConversation,
        lastMessageUuid: null,
      },
    };
  }

  return {
    streamsById: nextStreamsById,
    topicsById: nextTopicsById,
    conversationsById: nextConversationsById,
  };
}

function rebuildFolderWithItems(
  folder: MessengerFolder,
  items: MessengerFolderItem[],
  options?: { preserveUnreadCount?: boolean },
): MessengerFolder {
  return {
    ...folder,
    items,
    // For realtime folder_item.deleted, the backend does not send a new folder counter.
    // Keep the Folder DTO as source of truth until the next folder.updated snapshot.
    unreadCount:
      options?.preserveUnreadCount === true
        ? folder.unreadCount
        : items.reduce((total, item) => total + item.unreadCount, 0),
  };
}

function conversationFromStream(stream: MessengerStream): MessengerConversation {
  return {
    id: conversationIdForStream(stream.uuid),
    streamUuid: stream.uuid,
    title: stream.name,
    audience: stream.audience,
    isPrivate: stream.isPrivate,
    unreadCount: stream.unreadCount,
    isArchived: stream.isArchived,
    directUserUuid: stream.directUserUuid,
    lastMessageUuid: stream.lastMessageUuid,
    notificationMode: stream.notificationMode,
  };
}

// Topic conversations inherit stream-level audience and archive context.
function conversationFromTopic(
  topic: MessengerTopic,
  stream: MessengerStream,
): MessengerConversation {
  return {
    id: conversationIdForTopic(stream.uuid, topic.uuid),
    streamUuid: stream.uuid,
    topicUuid: topic.uuid,
    title: topic.name,
    audience: stream.audience,
    isPrivate: stream.isPrivate,
    unreadCount: topic.unreadCount,
    isArchived: stream.isArchived,
    directUserUuid: stream.directUserUuid,
    lastMessageUuid: topic.lastMessageUuid,
    notificationMode: topic.notificationMode,
    isDone: topic.isDone,
    isDefaultTopic: topic.isDefault,
  };
}

function upsertConversation(
  state: Pick<MessengerDomainData, "conversationsById" | "conversationIds">,
  conversation: MessengerConversation,
): Pick<MessengerDomainData, "conversationsById" | "conversationIds"> {
  return {
    conversationsById: {
      ...state.conversationsById,
      [conversation.id]: conversation,
    },
    conversationIds: appendUniqueId(state.conversationIds, conversation.id),
  };
}

type MessengerStreamBindingsUpsertState = Pick<
  MessengerDomainData,
  | "streamBindingsById"
  | "streamBindingIds"
  | "streamBindingIdsByStreamId"
  | "streamsById"
  | "topicIds"
  | "topicsById"
  | "conversationsById"
  | "conversationIds"
>;

function applyStreamBindingUpserts(
  state: MessengerStreamBindingsUpsertState,
  bindings: MessengerStreamBinding[],
): Pick<
  MessengerDomainData,
  | "streamBindingsById"
  | "streamBindingIds"
  | "streamBindingIdsByStreamId"
  | "conversationsById"
  | "conversationIds"
> {
  const nextStreamBindingsById = { ...state.streamBindingsById };
  let nextStreamBindingIds = state.streamBindingIds;
  const nextStreamBindingIdsByStreamId = { ...state.streamBindingIdsByStreamId };
  let nextConversationsById = state.conversationsById;
  let nextConversationIds = state.conversationIds;

  for (const binding of bindings) {
    const previous = nextStreamBindingsById[binding.uuid];
    if (previous != null && previous.streamUuid !== binding.streamUuid) {
      nextStreamBindingIdsByStreamId[previous.streamUuid] = removeId(
        nextStreamBindingIdsByStreamId[previous.streamUuid] ?? EMPTY_IDS,
        binding.uuid,
      );
    }

    nextStreamBindingsById[binding.uuid] = binding;
    nextStreamBindingIds = appendUniqueId(nextStreamBindingIds, binding.uuid);
    nextStreamBindingIdsByStreamId[binding.streamUuid] = appendUniqueId(
      nextStreamBindingIdsByStreamId[binding.streamUuid] ?? EMPTY_IDS,
      binding.uuid,
    );

    const stream = state.streamsById[binding.streamUuid];
    if (stream == null) continue;

    // stream_binding shows that the current user can see the stream.
    // The binding event must revive the chat surface even if the stream snapshot was already in store.
    let conversationState = upsertConversation(
      {
        conversationsById: nextConversationsById,
        conversationIds: nextConversationIds,
      },
      conversationFromStream(stream),
    );
    for (const topicId of state.topicIds) {
      const topic = state.topicsById[topicId];
      if (topic?.streamUuid !== stream.uuid) continue;
      conversationState = upsertConversation(
        conversationState,
        conversationFromTopic(topic, stream),
      );
    }
    nextConversationsById = conversationState.conversationsById;
    nextConversationIds = conversationState.conversationIds;
  }

  return {
    streamBindingsById: nextStreamBindingsById,
    streamBindingIds: nextStreamBindingIds,
    streamBindingIdsByStreamId: nextStreamBindingIdsByStreamId,
    conversationsById: nextConversationsById,
    conversationIds: nextConversationIds,
  };
}

// Bootstrap builds indexes once, then realtime actions update them incrementally.
function buildMessengerDomainData(payload: MessengerBootstrapPayload): MessengerDomainData {
  const streamsById: Record<MessengerUuid, MessengerStream> = {};
  const streamIds: MessengerUuid[] = [];
  const streamBindingsById: Record<MessengerUuid, MessengerStreamBinding> = {};
  const streamBindingIds: MessengerUuid[] = [];
  const streamBindingIdsByStreamId: Record<MessengerUuid, MessengerUuid[]> = {};
  const topicsById: Record<MessengerUuid, MessengerTopic> = {};
  const topicIds: MessengerUuid[] = [];
  const conversationsById: Record<MessengerConversationId, MessengerConversation> = {};
  const conversationIds: MessengerConversationId[] = [];
  const foldersById: Record<MessengerUuid, MessengerFolder> = {};
  const folderIds: MessengerUuid[] = [];

  for (const stream of payload.streams) {
    streamsById[stream.uuid] = stream;
    streamIds.push(stream.uuid);
  }

  for (const binding of payload.streamBindings) {
    streamBindingsById[binding.uuid] = binding;
    streamBindingIds.push(binding.uuid);
    streamBindingIdsByStreamId[binding.streamUuid] = appendUniqueId(
      streamBindingIdsByStreamId[binding.streamUuid] ?? EMPTY_IDS,
      binding.uuid,
    );
  }

  for (const topic of payload.topics) {
    topicsById[topic.uuid] = topic;
    topicIds.push(topic.uuid);
  }

  for (const conversation of payload.conversations) {
    conversationsById[conversation.id] = conversation;
    conversationIds.push(conversation.id);
  }

  for (const folder of payload.folders) {
    foldersById[folder.uuid] = folder;
    folderIds.push(folder.uuid);
  }

  return {
    streamsById,
    streamIds,
    streamBindingsById,
    streamBindingIds,
    streamBindingIdsByStreamId,
    streamBindingsLoadedByStreamId: {},
    topicsById,
    topicIds,
    conversationsById,
    conversationIds,
    foldersById,
    folderIds,
    lastEpochVersion: null,
    skippedRealtimeEvents: EMPTY_SKIPPED_REALTIME_EVENTS,
  };
}

export const useMessengerStore = create<MessengerStoreState>((set) => ({
  ...createInitialState(),

  startBootstrap(ownerKey) {
    logStoreAction("messenger", "startBootstrap", { ownerKey });
    set((state) => {
      if (state.ownerKey === ownerKey) {
        return {
          isLoading: true,
          error: null,
        };
      }

      return {
        ...createEmptyMessengerData(),
        ownerKey,
        isLoading: true,
        error: null,
        lastLoadedAt: null,
      };
    });
  },

  finishBootstrapSilently(ownerKey) {
    logStoreAction("messenger", "finishBootstrapSilently", { ownerKey });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return {
        isLoading: false,
        error: null,
      };
    });
  },

  replaceBootstrapState(ownerKey, payload) {
    logStoreAction("messenger", "replaceBootstrapState", {
      ownerKey,
      streams: payload.streams.length,
      streamBindings: payload.streamBindings.length,
      topics: payload.topics.length,
      conversations: payload.conversations.length,
      folders: payload.folders.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      const nextDomainData = buildMessengerDomainData(payload);
      const streamBindingsState =
        payload.streamBindings.length > 0
          ? {
              streamBindingsById: nextDomainData.streamBindingsById,
              streamBindingIds: nextDomainData.streamBindingIds,
              streamBindingIdsByStreamId: nextDomainData.streamBindingIdsByStreamId,
              streamBindingsLoadedByStreamId: {},
            }
          : {
              streamBindingsById: state.streamBindingsById,
              streamBindingIds: state.streamBindingIds,
              streamBindingIdsByStreamId: state.streamBindingIdsByStreamId,
              streamBindingsLoadedByStreamId: state.streamBindingsLoadedByStreamId,
            };

      return {
        ...nextDomainData,
        ...streamBindingsState,
        ownerKey,
        isLoading: false,
        error: null,
        lastLoadedAt: Date.now(),
      };
    });
  },

  replaceFolderSnapshots(ownerKey, folders) {
    logStoreAction("messenger", "replaceFolderSnapshots", {
      ownerKey,
      folders: folders.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const foldersById: Record<MessengerUuid, MessengerFolder> = {};
      const folderIds: MessengerUuid[] = [];
      for (const folder of folders) {
        foldersById[folder.uuid] = folder;
        folderIds.push(folder.uuid);
      }

      return {
        foldersById,
        folderIds,
      };
    });
  },

  upsertStream(ownerKey, stream) {
    logStoreAction("messenger", "upsertStream", { ownerKey, streamUuid: stream.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      let conversationState = upsertConversation(state, conversationFromStream(stream));
      for (const topicId of state.topicIds) {
        const topic = state.topicsById[topicId];
        if (topic?.streamUuid !== stream.uuid) continue;
        conversationState = upsertConversation(
          conversationState,
          conversationFromTopic(topic, stream),
        );
      }

      return {
        streamsById: {
          ...state.streamsById,
          [stream.uuid]: stream,
        },
        streamIds: appendUniqueId(state.streamIds, stream.uuid),
        ...conversationState,
      };
    });
  },

  removeStream(ownerKey, stream) {
    logStoreAction("messenger", "removeStream", { ownerKey, streamUuid: stream.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextStreamsById = { ...state.streamsById };
      delete nextStreamsById[stream.uuid];

      const removedTopicIds = state.topicIds.filter(
        (topicId) => state.topicsById[topicId]?.streamUuid === stream.uuid,
      );
      const nextTopicsById = { ...state.topicsById };
      for (const topicId of removedTopicIds) {
        delete nextTopicsById[topicId];
      }

      const removedConversationIds = [
        conversationIdForStream(stream.uuid),
        ...removedTopicIds.map((topicId) => conversationIdForTopic(stream.uuid, topicId)),
      ];
      const nextConversationsById = { ...state.conversationsById };
      for (const conversationId of removedConversationIds) {
        delete nextConversationsById[conversationId];
      }

      const removedBindingIds = state.streamBindingIdsByStreamId[stream.uuid] ?? EMPTY_IDS;
      const nextStreamBindingsById = { ...state.streamBindingsById };
      for (const bindingId of removedBindingIds) {
        delete nextStreamBindingsById[bindingId];
      }
      const nextStreamBindingIdsByStreamId = { ...state.streamBindingIdsByStreamId };
      delete nextStreamBindingIdsByStreamId[stream.uuid];
      const nextStreamBindingsLoadedByStreamId = { ...state.streamBindingsLoadedByStreamId };
      delete nextStreamBindingsLoadedByStreamId[stream.uuid];
      return {
        streamsById: nextStreamsById,
        streamIds: removeId(state.streamIds, stream.uuid),
        topicsById: nextTopicsById,
        topicIds: state.topicIds.filter((topicId) => !removedTopicIds.includes(topicId)),
        conversationsById: nextConversationsById,
        conversationIds: state.conversationIds.filter(
          (conversationId) => !removedConversationIds.includes(conversationId),
        ),
        streamBindingsById: nextStreamBindingsById,
        streamBindingIds: state.streamBindingIds.filter(
          (bindingId) => !removedBindingIds.includes(bindingId),
        ),
        streamBindingIdsByStreamId: nextStreamBindingIdsByStreamId,
        streamBindingsLoadedByStreamId: nextStreamBindingsLoadedByStreamId,
      };
    });
  },

  upsertStreamBindings(ownerKey, bindings) {
    logStoreAction("messenger", "upsertStreamBindings", { ownerKey, bindings: bindings.length });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return applyStreamBindingUpserts(state, bindings);
    });
  },

  replaceStreamBindingsForStream(ownerKey, streamUuid, bindings) {
    logStoreAction("messenger", "replaceStreamBindingsForStream", {
      ownerKey,
      streamUuid,
      bindings: bindings.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      // Realtime-события добавляют bindings через upsert, а backend full load
      // приходит как снимок stream-а. Здесь удаляем только устаревшие bindings
      // этого streamUuid и не трогаем участников других каналов.
      const snapshotBindingIds = new Set(bindings.map((binding) => binding.uuid));
      const previousBindingIds = state.streamBindingIdsByStreamId[streamUuid] ?? EMPTY_IDS;
      const removedBindingIds = previousBindingIds.filter(
        (bindingId) => !snapshotBindingIds.has(bindingId),
      );
      const nextStreamBindingsById = { ...state.streamBindingsById };
      for (const bindingId of removedBindingIds) {
        delete nextStreamBindingsById[bindingId];
      }

      const nextState = applyStreamBindingUpserts(
        {
          ...state,
          streamBindingsById: nextStreamBindingsById,
          streamBindingIds: state.streamBindingIds.filter(
            (bindingId) => !removedBindingIds.includes(bindingId),
          ),
          streamBindingIdsByStreamId: {
            ...state.streamBindingIdsByStreamId,
            [streamUuid]: previousBindingIds.filter((bindingId) =>
              snapshotBindingIds.has(bindingId),
            ),
          },
        },
        bindings,
      );

      return {
        ...nextState,
        streamBindingsLoadedByStreamId: {
          ...state.streamBindingsLoadedByStreamId,
          [streamUuid]: true,
        },
      };
    });
  },

  markStreamBindingsLoaded(ownerKey, streamUuid) {
    logStoreAction("messenger", "markStreamBindingsLoaded", { ownerKey, streamUuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (state.streamBindingsLoadedByStreamId[streamUuid] === true) return state;

      return {
        streamBindingsLoadedByStreamId: {
          ...state.streamBindingsLoadedByStreamId,
          [streamUuid]: true,
        },
      };
    });
  },

  removeStreamBinding(ownerKey, binding) {
    logStoreAction("messenger", "removeStreamBinding", {
      ownerKey,
      bindingUuid: binding.uuid,
      streamUuid: binding.streamUuid,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      // После DELETE backend не рассылает всем участникам отдельное
      // stream_bindings.deleted событие, поэтому инициатор чистит свой локальный
      // список сразу после успешного ответа API.
      const previous = state.streamBindingsById[binding.uuid];
      const streamUuid = previous?.streamUuid ?? binding.streamUuid;
      const streamBindingIds = state.streamBindingIdsByStreamId[streamUuid] ?? EMPTY_IDS;
      if (previous == null && !streamBindingIds.includes(binding.uuid)) return state;

      const nextStreamBindingsById = { ...state.streamBindingsById };
      delete nextStreamBindingsById[binding.uuid];

      return {
        streamBindingsById: nextStreamBindingsById,
        streamBindingIds: removeId(state.streamBindingIds, binding.uuid),
        streamBindingIdsByStreamId: {
          ...state.streamBindingIdsByStreamId,
          [streamUuid]: removeId(streamBindingIds, binding.uuid),
        },
      };
    });
  },

  upsertTopic(ownerKey, topic) {
    logStoreAction("messenger", "upsertTopic", { ownerKey, topicUuid: topic.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const previous = state.topicsById[topic.uuid];
      let nextConversationsById = state.conversationsById;
      let nextConversationIds = state.conversationIds;

      if (previous != null && previous.streamUuid !== topic.streamUuid) {
        const previousConversationId = conversationIdForTopic(previous.streamUuid, topic.uuid);
        nextConversationsById = { ...nextConversationsById };
        delete nextConversationsById[previousConversationId];
        nextConversationIds = removeId(nextConversationIds, previousConversationId);
      }

      const stream = state.streamsById[topic.streamUuid];
      if (stream != null) {
        const conversationState = upsertConversation(
          {
            conversationsById: nextConversationsById,
            conversationIds: nextConversationIds,
          },
          conversationFromTopic(topic, stream),
        );
        nextConversationsById = conversationState.conversationsById;
        nextConversationIds = conversationState.conversationIds;
      }

      return {
        topicsById: {
          ...state.topicsById,
          [topic.uuid]: topic,
        },
        topicIds: appendUniqueId(state.topicIds, topic.uuid),
        conversationsById: nextConversationsById,
        conversationIds: nextConversationIds,
      };
    });
  },

  removeTopic(ownerKey, topic) {
    logStoreAction("messenger", "removeTopic", { ownerKey, topicUuid: topic.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextTopicsById = { ...state.topicsById };
      delete nextTopicsById[topic.uuid];
      const conversationId = conversationIdForTopic(topic.streamUuid, topic.uuid);
      const nextConversationsById = { ...state.conversationsById };
      delete nextConversationsById[conversationId];
      return {
        topicsById: nextTopicsById,
        topicIds: removeId(state.topicIds, topic.uuid),
        conversationsById: nextConversationsById,
        conversationIds: removeId(state.conversationIds, conversationId),
      };
    });
  },

  applyMessagePointer(ownerKey, message) {
    logStoreAction("messenger", "applyMessagePointer", { ownerKey, messageUuid: message.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      return applyMessageFreshness(state, message);
    });
  },

  clearMessagePointer(ownerKey, message) {
    logStoreAction("messenger", "clearMessagePointer", { ownerKey, messageUuid: message.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      return clearDeletedMessageFreshness(state, message);
    });
  },

  applyFolderSnapshot(ownerKey, folder) {
    logStoreAction("messenger", "applyFolderSnapshot", { ownerKey, folderUuid: folder.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return {
        foldersById: {
          ...state.foldersById,
          [folder.uuid]: folder,
        },
        folderIds: appendUniqueId(state.folderIds, folder.uuid),
      };
    });
  },

  removeFolder(ownerKey, folder) {
    logStoreAction("messenger", "removeFolder", { ownerKey, folderUuid: folder.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextFoldersById = { ...state.foldersById };
      delete nextFoldersById[folder.uuid];

      return {
        foldersById: nextFoldersById,
        folderIds: removeId(state.folderIds, folder.uuid),
      };
    });
  },

  upsertFolderItem(ownerKey, folderItem) {
    logStoreAction("messenger", "upsertFolderItem", {
      ownerKey,
      folderItemUuid: folderItem.uuid,
      folderUuid: folderItem.folderUuid,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (state.foldersById[folderItem.folderUuid] == null) return state;

      const nextFoldersById = { ...state.foldersById };
      let didChange = false;

      for (const folderId of state.folderIds) {
        const folder = state.foldersById[folderId];
        if (folder == null) continue;

        if (folder.uuid === folderItem.folderUuid) {
          const existingIndex = folder.items.findIndex((item) => item.uuid === folderItem.uuid);
          const nextItems =
            existingIndex === -1
              ? [...folder.items, folderItem]
              : folder.items.map((item) => (item.uuid === folderItem.uuid ? folderItem : item));

          nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems);
          didChange = true;
          continue;
        }

        const nextItems = folder.items.filter((item) => item.uuid !== folderItem.uuid);
        if (nextItems.length === folder.items.length) continue;

        nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems);
        didChange = true;
      }

      return didChange ? { foldersById: nextFoldersById } : state;
    });
  },

  removeFolderItem(ownerKey, folderItem, options) {
    logStoreAction("messenger", "removeFolderItem", {
      ownerKey,
      folderItemUuid: folderItem.uuid,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextFoldersById = { ...state.foldersById };
      let didChange = false;
      for (const folderId of state.folderIds) {
        const folder = state.foldersById[folderId];
        if (folder == null) continue;

        const nextItems = folder.items.filter((item) => item.uuid !== folderItem.uuid);
        if (nextItems.length === folder.items.length) continue;

        nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems, {
          preserveUnreadCount: options?.preserveFolderUnreadCount,
        });
        didChange = true;
      }

      return didChange ? { foldersById: nextFoldersById } : state;
    });
  },

  setRealtimeCursor(ownerKey, epochVersion) {
    logStoreAction("messenger", "setRealtimeCursor", { ownerKey, epochVersion });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      if (state.lastEpochVersion != null && state.lastEpochVersion >= epochVersion) return state;

      return {
        lastEpochVersion: epochVersion,
      };
    });
  },

  markRealtimeEventSkipped(ownerKey, epochVersion, reason) {
    logStoreAction("messenger", "markRealtimeEventSkipped", { ownerKey, epochVersion, reason });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const lastEpochVersion =
        state.lastEpochVersion == null
          ? epochVersion
          : Math.max(state.lastEpochVersion, epochVersion);

      return {
        lastEpochVersion,
        skippedRealtimeEvents: [
          ...state.skippedRealtimeEvents,
          {
            epochVersion,
            reason,
          },
        ],
      };
    });
  },

  setBootstrapError(ownerKey, error) {
    logStoreAction("messenger", "setBootstrapError", { ownerKey, error });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return {
        isLoading: false,
        error,
      };
    });
  },

  clear() {
    logStoreAction("messenger", "clear", {});
    set(createInitialState());
  },
}));

let sidebarConversationCacheIds = EMPTY_IDS;
let sidebarConversationCacheMap = EMPTY_CONVERSATIONS_BY_ID;
let sidebarConversationCacheResult = EMPTY_CONVERSATIONS;
let foldersCacheIds = EMPTY_IDS;
let foldersCacheMap = EMPTY_FOLDERS_BY_ID;
let foldersCacheResult = EMPTY_FOLDERS;

export function selectMessengerSidebarConversations(
  state: MessengerStoreState,
): MessengerConversation[] {
  if (state.conversationIds.length === 0) return EMPTY_CONVERSATIONS;
  if (
    state.conversationIds === sidebarConversationCacheIds &&
    state.conversationsById === sidebarConversationCacheMap
  ) {
    return sidebarConversationCacheResult;
  }

  const conversations = state.conversationIds
    .map((conversationId) => state.conversationsById[conversationId])
    .filter((conversation): conversation is MessengerConversation => conversation != null);

  sidebarConversationCacheIds = state.conversationIds;
  sidebarConversationCacheMap = state.conversationsById;
  sidebarConversationCacheResult = conversations;
  return conversations;
}

export function selectMessengerFolders(state: MessengerStoreState): MessengerFolder[] {
  if (state.folderIds.length === 0) return EMPTY_FOLDERS;
  if (state.folderIds === foldersCacheIds && state.foldersById === foldersCacheMap) {
    return foldersCacheResult;
  }

  const folders = state.folderIds
    .map((folderId) => state.foldersById[folderId])
    .filter((folder): folder is MessengerFolder => folder != null);

  foldersCacheIds = state.folderIds;
  foldersCacheMap = state.foldersById;
  foldersCacheResult = folders;
  return folders;
}
