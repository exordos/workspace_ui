import { create } from "zustand";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import { logStoreAction } from "~/shared/lib/logger";
import {
  conversationBucketsForWorkspaceMessage,
  EMPTY_WORKSPACE_MESSAGE_IDS,
  EMPTY_WORKSPACE_MESSAGES,
  insertSortedWorkspaceMessageId,
  isWorkspaceMessageReferencedOutsideConversations,
  mergeSortedWorkspaceMessageIds,
  removeWorkspaceMessageId,
} from "./message-workspace-order.lib";
import type {
  WorkspaceConversationMessagesStatus,
  WorkspaceMessageStoreData,
  WorkspaceMessageStoreState,
} from "./message.model.types";

export type {
  WorkspaceConversationMessagesStatus,
  WorkspaceConversationPagination,
  WorkspaceMessageBucketIndexOptions,
  WorkspaceMessageEditPatch,
  WorkspaceMessageStoreData,
  WorkspaceMessageStoreState,
  WorkspaceScopedMessageMutationOptions,
} from "./message.model.types";

const EMPTY_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
const EMPTY_MESSAGE_IDS_BY_CONVERSATION_ID: Record<MessengerConversationId, MessengerUuid[]> = {};
const EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID: Record<MessengerConversationId, boolean> = {};
const EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> = {};
const EMPTY_NEXT_PAGE_MARKER_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> =
  {};
const EMPTY_HAS_MORE_BY_CONVERSATION_ID: Record<MessengerConversationId, boolean> = {};

const EMPTY_STATUS: WorkspaceConversationMessagesStatus = {
  loading: false,
  error: null,
  nextPageMarker: null,
  hasMore: false,
};

function createEmptyWorkspaceMessageData(): WorkspaceMessageStoreData {
  return {
    messagesById: EMPTY_MESSAGES_BY_ID,
    messageIdsByConversationId: EMPTY_MESSAGE_IDS_BY_CONVERSATION_ID,
    messagesLoadingByConversationId: EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID,
    messagesErrorByConversationId: EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID,
    nextPageMarkerByConversationId: EMPTY_NEXT_PAGE_MARKER_BY_CONVERSATION_ID,
    hasMoreByConversationId: EMPTY_HAS_MORE_BY_CONVERSATION_ID,
  };
}

function applyConversationMessagesPage(
  state: Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId">,
  conversationId: MessengerConversationId,
  messages: readonly MessengerMessage[],
): Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId"> {
  if (messages.length === 0) return state;

  const nextMessagesById = { ...state.messagesById };
  for (const message of messages) {
    nextMessagesById[message.uuid] = message;
  }

  const previousIds =
    state.messageIdsByConversationId[conversationId] ?? EMPTY_WORKSPACE_MESSAGE_IDS;
  const nextMessageIds = mergeSortedWorkspaceMessageIds(previousIds, messages, nextMessagesById);

  return {
    messagesById: nextMessagesById,
    messageIdsByConversationId: {
      ...state.messageIdsByConversationId,
      [conversationId]: nextMessageIds,
    },
  };
}

function indexMessageIntoBuckets(
  state: Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId">,
  message: MessengerMessage,
  conversationIds: readonly MessengerConversationId[],
): Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId"> {
  const previousMessage = state.messagesById[message.uuid];
  const nextMessagesById = {
    ...state.messagesById,
    [message.uuid]: message,
  };
  const nextMessageIdsByConversationId = { ...state.messageIdsByConversationId };

  for (const conversationId of conversationIds) {
    nextMessageIdsByConversationId[conversationId] = insertSortedWorkspaceMessageId(
      nextMessageIdsByConversationId[conversationId] ?? EMPTY_WORKSPACE_MESSAGE_IDS,
      message,
      nextMessagesById,
      previousMessage,
    );
  }

  return {
    messagesById: nextMessagesById,
    messageIdsByConversationId: nextMessageIdsByConversationId,
  };
}

