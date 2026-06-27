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
  MessengerMessage,
  MessengerSkippedRealtimeEvent,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUser,
  MessengerUuid,
} from "./messenger.types";

const EMPTY_STREAMS_BY_ID: Record<MessengerUuid, MessengerStream> = {};
const EMPTY_STREAM_BINDINGS_BY_ID: Record<MessengerUuid, MessengerStreamBinding> = {};
const EMPTY_STREAM_BINDING_IDS_BY_STREAM_ID: Record<MessengerUuid, MessengerUuid[]> = {};
const EMPTY_TOPICS_BY_ID: Record<MessengerUuid, MessengerTopic> = {};
const EMPTY_CONVERSATIONS_BY_ID: Record<MessengerConversationId, MessengerConversation> = {};
const EMPTY_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
const EMPTY_MESSAGE_IDS_BY_CONVERSATION_ID: Record<MessengerConversationId, MessengerUuid[]> = {};
const EMPTY_FOLDERS_BY_ID: Record<MessengerUuid, MessengerFolder> = {};
const EMPTY_USERS_BY_ID: Record<MessengerUuid, MessengerUser> = {};
const EMPTY_IDS: string[] = [];
const EMPTY_CONVERSATIONS: MessengerConversation[] = [];
const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_FOLDERS: MessengerFolder[] = [];
const EMPTY_SKIPPED_REALTIME_EVENTS: MessengerSkippedRealtimeEvent[] = [];

// This store is scoped by ownerKey so several accounts/projects can coexist safely.
export interface MessengerDomainData {
  streamsById: Record<MessengerUuid, MessengerStream>;
  streamIds: MessengerUuid[];
  streamBindingsById: Record<MessengerUuid, MessengerStreamBinding>;
  streamBindingIds: MessengerUuid[];
  streamBindingIdsByStreamId: Record<MessengerUuid, MessengerUuid[]>;
  topicsById: Record<MessengerUuid, MessengerTopic>;
  topicIds: MessengerUuid[];
  conversationsById: Record<MessengerConversationId, MessengerConversation>;
  conversationIds: MessengerConversationId[];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>;
  foldersById: Record<MessengerUuid, MessengerFolder>;
  folderIds: MessengerUuid[];
  usersById: Record<MessengerUuid, MessengerUser>;
  userIds: MessengerUuid[];
  lastEpochVersion: number | null;
  skippedRealtimeEvents: MessengerSkippedRealtimeEvent[];
}

export interface MessengerStoreState extends MessengerDomainData {
  ownerKey: string | null;
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: number | null;

  startBootstrap: (ownerKey: string) => void;
  replaceBootstrapState: (ownerKey: string, payload: MessengerBootstrapPayload) => void;
  replaceConversationMessages: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    messages: MessengerMessage[],
  ) => void;
  upsertStream: (ownerKey: string, stream: MessengerStream) => void;
  removeStream: (ownerKey: string, stream: MessengerDeletedStream) => void;
  upsertStreamBindings: (ownerKey: string, bindings: MessengerStreamBinding[]) => void;
  upsertTopic: (ownerKey: string, topic: MessengerTopic) => void;
  removeTopic: (ownerKey: string, topic: MessengerDeletedTopic) => void;
  upsertMessage: (ownerKey: string, message: MessengerMessage) => void;
  removeMessage: (ownerKey: string, message: MessengerDeletedMessage) => void;
  mergeConversationMessagesPage: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    messages: MessengerMessage[],
  ) => void;
  applyFolderSnapshot: (ownerKey: string, folder: MessengerFolder) => void;
  removeFolder: (ownerKey: string, folder: MessengerDeletedFolder) => void;
  removeFolderItem: (ownerKey: string, folderItem: MessengerDeletedFolderItem) => void;
  setRealtimeCursor: (ownerKey: string, epochVersion: number) => void;
  markRealtimeEventSkipped: (ownerKey: string, epochVersion: number, reason: string) => void;
  setBootstrapError: (ownerKey: string, error: string) => void;
  clear: () => void;
}

