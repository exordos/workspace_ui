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
const EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID: Record<MessengerConversationId, boolean> = {};
const EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID: Record<MessengerConversationId, string> = {};
const EMPTY_NEXT_PAGE_MARKER_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> =
  {};
const EMPTY_HAS_MORE_BY_CONVERSATION_ID: Record<MessengerConversationId, boolean> = {};
const EMPTY_FOLDERS_BY_ID: Record<MessengerUuid, MessengerFolder> = {};
const EMPTY_USERS_BY_ID: Record<MessengerUuid, MessengerUser> = {};
const EMPTY_IDS: string[] = [];
const EMPTY_CONVERSATIONS: MessengerConversation[] = [];
const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_FOLDERS: MessengerFolder[] = [];
const EMPTY_SKIPPED_REALTIME_EVENTS: MessengerSkippedRealtimeEvent[] = [];

// Store хранит Workspace-данные отдельно от старых Zulip stores.
// Это важно для миграции: новый backend не должен подстраиваться под старый source-of-truth.
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
  messagesLoadingByConversationId: Record<MessengerConversationId, boolean>;
  messagesErrorByConversationId: Record<MessengerConversationId, string>;
  nextPageMarkerByConversationId: Record<MessengerConversationId, string | null>;
  hasMoreByConversationId: Record<MessengerConversationId, boolean>;
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
  startConversationMessagesLoad: (
    ownerKey: string,
    conversationId: MessengerConversationId,
  ) => void;
  applyConversationMessagesLoadSuccess: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    messages: MessengerMessage[],
    options: {
      mode: "replace" | "merge";
      nextPageMarker: string | null;
      hasMore: boolean;
    },
  ) => void;
  finishConversationMessagesLoad: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    nextPageMarker: string | null,
  ) => void;
  failConversationMessagesLoad: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    error: string,
  ) => void;
  cancelConversationMessagesLoad: (
    ownerKey: string,
    conversationId: MessengerConversationId,
  ) => void;
  upsertStream: (ownerKey: string, stream: MessengerStream) => void;
  removeStream: (ownerKey: string, stream: MessengerDeletedStream) => void;
  upsertStreamBindings: (ownerKey: string, bindings: MessengerStreamBinding[]) => void;
  upsertTopic: (ownerKey: string, topic: MessengerTopic) => void;
  removeTopic: (ownerKey: string, topic: MessengerDeletedTopic) => void;
  upsertMessage: (ownerKey: string, message: MessengerMessage) => void;
  indexMessageIntoConversationBuckets: (
    ownerKey: string,
    message: MessengerMessage,
    options?: MessengerMessageBucketIndexOptions,
  ) => void;
  applyMessageEdit: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    patch: MessengerMessageEditPatch,
  ) => void;
  markMessageRead: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    options?: MessengerScopedMessageMutationOptions,
  ) => void;
  removeMessage: (
    ownerKey: string,
    message: MessengerDeletedMessage,
    options?: MessengerScopedMessageMutationOptions,
  ) => void;
  mergeConversationMessagesPage: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    messages: MessengerMessage[],
  ) => void;
  applyFolderSnapshot: (ownerKey: string, folder: MessengerFolder) => void;
  removeFolder: (ownerKey: string, folder: MessengerDeletedFolder) => void;
  upsertFolderItem: (ownerKey: string, folderItem: MessengerFolderItem) => void;
  removeFolderItem: (ownerKey: string, folderItem: MessengerDeletedFolderItem) => void;
  setRealtimeCursor: (ownerKey: string, epochVersion: number) => void;
  markRealtimeEventSkipped: (ownerKey: string, epochVersion: number, reason: string) => void;
  setBootstrapError: (ownerKey: string, error: string) => void;
  clear: () => void;
}

export interface MessengerMessageBucketIndexOptions {
  // Одно сообщение может одновременно быть видно в topic timeline и в общем stream timeline.
  includeStreamConversation?: boolean;
  conversationIds?: readonly MessengerConversationId[];
}

export interface MessengerScopedMessageMutationOptions {
  conversationIds?: readonly MessengerConversationId[];
}