function removeMessageFromConversationIds(
  state: Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId">,
  messageUuid: MessengerUuid,
  conversationIds: readonly MessengerConversationId[],
): Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId"> {
  const nextMessageIdsByConversationId = { ...state.messageIdsByConversationId };
  for (const conversationId of conversationIds) {
    nextMessageIdsByConversationId[conversationId] = removeWorkspaceMessageId(
      nextMessageIdsByConversationId[conversationId] ?? EMPTY_WORKSPACE_MESSAGE_IDS,
      messageUuid,
    );
  }

  const removedConversationIds = new Set(conversationIds);
  const shouldDeleteMessage = !isWorkspaceMessageReferencedOutsideConversations(
    nextMessageIdsByConversationId,
    removedConversationIds,
    messageUuid,
  );

  if (!shouldDeleteMessage) {
    return {
      messagesById: state.messagesById,
      messageIdsByConversationId: nextMessageIdsByConversationId,
    };
  }

  const nextMessagesById = { ...state.messagesById };
  delete nextMessagesById[messageUuid];

  return {
    messagesById: nextMessagesById,
    messageIdsByConversationId: nextMessageIdsByConversationId,
  };
}

export const useWorkspaceMessageStore = create<WorkspaceMessageStoreState>((set) => ({
  ...createEmptyWorkspaceMessageData(),

  replaceOrMergeConversationMessagesPage(conversationId, messages) {
    logStoreAction("workspaceMessage", "replaceOrMergeConversationMessagesPage", {
      conversationId,
      messages: messages.length,
    });
    set((state) => applyConversationMessagesPage(state, conversationId, messages));
  },

  mergeConversationMessagesPage(conversationId, messages) {
    logStoreAction("workspaceMessage", "mergeConversationMessagesPage", {
      conversationId,
      messages: messages.length,
    });
    set((state) => applyConversationMessagesPage(state, conversationId, messages));
  },

  indexMessageIntoConversationBuckets(message, options) {
    const conversationIds = conversationBucketsForWorkspaceMessage(message, options);
    logStoreAction("workspaceMessage", "indexMessageIntoConversationBuckets", {
      messageUuid: message.uuid,
      conversations: conversationIds.length,
    });
    set((state) => indexMessageIntoBuckets(state, message, conversationIds));
  },

  upsertMessage(message) {
    logStoreAction("workspaceMessage", "upsertMessage", { messageUuid: message.uuid });
    set((state) => {
      const previousMessage = state.messagesById[message.uuid];
      let nextMessageIdsByConversationId = state.messageIdsByConversationId;

      if (previousMessage != null) {
        const previousConversationIds = conversationBucketsForWorkspaceMessage(previousMessage, {
          includeStreamConversation: true,
        });
        const nextConversationIds = new Set(
          conversationBucketsForWorkspaceMessage(message, { includeStreamConversation: true }),
        );

        for (const previousConversationId of previousConversationIds) {
          if (nextConversationIds.has(previousConversationId)) continue;
          if (nextMessageIdsByConversationId === state.messageIdsByConversationId) {
            nextMessageIdsByConversationId = { ...state.messageIdsByConversationId };
          }
          nextMessageIdsByConversationId[previousConversationId] = removeWorkspaceMessageId(
            nextMessageIdsByConversationId[previousConversationId] ?? EMPTY_WORKSPACE_MESSAGE_IDS,
            message.uuid,
          );
        }
      }

      return indexMessageIntoBuckets(
        {
          messagesById: state.messagesById,
          messageIdsByConversationId: nextMessageIdsByConversationId,
        },
        message,
        conversationBucketsForWorkspaceMessage(message, { includeStreamConversation: true }),
      );
    });
  },

  upsertMessageBody(message) {
    logStoreAction("workspaceMessage", "upsertMessageBody", { messageUuid: message.uuid });
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [message.uuid]: message,
      },
    }));
  },

  applyMessageEdit(messageUuid, patch) {
    logStoreAction("workspaceMessage", "applyMessageEdit", { messageUuid });
    set((state) => {
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

  removeMessage(messageUuid, options) {
    logStoreAction("workspaceMessage", "removeMessage", { messageUuid });
    set((state) => {
      const conversationIds =
        options?.conversationIds ?? Object.keys(state.messageIdsByConversationId);
      return removeMessageFromConversationIds(state, messageUuid, conversationIds);
    });
  },

  markMessageRead(messageUuid, options) {
    logStoreAction("workspaceMessage", "markMessageRead", { messageUuid });
    set((state) => {
      const message = state.messagesById[messageUuid];
      if (message == null || message.read) return state;

      if (options?.conversationIds != null) {
        const messageIsVisible = options.conversationIds.some((conversationId) =>
          (
            state.messageIdsByConversationId[conversationId] ?? EMPTY_WORKSPACE_MESSAGE_IDS
          ).includes(messageUuid),
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

  setMessagesLoading(conversationId, loading) {
    logStoreAction("workspaceMessage", "setMessagesLoading", { conversationId, loading });
    set((state) => ({
      messagesLoadingByConversationId: {
        ...state.messagesLoadingByConversationId,
        [conversationId]: loading,
      },
    }));
  },

  setMessagesError(conversationId, error) {
    logStoreAction("workspaceMessage", "setMessagesError", { conversationId, error });
    set((state) => ({
      messagesErrorByConversationId: {
        ...state.messagesErrorByConversationId,
        [conversationId]: error,
      },
    }));
  },

  setConversationPagination(conversationId, pagination) {
    logStoreAction("workspaceMessage", "setConversationPagination", {
      conversationId,
      nextPageMarker: pagination.nextPageMarker,
      hasMore: pagination.hasMore,
    });
    set((state) => ({
      nextPageMarkerByConversationId: {
        ...state.nextPageMarkerByConversationId,
        [conversationId]: pagination.nextPageMarker,
      },
      hasMoreByConversationId: {
        ...state.hasMoreByConversationId,
        [conversationId]: pagination.hasMore,
      },
    }));
  },

  clear() {
    logStoreAction("workspaceMessage", "clear", {});
    set(createEmptyWorkspaceMessageData());
  },
}));

interface ConversationMessagesCacheEntry {
  ids: MessengerUuid[];
  messagesById: Record<MessengerUuid, MessengerMessage>;
  result: MessengerMessage[];
}

const conversationMessagesCache = new Map<
  MessengerConversationId,
  ConversationMessagesCacheEntry
>();

export function selectWorkspaceMessagesForConversation(
  state: WorkspaceMessageStoreState,
  conversationId: MessengerConversationId,
): MessengerMessage[] {
  const messageIds =
    state.messageIdsByConversationId[conversationId] ?? EMPTY_WORKSPACE_MESSAGE_IDS;
  if (messageIds.length === 0) return EMPTY_WORKSPACE_MESSAGES;

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

interface ConversationStatusCacheEntry {
  loading: boolean;
  error: string | null;
  nextPageMarker: string | null;
  hasMore: boolean;
  result: WorkspaceConversationMessagesStatus;
}

const conversationStatusCache = new Map<MessengerConversationId, ConversationStatusCacheEntry>();

export function selectWorkspaceMessageStatusForConversation(
  state: WorkspaceMessageStoreState,
  conversationId: MessengerConversationId,
): WorkspaceConversationMessagesStatus {
  const loading = state.messagesLoadingByConversationId[conversationId] === true;
  const error = state.messagesErrorByConversationId[conversationId] ?? null;
  const nextPageMarker = state.nextPageMarkerByConversationId[conversationId] ?? null;
  const hasMore = state.hasMoreByConversationId[conversationId] === true;

  if (!loading && error == null && nextPageMarker == null && !hasMore) {
    return EMPTY_STATUS;
  }

  const cached = conversationStatusCache.get(conversationId);
  if (
    cached?.loading === loading &&
    cached.error === error &&
    cached.nextPageMarker === nextPageMarker &&
    cached.hasMore === hasMore
  ) {
    return cached.result;
  }

  const status = {
    loading,
    error,
    nextPageMarker,
    hasMore,
  };
  conversationStatusCache.set(conversationId, {
    ...status,
    result: status,
  });
  return status;
}

export function selectWorkspaceMessageById(
  state: WorkspaceMessageStoreState,
  messageUuid: MessengerUuid,
): MessengerMessage | null {
  return state.messagesById[messageUuid] ?? null;
}