function createEmptyMessengerData(): MessengerDomainData {
  return {
    streamsById: EMPTY_STREAMS_BY_ID,
    streamIds: EMPTY_IDS,
    streamBindingsById: EMPTY_STREAM_BINDINGS_BY_ID,
    streamBindingIds: EMPTY_IDS,
    streamBindingIdsByStreamId: EMPTY_STREAM_BINDING_IDS_BY_STREAM_ID,
    topicsById: EMPTY_TOPICS_BY_ID,
    topicIds: EMPTY_IDS,
    conversationsById: EMPTY_CONVERSATIONS_BY_ID,
    conversationIds: EMPTY_IDS,
    messagesById: EMPTY_MESSAGES_BY_ID,
    messageIdsByConversationId: EMPTY_MESSAGE_IDS_BY_CONVERSATION_ID,
    foldersById: EMPTY_FOLDERS_BY_ID,
    folderIds: EMPTY_IDS,
    usersById: EMPTY_USERS_BY_ID,
    userIds: EMPTY_IDS,
    lastEpochVersion: null,
    skippedRealtimeEvents: EMPTY_SKIPPED_REALTIME_EVENTS,
  };
}

function createInitialState(): Omit<
  MessengerStoreState,
  | "startBootstrap"
  | "replaceBootstrapState"
  | "replaceConversationMessages"
  | "upsertStream"
  | "removeStream"
  | "upsertStreamBindings"
  | "upsertTopic"
  | "removeTopic"
  | "upsertMessage"
  | "removeMessage"
  | "mergeConversationMessagesPage"
  | "applyFolderSnapshot"
  | "removeFolder"
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