export interface MessengerMessageEditPatch {
  markdown: string;
  updatedAt?: string;
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
    messagesLoadingByConversationId: EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID,
    messagesErrorByConversationId: EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID,
    nextPageMarkerByConversationId: EMPTY_NEXT_PAGE_MARKER_BY_CONVERSATION_ID,
    hasMoreByConversationId: EMPTY_HAS_MORE_BY_CONVERSATION_ID,
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
  | "startConversationMessagesLoad"
  | "applyConversationMessagesLoadSuccess"
  | "finishConversationMessagesLoad"
  | "failConversationMessagesLoad"
  | "cancelConversationMessagesLoad"
  | "upsertStream"
  | "removeStream"
  | "upsertStreamBindings"
  | "upsertTopic"
  | "removeTopic"
  | "upsertMessage"
  | "indexMessageIntoConversationBuckets"
  | "applyMessageEdit"
  | "markMessageRead"
  | "removeMessage"
  | "mergeConversationMessagesPage"
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

function isMessageReferencedOutsideConversations(
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>,
  excludedConversationIds: ReadonlySet<MessengerConversationId>,
  messageId: MessengerUuid,
): boolean {
  for (const [conversationId, messageIds] of Object.entries(messageIdsByConversationId)) {
    if (excludedConversationIds.has(conversationId)) continue;
    if (messageIds.includes(messageId)) return true;
  }
  return false;
}

function applyConversationMessagesBucket(
  state: Pick<MessengerDomainData, "messagesById" | "messageIdsByConversationId">,
  conversationId: MessengerConversationId,
  messages: MessengerMessage[],
  mode: "replace" | "merge",
): Pick<MessengerDomainData, "messagesById" | "messageIdsByConversationId"> {
  // Объект сообщения не дублируем: messagesById хранит тело, а bucket хранит только порядок uuid.
  const nextMessagesById = { ...state.messagesById };
  const excludedConversationIds = new Set<MessengerConversationId>([conversationId]);
  let nextMessageIds =
    mode === "merge" ? (state.messageIdsByConversationId[conversationId] ?? EMPTY_IDS) : EMPTY_IDS;

  if (mode === "replace") {
    const nextMessageIdSet = new Set(messages.map((message) => message.uuid));
    const previousMessageIds = state.messageIdsByConversationId[conversationId] ?? EMPTY_IDS;
    for (const messageId of previousMessageIds) {
      if (
        !nextMessageIdSet.has(messageId) &&
        !isMessageReferencedOutsideConversations(
          state.messageIdsByConversationId,
          excludedConversationIds,
          messageId,
        )
      ) {
        delete nextMessagesById[messageId];
      }
    }
  }

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
}

function conversationBucketsForMessage(
  message: MessengerMessage,
  options?: MessengerMessageBucketIndexOptions,
): MessengerConversationId[] {
  // По умолчанию сообщение попадает в topic; stream-wide bucket добавляем только когда это явно нужно.
  let conversationIds: MessengerConversationId[] =
    options?.conversationIds != null ? [...options.conversationIds] : [message.conversationId];

  if (options?.includeStreamConversation === true) {
    conversationIds = appendUniqueId(conversationIds, conversationIdForStream(message.streamUuid));
  }

  return conversationIds;
}

function indexMessageIntoBuckets(
  state: Pick<MessengerDomainData, "messagesById" | "messageIdsByConversationId">,
  message: MessengerMessage,
  conversationIds: readonly MessengerConversationId[],
): Pick<MessengerDomainData, "messagesById" | "messageIdsByConversationId"> {
  const nextMessageIdsByConversationId = { ...state.messageIdsByConversationId };
  for (const conversationId of conversationIds) {
    nextMessageIdsByConversationId[conversationId] = appendUniqueId(
      nextMessageIdsByConversationId[conversationId] ?? EMPTY_IDS,
      message.uuid,
    );
  }

  return {
    messagesById: {
      ...state.messagesById,
      [message.uuid]: message,
    },
    messageIdsByConversationId: nextMessageIdsByConversationId,
  };
}

function removeConversationPageState(
  state: Pick<
    MessengerDomainData,
    | "messagesLoadingByConversationId"
    | "messagesErrorByConversationId"
    | "nextPageMarkerByConversationId"
    | "hasMoreByConversationId"
  >,
  conversationIds: MessengerConversationId[],
): Pick<
  MessengerDomainData,
  | "messagesLoadingByConversationId"
  | "messagesErrorByConversationId"
  | "nextPageMarkerByConversationId"
  | "hasMoreByConversationId"
> {
  const nextLoading = { ...state.messagesLoadingByConversationId };
  const nextErrors = { ...state.messagesErrorByConversationId };
  const nextPageMarkers = { ...state.nextPageMarkerByConversationId };
  const nextHasMore = { ...state.hasMoreByConversationId };

  for (const conversationId of conversationIds) {
    delete nextLoading[conversationId];
    delete nextErrors[conversationId];
    delete nextPageMarkers[conversationId];
    delete nextHasMore[conversationId];
  }

  return {
    messagesLoadingByConversationId: nextLoading,
    messagesErrorByConversationId: nextErrors,
    nextPageMarkerByConversationId: nextPageMarkers,
    hasMoreByConversationId: nextHasMore,
  };
}

function rebuildFolderWithItems(
  folder: MessengerFolder,
  items: MessengerFolderItem[],
): MessengerFolder {
  return {
    ...folder,
    items,
    unreadCount: items.reduce((total, item) => total + item.unreadCount, 0),
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

function removeConversationMessages(
  messagesById: Record<MessengerUuid, MessengerMessage>,
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>,
  conversationIds: MessengerConversationId[],
): {
  messagesById: Record<MessengerUuid, MessengerMessage>;
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>;
} {
  // Когда удаляем conversation, чистим только те сообщения, которые больше не видны в других buckets.
  const nextMessagesById = { ...messagesById };
  const nextMessageIdsByConversationId = { ...messageIdsByConversationId };
  const removedConversationIds = new Set(conversationIds);

  for (const conversationId of conversationIds) {
    const messageIds = nextMessageIdsByConversationId[conversationId] ?? EMPTY_IDS;
    for (const messageId of messageIds) {
      if (
        !isMessageReferencedOutsideConversations(
          messageIdsByConversationId,
          removedConversationIds,
          messageId,
        )
      ) {
        delete nextMessagesById[messageId];
      }
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
    messagesLoadingByConversationId: EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID,
    messagesErrorByConversationId: EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID,
    nextPageMarkerByConversationId: EMPTY_NEXT_PAGE_MARKER_BY_CONVERSATION_ID,
    hasMoreByConversationId: EMPTY_HAS_MORE_BY_CONVERSATION_ID,
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

      return applyConversationMessagesBucket(state, conversationId, messages, "replace");
    });
  },

  startConversationMessagesLoad(ownerKey, conversationId) {
    logStoreAction("messenger", "startConversationMessagesLoad", { ownerKey, conversationId });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextErrors = { ...state.messagesErrorByConversationId };
      delete nextErrors[conversationId];

      return {
        messagesLoadingByConversationId: {
          ...state.messagesLoadingByConversationId,
          [conversationId]: true,
        },
        messagesErrorByConversationId: nextErrors,
      };
    });
  },

