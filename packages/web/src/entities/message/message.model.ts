import { create } from "zustand";
import { parseMessengerConversationId } from "~/entities/messenger/messenger-ids.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerPendingOwnReactionOperation,
  MessengerPendingOwnReactionsByName,
  MessengerOwnReactionProjectionRow,
  MessengerOwnReactionUuidsByName,
  MessengerReactionCountsByName,
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
  WorkspaceOptimisticMessageReadChange,
} from "./message.model.types";

export type {
  WorkspaceConversationMessagesStatus,
  WorkspaceConversationPagination,
  WorkspaceConversationWindowMarkers,
  WorkspaceMessageBucketIndexOptions,
  WorkspaceMessageEditPatch,
  WorkspaceMessageStoreData,
  WorkspaceMessageStoreState,
  WorkspaceMessageReadScope,
  WorkspaceOptimisticMessageReadChange,
  WorkspaceScopedMessageMutationOptions,
} from "./message.model.types";

const EMPTY_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
const EMPTY_MESSAGE_IDS_BY_CONVERSATION_ID: Record<MessengerConversationId, MessengerUuid[]> = {};
const EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID: Record<MessengerConversationId, boolean> = {};
const EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> = {};
const EMPTY_NEXT_PAGE_MARKER_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> =
  {};
const EMPTY_HAS_MORE_BY_CONVERSATION_ID: Record<MessengerConversationId, boolean> = {};
const EMPTY_BEFORE_PAGE_MARKER_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> =
  {};
const EMPTY_AFTER_PAGE_MARKER_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> =
  {};

const EMPTY_STATUS: WorkspaceConversationMessagesStatus = {
  loading: false,
  error: null,
  nextPageMarker: null,
  hasMore: false,
};
const removedStreamUuids = new Set<MessengerUuid>();

function keepMessagesOutsideRemovedStreams(
  messages: readonly MessengerMessage[],
): MessengerMessage[] {
  return messages.filter((message) => !removedStreamUuids.has(message.streamUuid));
}

function isRemovedStreamConversation(conversationId: MessengerConversationId): boolean {
  const parsed = parseMessengerConversationId(conversationId);
  return parsed != null && removedStreamUuids.has(parsed.streamUuid);
}

function omitConversationRecords<T>(
  record: Record<MessengerConversationId, T>,
  removedConversationIds: ReadonlySet<MessengerConversationId>,
): Record<MessengerConversationId, T> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([conversationId]) => !removedConversationIds.has(conversationId),
    ),
  );
}

// Fresh backend snapshots do not always include the current user's reaction
// projection. Preserve it across snapshot merges so UI highlighting and remove
// actions keep their reaction UUIDs.
function mergeWorkspaceMessageSnapshot(
  previousMessage: MessengerMessage | undefined,
  incomingMessage: MessengerMessage,
): MessengerMessage {
  if (previousMessage == null) return incomingMessage;

  const incomingOwnProjection = incomingMessage.ownReactionUuidsByEmojiName;
  if (Object.keys(incomingOwnProjection).length > 0) return incomingMessage;

  return {
    ...incomingMessage,
    ownReactionUuidsByEmojiName: previousMessage.ownReactionUuidsByEmojiName,
    pendingOwnReactionsByEmojiName: previousMessage.pendingOwnReactionsByEmojiName,
  };
}

// Accept either the domain projection map or cache rows so callers can pass
// persisted own-reaction data without knowing the store's internal shape.
function normalizeOwnReactionProjection(
  projection: MessengerOwnReactionUuidsByName | readonly MessengerOwnReactionProjectionRow[],
): MessengerOwnReactionUuidsByName {
  const rows = Array.isArray(projection)
    ? (projection as readonly MessengerOwnReactionProjectionRow[])
    : null;
  if (rows == null) {
    return { ...(projection as MessengerOwnReactionUuidsByName) };
  }

  const normalized: MessengerOwnReactionUuidsByName = {};
  for (const row of rows) {
    if (row.emojiName.trim().length === 0) continue;
    normalized[row.emojiName] = row.reactionUuid;
  }
  return normalized;
}

// Copy reaction aggregates at the store boundary so external callers cannot
// mutate message.reactions after an event is applied.
function cloneReactionAggregate(
  aggregate: MessengerReactionCountsByName,
): MessengerReactionCountsByName {
  return { ...aggregate };
}