function removeConversationMessages(
  messagesById: Record<MessengerUuid, MessengerMessage>,
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>,
  conversationIds: MessengerConversationId[],
): {
  messagesById: Record<MessengerUuid, MessengerMessage>;
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>;
} {
  const nextMessagesById = { ...messagesById };
  const nextMessageIdsByConversationId = { ...messageIdsByConversationId };

  for (const conversationId of conversationIds) {
    const messageIds = nextMessageIdsByConversationId[conversationId] ?? EMPTY_IDS;
    for (const messageId of messageIds) {
      delete nextMessagesById[messageId];
    }
    delete nextMessageIdsByConversationId[conversationId];
  }

  return {
    messagesById: nextMessagesById,
    messageIdsByConversationId: nextMessageIdsByConversationId,
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
  const usersById: Record<MessengerUuid, MessengerUser> = {};
  const userIds: MessengerUuid[] = [];

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

  for (const user of payload.users) {
    usersById[user.uuid] = user;
    userIds.push(user.uuid);
  }

  return {
    streamsById,
    streamIds,
    streamBindingsById,
    streamBindingIds,
    streamBindingIdsByStreamId,
    topicsById,
    topicIds,
    conversationsById,
    conversationIds,
    messagesById: EMPTY_MESSAGES_BY_ID,
    messageIdsByConversationId: EMPTY_MESSAGE_IDS_BY_CONVERSATION_ID,
    foldersById,
    folderIds,
    usersById,
    userIds,
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

  replaceBootstrapState(ownerKey, payload) {
    logStoreAction("messenger", "replaceBootstrapState", {
      ownerKey,
      streams: payload.streams.length,
      topics: payload.topics.length,
      conversations: payload.conversations.length,
      folders: payload.folders.length,
      users: payload.users.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return {
        ...buildMessengerDomainData(payload),
        ownerKey,
        isLoading: false,
        error: null,
        lastLoadedAt: Date.now(),
      };
    });
  },

  replaceConversationMessages(ownerKey, conversationId, messages) {
    logStoreAction("messenger", "replaceConversationMessages", {
      ownerKey,
      conversationId,
      messages: messages.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextMessagesById = { ...state.messagesById };
      const previousMessageIds = state.messageIdsByConversationId[conversationId] ?? EMPTY_IDS;
      for (const messageId of previousMessageIds) {
        delete nextMessagesById[messageId];
      }

      const nextMessageIds = messages.map((message) => {
        nextMessagesById[message.uuid] = message;
        return message.uuid;
      });

      return {
        messagesById: nextMessagesById,
        messageIdsByConversationId: {
          ...state.messageIdsByConversationId,
          [conversationId]: nextMessageIds,
        },
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
        if (topic == null || topic.streamUuid !== stream.uuid) continue;
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
      const messageState = removeConversationMessages(
        state.messagesById,
        state.messageIdsByConversationId,
        removedConversationIds,
      );

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
        ...messageState,
      };
    });
  },

  upsertStreamBindings(ownerKey, bindings) {
    logStoreAction("messenger", "upsertStreamBindings", { ownerKey, bindings: bindings.length });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextStreamBindingsById = { ...state.streamBindingsById };
      let nextStreamBindingIds = state.streamBindingIds;
      const nextStreamBindingIdsByStreamId = { ...state.streamBindingIdsByStreamId };

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
      }

      return {
        streamBindingsById: nextStreamBindingsById,
        streamBindingIds: nextStreamBindingIds,
        streamBindingIdsByStreamId: nextStreamBindingIdsByStreamId,
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
      const messageState = removeConversationMessages(
        state.messagesById,
        state.messageIdsByConversationId,
        [conversationId],
      );

      return {
        topicsById: nextTopicsById,
        topicIds: removeId(state.topicIds, topic.uuid),
        conversationsById: nextConversationsById,
        conversationIds: removeId(state.conversationIds, conversationId),
        ...messageState,
      };
    });
  },

  upsertMessage(ownerKey, message) {
    logStoreAction("messenger", "upsertMessage", { ownerKey, messageUuid: message.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const previous = state.messagesById[message.uuid];
      const nextMessageIdsByConversationId = { ...state.messageIdsByConversationId };
      if (previous != null && previous.conversationId !== message.conversationId) {
        nextMessageIdsByConversationId[previous.conversationId] = removeId(
          nextMessageIdsByConversationId[previous.conversationId] ?? EMPTY_IDS,
          message.uuid,
        );
      }
      nextMessageIdsByConversationId[message.conversationId] = appendUniqueId(
        nextMessageIdsByConversationId[message.conversationId] ?? EMPTY_IDS,
        message.uuid,
      );

      return {
        messagesById: {
          ...state.messagesById,
          [message.uuid]: message,
        },
        messageIdsByConversationId: nextMessageIdsByConversationId,
      };
    });
  },

  removeMessage(ownerKey, message) {
    logStoreAction("messenger", "removeMessage", { ownerKey, messageUuid: message.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextMessagesById = { ...state.messagesById };
      const previous = nextMessagesById[message.uuid];
      delete nextMessagesById[message.uuid];
      const conversationIds = [
        conversationIdForTopic(message.streamUuid, message.topicUuid),
        ...(previous != null ? [previous.conversationId] : []),
      ];
      const nextMessageIdsByConversationId = { ...state.messageIdsByConversationId };
      for (const conversationId of conversationIds) {
        nextMessageIdsByConversationId[conversationId] = removeId(
          nextMessageIdsByConversationId[conversationId] ?? EMPTY_IDS,
          message.uuid,
        );
      }

      return {
        messagesById: nextMessagesById,
        messageIdsByConversationId: nextMessageIdsByConversationId,
      };
    });
  },

  mergeConversationMessagesPage(ownerKey, conversationId, messages) {
    logStoreAction("messenger", "mergeConversationMessagesPage", {
      ownerKey,
      conversationId,
      messages: messages.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextMessagesById = { ...state.messagesById };
      let nextMessageIds = state.messageIdsByConversationId[conversationId] ?? EMPTY_IDS;
      for (const message of messages) {
        nextMessagesById[message.uuid] = message;
        nextMessageIds = appendUniqueId(nextMessageIds, message.uuid);
      }

      return {
        messagesById: nextMessagesById,
        messageIdsByConversationId: {
          ...state.messageIdsByConversationId,
          [conversationId]: nextMessageIds,
        },
      };
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

  removeFolderItem(ownerKey, folderItem) {
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

        nextFoldersById[folderId] = {
          ...folder,
          items: nextItems,
        };
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

interface ConversationMessagesCacheEntry {
  ids: MessengerUuid[];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  result: MessengerMessage[];
}

const conversationMessagesCache = new Map<
  MessengerConversationId,
  ConversationMessagesCacheEntry
>();

export function selectMessengerMessagesForConversation(
  state: MessengerStoreState,
  conversationId: MessengerConversationId,
): MessengerMessage[] {
  const messageIds = state.messageIdsByConversationId[conversationId] ?? EMPTY_IDS;
  if (messageIds.length === 0) return EMPTY_MESSAGES;

  const cached = conversationMessagesCache.get(conversationId);
  if (cached?.ids === messageIds && cached.messagesById === state.messagesById) {
    return cached.result;
  }

  const messages = messageIds
    .map((messageId) => state.messagesById[messageId])
    .filter((message): message is MessengerMessage => message != null);

  conversationMessagesCache.set(conversationId, {
    ids: messageIds,
    messagesById: state.messagesById,
    result: messages,
  });
  return messages;
}