  applyConversationMessagesLoadSuccess(ownerKey, conversationId, messages, options) {
    logStoreAction("messenger", "applyConversationMessagesLoadSuccess", {
      ownerKey,
      conversationId,
      messages: messages.length,
      mode: options.mode,
      nextPageMarker: options.nextPageMarker,
      hasMore: options.hasMore,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextLoading = { ...state.messagesLoadingByConversationId };
      delete nextLoading[conversationId];
      const nextErrors = { ...state.messagesErrorByConversationId };
      delete nextErrors[conversationId];
      const messageState = applyConversationMessagesBucket(
        state,
        conversationId,
        messages,
        options.mode,
      );

      return {
        ...messageState,
        messagesLoadingByConversationId: nextLoading,
        messagesErrorByConversationId: nextErrors,
        nextPageMarkerByConversationId: {
          ...state.nextPageMarkerByConversationId,
          [conversationId]: options.nextPageMarker,
        },
        hasMoreByConversationId: {
          ...state.hasMoreByConversationId,
          [conversationId]: options.hasMore,
        },
      };
    });
  },

  finishConversationMessagesLoad(ownerKey, conversationId, nextPageMarker) {
    logStoreAction("messenger", "finishConversationMessagesLoad", {
      ownerKey,
      conversationId,
      nextPageMarker,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextLoading = { ...state.messagesLoadingByConversationId };
      delete nextLoading[conversationId];
      const nextErrors = { ...state.messagesErrorByConversationId };
      delete nextErrors[conversationId];

      return {
        messagesLoadingByConversationId: nextLoading,
        messagesErrorByConversationId: nextErrors,
        nextPageMarkerByConversationId: {
          ...state.nextPageMarkerByConversationId,
          [conversationId]: nextPageMarker,
        },
        hasMoreByConversationId: {
          ...state.hasMoreByConversationId,
          [conversationId]: nextPageMarker != null,
        },
      };
    });
  },