function clonePendingOwnReactions(
  pending: MessengerPendingOwnReactionsByName | undefined,
): MessengerPendingOwnReactionsByName {
  return pending == null ? {} : { ...pending };
}

function setReactionCount(
  reactions: MessengerReactionCountsByName,
  emojiName: string,
  count: number,
): MessengerReactionCountsByName {
  const nextReactions = { ...reactions };
  if (count <= 0) {
    delete nextReactions[emojiName];
  } else {
    nextReactions[emojiName] = count;
  }
  return nextReactions;
}

function optimisticReactionCount(
  currentCount: number,
  operation: MessengerPendingOwnReactionOperation,
): number {
  return operation === "add" ? currentCount + 1 : Math.max(0, currentCount - 1);
}

function createEmptyWorkspaceMessageData(): WorkspaceMessageStoreData {
  return {
    messagesById: EMPTY_MESSAGES_BY_ID,
    messageIdsByConversationId: EMPTY_MESSAGE_IDS_BY_CONVERSATION_ID,
    messagesLoadingByConversationId: EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID,
    messagesErrorByConversationId: EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID,
    nextPageMarkerByConversationId: EMPTY_NEXT_PAGE_MARKER_BY_CONVERSATION_ID,
    hasMoreByConversationId: EMPTY_HAS_MORE_BY_CONVERSATION_ID,
    beforePageMarkerByConversationId: EMPTY_BEFORE_PAGE_MARKER_BY_CONVERSATION_ID,
    afterPageMarkerByConversationId: EMPTY_AFTER_PAGE_MARKER_BY_CONVERSATION_ID,
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
    nextMessagesById[message.uuid] = mergeWorkspaceMessageSnapshot(
      nextMessagesById[message.uuid],
      message,
    );
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

function applyConversationMessagesWindow(
  state: Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId">,
  conversationId: MessengerConversationId,
  messages: readonly MessengerMessage[],
): Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId"> {
  const nextMessagesById = { ...state.messagesById };
  for (const message of messages) {
    nextMessagesById[message.uuid] = mergeWorkspaceMessageSnapshot(
      nextMessagesById[message.uuid],
      message,
    );
  }

  return {
    messagesById: nextMessagesById,
    messageIdsByConversationId: {
      ...state.messageIdsByConversationId,
      [conversationId]: mergeSortedWorkspaceMessageIds(
        EMPTY_WORKSPACE_MESSAGE_IDS,
        messages,
        nextMessagesById,
      ),
    },
  };
}

function indexMessageIntoBuckets(
  state: Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId">,
  message: MessengerMessage,
  conversationIds: readonly MessengerConversationId[],
): Pick<WorkspaceMessageStoreData, "messagesById" | "messageIdsByConversationId"> {
  const previousMessage = state.messagesById[message.uuid];
  const nextMessage = mergeWorkspaceMessageSnapshot(previousMessage, message);
  const nextMessagesById = {
    ...state.messagesById,
    [message.uuid]: nextMessage,
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
    set((state) =>
      applyConversationMessagesPage(
        state,
        conversationId,
        keepMessagesOutsideRemovedStreams(messages),
      ),
    );
  },

  replaceConversationMessagesWindow(conversationId, messages) {
    logStoreAction("workspaceMessage", "replaceConversationMessagesWindow", {
      conversationId,
      messages: messages.length,
    });
    set((state) =>
      applyConversationMessagesWindow(
        state,
        conversationId,
        keepMessagesOutsideRemovedStreams(messages),
      ),
    );
  },

  mergeConversationMessagesPage(conversationId, messages) {
    logStoreAction("workspaceMessage", "mergeConversationMessagesPage", {
      conversationId,
      messages: messages.length,
    });
    set((state) =>
      applyConversationMessagesPage(
        state,
        conversationId,
        keepMessagesOutsideRemovedStreams(messages),
      ),
    );
  },

  indexMessageIntoConversationBuckets(message, options) {
    if (removedStreamUuids.has(message.streamUuid)) return;
    const conversationIds = conversationBucketsForWorkspaceMessage(message, options);
    logStoreAction("workspaceMessage", "indexMessageIntoConversationBuckets", {
      messageUuid: message.uuid,
      conversations: conversationIds.length,
    });
    set((state) => indexMessageIntoBuckets(state, message, conversationIds));
  },

  upsertMessage(message) {
    if (removedStreamUuids.has(message.streamUuid)) return;
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
    if (removedStreamUuids.has(message.streamUuid)) return;
    logStoreAction("workspaceMessage", "upsertMessageBody", { messageUuid: message.uuid });
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [message.uuid]: mergeWorkspaceMessageSnapshot(state.messagesById[message.uuid], message),
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
            payload: { kind: "markdown", content: patch.markdown },
            updatedAt: patch.updatedAt ?? message.updatedAt,
          },
        },
      };
    });
  },

  applyOwnMessageReactions(messageUuid, projection) {
    logStoreAction("workspaceMessage", "applyOwnMessageReactions", { messageUuid });
    set((state) => {
      const message = state.messagesById[messageUuid];
      if (message == null) return state;

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            ownReactionUuidsByEmojiName: normalizeOwnReactionProjection(projection),
          },
        },
      };
    });
  },

  setOwnMessageReaction(messageUuid, emojiName, reactionUuid) {
    logStoreAction("workspaceMessage", "setOwnMessageReaction", { messageUuid, emojiName });
    set((state) => {
      const message = state.messagesById[messageUuid];
      if (message == null || emojiName.trim().length === 0) return state;

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            ownReactionUuidsByEmojiName: {
              ...message.ownReactionUuidsByEmojiName,
              [emojiName]: reactionUuid,
            },
          },
        },
      };
    });
  },

  removeOwnMessageReaction(messageUuid, emojiName) {
    logStoreAction("workspaceMessage", "removeOwnMessageReaction", { messageUuid, emojiName });
    set((state) => {
      const message = state.messagesById[messageUuid];
      if (message?.ownReactionUuidsByEmojiName[emojiName] == null) return state;

      const nextOwnReactionUuidsByEmojiName = { ...message.ownReactionUuidsByEmojiName };
      delete nextOwnReactionUuidsByEmojiName[emojiName];

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            ownReactionUuidsByEmojiName: nextOwnReactionUuidsByEmojiName,
          },
        },
      };
    });
  },

  beginOptimisticOwnMessageReaction(messageUuid, emojiName, operation, requestId) {
    logStoreAction("workspaceMessage", "beginOptimisticOwnMessageReaction", {
      messageUuid,
      emojiName,
      operation,
    });
    set((state) => {
      const message = state.messagesById[messageUuid];
      if (message == null || emojiName.trim().length === 0) return state;

      const pending = clonePendingOwnReactions(message.pendingOwnReactionsByEmojiName);
      if (pending[emojiName] != null) return state;

      const previousCount = message.reactions[emojiName] ?? 0;
      const previousOwnReactionUuid = message.ownReactionUuidsByEmojiName[emojiName] ?? null;
      if (operation === "add" && previousOwnReactionUuid != null) return state;
      const nextOwnReactionUuidsByEmojiName = { ...message.ownReactionUuidsByEmojiName };
      if (operation === "remove") {
        delete nextOwnReactionUuidsByEmojiName[emojiName];
      }

      pending[emojiName] = {
        requestId,
        operation,
        previousCount,
        previousOwnReactionUuid,
      };

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            reactions: setReactionCount(
              message.reactions,
              emojiName,
              optimisticReactionCount(previousCount, operation),
            ),
            ownReactionUuidsByEmojiName: nextOwnReactionUuidsByEmojiName,
            pendingOwnReactionsByEmojiName: pending,
          },
        },
      };
    });
  },

  settleOptimisticOwnMessageReaction(messageUuid, emojiName, requestId) {
    logStoreAction("workspaceMessage", "settleOptimisticOwnMessageReaction", {
      messageUuid,
      emojiName,
    });
    set((state) => {
      const message = state.messagesById[messageUuid];
      const pendingAction = message?.pendingOwnReactionsByEmojiName?.[emojiName];
      if (message == null || pendingAction?.requestId !== requestId) return state;

      const pending = clonePendingOwnReactions(message.pendingOwnReactionsByEmojiName);
      delete pending[emojiName];

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            pendingOwnReactionsByEmojiName: Object.keys(pending).length > 0 ? pending : undefined,
          },
        },
      };
    });
  },

  rollbackOptimisticOwnMessageReaction(messageUuid, emojiName, requestId) {
    logStoreAction("workspaceMessage", "rollbackOptimisticOwnMessageReaction", {
      messageUuid,
      emojiName,
    });
    set((state) => {
      const message = state.messagesById[messageUuid];
      const pendingAction = message?.pendingOwnReactionsByEmojiName?.[emojiName];
      if (message == null || pendingAction?.requestId !== requestId) return state;

      const pending = clonePendingOwnReactions(message.pendingOwnReactionsByEmojiName);
      delete pending[emojiName];

      const nextOwnReactionUuidsByEmojiName = { ...message.ownReactionUuidsByEmojiName };
      if (pendingAction.previousOwnReactionUuid == null) {
        delete nextOwnReactionUuidsByEmojiName[emojiName];
      } else {
        nextOwnReactionUuidsByEmojiName[emojiName] = pendingAction.previousOwnReactionUuid;
      }

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            reactions: setReactionCount(message.reactions, emojiName, pendingAction.previousCount),
            ownReactionUuidsByEmojiName: nextOwnReactionUuidsByEmojiName,
            pendingOwnReactionsByEmojiName: Object.keys(pending).length > 0 ? pending : undefined,
          },
        },
      };
    });
  },

  applyMessageReactionAggregate(messageUuid, aggregate) {
    logStoreAction("workspaceMessage", "applyMessageReactionAggregate", { messageUuid });
    set((state) => {
      const message = state.messagesById[messageUuid];
      if (message == null) return state;

      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            reactions: cloneReactionAggregate(aggregate),
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

  markMessagesReadUpTo(messageUuid, options) {
    logStoreAction("workspaceMessage", "markMessagesReadUpTo", { messageUuid });
    let changedMessages: MessengerMessage[] = [];

    set((state) => {
      const anchor = state.messagesById[messageUuid];
      if (anchor == null) return state;

      const candidateMessageIds = new Set<MessengerUuid>();
      const conversationIds = options?.conversationIds;
      if (conversationIds == null) {
        for (const candidateMessageUuid of Object.keys(state.messagesById)) {
          candidateMessageIds.add(candidateMessageUuid);
        }
      } else {
        for (const conversationId of conversationIds) {
          for (const candidateMessageUuid of state.messageIdsByConversationId[conversationId] ??
            EMPTY_WORKSPACE_MESSAGE_IDS) {
            candidateMessageIds.add(candidateMessageUuid);
          }
        }
      }

      changedMessages = [...candidateMessageIds]
        .map((candidateMessageUuid) => state.messagesById[candidateMessageUuid])
        .filter(
          (message): message is MessengerMessage =>
            message != null &&
            !message.read &&
            message.streamUuid === anchor.streamUuid &&
            message.topicUuid === anchor.topicUuid &&
            message.createdAt.localeCompare(anchor.createdAt) <= 0,
        );

      if (changedMessages.length === 0) return state;

      const nextMessagesById = { ...state.messagesById };
      for (const message of changedMessages) {
        nextMessagesById[message.uuid] = { ...message, read: true };
      }

      changedMessages = changedMessages
        .map((message) => nextMessagesById[message.uuid])
        .filter((message): message is MessengerMessage => message != null);
      return { messagesById: nextMessagesById };
    });

    return changedMessages;
  },

  beginOptimisticMessagesRead(scope) {
    logStoreAction("workspaceMessage", "beginOptimisticMessagesRead", { ...scope });
    const change: {
      previousMessages: MessengerMessage[];
      projectedMessages: MessengerMessage[];
    } = {
      previousMessages: [],
      projectedMessages: [],
    };

    set((state) => {
      const nextMessagesById = { ...state.messagesById };
      for (const message of Object.values(state.messagesById)) {
        if (
          message.read ||
          message.streamUuid !== scope.streamUuid ||
          (scope.topicUuid != null && message.topicUuid !== scope.topicUuid)
        ) {
          continue;
        }

        const projectedMessage = { ...message, read: true };
        change.previousMessages.push(message);
        change.projectedMessages.push(projectedMessage);
        nextMessagesById[message.uuid] = projectedMessage;
      }

      return change.projectedMessages.length === 0 ? state : { messagesById: nextMessagesById };
    });

    return change satisfies WorkspaceOptimisticMessageReadChange;
  },

  rollbackOptimisticMessagesRead(change) {
    logStoreAction("workspaceMessage", "rollbackOptimisticMessagesRead", {
      messages: change.previousMessages.length,
    });
    if (change.previousMessages.length === 0) return;

    set((state) => {
      let nextMessagesById = state.messagesById;
      for (let index = 0; index < change.previousMessages.length; index += 1) {
        const previousMessage = change.previousMessages[index];
        const projectedMessage = change.projectedMessages[index];
        if (
          previousMessage == null ||
          projectedMessage == null ||
          state.messagesById[previousMessage.uuid] !== projectedMessage
        ) {
          continue;
        }
        if (nextMessagesById === state.messagesById) {
          nextMessagesById = { ...state.messagesById };
        }
        nextMessagesById[previousMessage.uuid] = previousMessage;
      }
      return nextMessagesById === state.messagesById ? state : { messagesById: nextMessagesById };
    });
  },

  setMessagesLoading(conversationId, loading) {
    if (isRemovedStreamConversation(conversationId)) return;
    logStoreAction("workspaceMessage", "setMessagesLoading", { conversationId, loading });
    set((state) => ({
      messagesLoadingByConversationId: {
        ...state.messagesLoadingByConversationId,
        [conversationId]: loading,
      },
    }));
  },

  setMessagesError(conversationId, error) {
    if (isRemovedStreamConversation(conversationId)) return;
    logStoreAction("workspaceMessage", "setMessagesError", { conversationId, error });
    set((state) => ({
      messagesErrorByConversationId: {
        ...state.messagesErrorByConversationId,
        [conversationId]: error,
      },
    }));
  },

  setConversationPagination(conversationId, pagination) {
    if (isRemovedStreamConversation(conversationId)) return;
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

  setConversationWindowMarkers(conversationId, markers) {
    if (isRemovedStreamConversation(conversationId)) return;
    logStoreAction("workspaceMessage", "setConversationWindowMarkers", {
      conversationId,
      beforePageMarker: markers.beforePageMarker,
      afterPageMarker: markers.afterPageMarker,
    });
    set((state) => ({
      beforePageMarkerByConversationId: {
        ...state.beforePageMarkerByConversationId,
        [conversationId]: markers.beforePageMarker,
      },
      afterPageMarkerByConversationId: {
        ...state.afterPageMarkerByConversationId,
        [conversationId]: markers.afterPageMarker,
      },
    }));
  },

  removeMessagesForStream(streamUuid) {
    logStoreAction("workspaceMessage", "removeMessagesForStream", { streamUuid });
    removedStreamUuids.add(streamUuid);
    set((state) => {
      const removedConversationIds = new Set(
        [
          ...Object.keys(state.messageIdsByConversationId),
          ...Object.keys(state.messagesLoadingByConversationId),
          ...Object.keys(state.messagesErrorByConversationId),
          ...Object.keys(state.nextPageMarkerByConversationId),
          ...Object.keys(state.hasMoreByConversationId),
          ...Object.keys(state.beforePageMarkerByConversationId),
          ...Object.keys(state.afterPageMarkerByConversationId),
        ].filter(
          (conversationId) =>
            parseMessengerConversationId(conversationId)?.streamUuid === streamUuid,
        ),
      );
      const nextMessagesById = Object.fromEntries(
        Object.entries(state.messagesById).filter(
          ([, message]) => message.streamUuid !== streamUuid,
        ),
      );
      return {
        messagesById: nextMessagesById,
        messageIdsByConversationId: omitConversationRecords(
          state.messageIdsByConversationId,
          removedConversationIds,
        ),
        messagesLoadingByConversationId: omitConversationRecords(
          state.messagesLoadingByConversationId,
          removedConversationIds,
        ),
        messagesErrorByConversationId: omitConversationRecords(
          state.messagesErrorByConversationId,
          removedConversationIds,
        ),
        nextPageMarkerByConversationId: omitConversationRecords(
          state.nextPageMarkerByConversationId,
          removedConversationIds,
        ),
        hasMoreByConversationId: omitConversationRecords(
          state.hasMoreByConversationId,
          removedConversationIds,
        ),
        beforePageMarkerByConversationId: omitConversationRecords(
          state.beforePageMarkerByConversationId,
          removedConversationIds,
        ),
        afterPageMarkerByConversationId: omitConversationRecords(
          state.afterPageMarkerByConversationId,
          removedConversationIds,
        ),
      };
    });
  },

  restoreMessagesForStream(streamUuid) {
    removedStreamUuids.delete(streamUuid);
  },

  clear() {
    logStoreAction("workspaceMessage", "clear", {});
    removedStreamUuids.clear();
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