  failConversationMessagesLoad(ownerKey, conversationId, error) {
    logStoreAction("messenger", "failConversationMessagesLoad", {
      ownerKey,
      conversationId,
      error,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextLoading = { ...state.messagesLoadingByConversationId };
      delete nextLoading[conversationId];

      return {
        messagesLoadingByConversationId: nextLoading,
        messagesErrorByConversationId: {
          ...state.messagesErrorByConversationId,
          [conversationId]: error,
        },
      };
    });
  },

  cancelConversationMessagesLoad(ownerKey, conversationId) {
    logStoreAction("messenger", "cancelConversationMessagesLoad", { ownerKey, conversationId });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const nextLoading = { ...state.messagesLoadingByConversationId };
      delete nextLoading[conversationId];

      return {
        messagesLoadingByConversationId: nextLoading,
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
      const messageState = removeConversationMessages(
        state.messagesById,
        state.messageIdsByConversationId,
        removedConversationIds,
      );
      const pageState = removeConversationPageState(state, removedConversationIds);

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
        ...pageState,
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
      const pageState = removeConversationPageState(state, [conversationId]);

      return {
        topicsById: nextTopicsById,
        topicIds: removeId(state.topicIds, topic.uuid),
        conversationsById: nextConversationsById,
        conversationIds: removeId(state.conversationIds, conversationId),
        ...messageState,
        ...pageState,
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

  indexMessageIntoConversationBuckets(ownerKey, message, options) {
    const conversationIds = conversationBucketsForMessage(message, options);
    logStoreAction("messenger", "indexMessageIntoConversationBuckets", {
      ownerKey,
      messageUuid: message.uuid,
      conversations: conversationIds.length,
    });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      return indexMessageIntoBuckets(state, message, conversationIds);
    });
  },

  applyMessageEdit(ownerKey, messageUuid, patch) {
    logStoreAction("messenger", "applyMessageEdit", { ownerKey, messageUuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const message = state.messagesById[messageUuid];
      if (message == null) return state;

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            markdown: patch.markdown,
            updatedAt: patch.updatedAt ?? message.updatedAt,
          },
        },
      };
    });
  },

  markMessageRead(ownerKey, messageUuid, options) {
    logStoreAction("messenger", "markMessageRead", { ownerKey, messageUuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      const message = state.messagesById[messageUuid];
      if (message == null) return state;
      if (options?.conversationIds != null) {
        const messageIsVisible = options.conversationIds.some((conversationId) =>
          (state.messageIdsByConversationId[conversationId] ?? EMPTY_IDS).includes(messageUuid),
        );
        if (!messageIsVisible) return state;
      }

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            read: true,
          },
        },
      };
    });
  },

  removeMessage(ownerKey, message, options) {
    logStoreAction("messenger", "removeMessage", { ownerKey, messageUuid: message.uuid });
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;

      // Delete API знает uuid сообщения, а UI может показывать его в stream и topic одновременно.
      // Поэтому сначала убираем uuid из нужных списков, и только потом решаем, можно ли удалить тело.
      const nextMessageIdsByConversationId = { ...state.messageIdsByConversationId };
      const conversationIdsToRemove =
        options?.conversationIds ?? Object.keys(nextMessageIdsByConversationId);
      for (const conversationId of conversationIdsToRemove) {
        nextMessageIdsByConversationId[conversationId] = removeId(
          nextMessageIdsByConversationId[conversationId] ?? EMPTY_IDS,
          message.uuid,
        );
      }

      const shouldDeleteMessage =
        options?.conversationIds == null ||
        !isMessageReferencedOutsideConversations(
          nextMessageIdsByConversationId,
          new Set(conversationIdsToRemove),
          message.uuid,
        );
      const nextMessagesById = shouldDeleteMessage ? { ...state.messagesById } : state.messagesById;
      if (shouldDeleteMessage) {
        delete nextMessagesById[message.uuid];
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

      return applyConversationMessagesBucket(state, conversationId, messages, "merge");
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

        nextFoldersById[folderId] = rebuildFolderWithItems(folder, nextItems);
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

export interface MessengerConversationMessagesStatus {
  loading: boolean;
  error: string | null;
  nextPageMarker: string | null;
  hasMore: boolean;
}

export function selectMessengerConversationMessagesStatus(
  state: MessengerStoreState,
  conversationId: MessengerConversationId,
): MessengerConversationMessagesStatus {
  return {
    loading: state.messagesLoadingByConversationId[conversationId] === true,
    error: state.messagesErrorByConversationId[conversationId] ?? null,
    nextPageMarker: state.nextPageMarkerByConversationId[conversationId] ?? null,
    hasMore: state.hasMoreByConversationId[conversationId] === true,
  };
}
