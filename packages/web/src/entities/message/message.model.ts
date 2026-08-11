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
  compareWorkspaceMessages,
  EMPTY_WORKSPACE_MESSAGE_IDS,
  EMPTY_WORKSPACE_MESSAGES,
  insertSortedWorkspaceMessageId,
  mergeSortedWorkspaceMessageIds,
  removeWorkspaceMessageId,
} from "./message-workspace-order.lib";
import type {
  WorkspaceConversationWindow,
  WorkspaceConversationMessagesStatus,
  WorkspaceMessageStoreData,
  WorkspaceMessageStoreState,
  WorkspaceOptimisticMessageReadChange,
} from "./message.model.types";

export type {
  WorkspaceConversationWindow,
  WorkspaceConversationWindowMode,
  WorkspaceConversationWindowPageDirection,
  WorkspaceConversationWindowPageMergeInput,
  WorkspaceConversationWindowReplaceInput,
  WorkspaceConversationMessagesStatus,
  WorkspaceConversationWindowMarkers,
  WorkspaceMessageEditPatch,
  WorkspaceMessageStoreData,
  WorkspaceMessageStoreState,
  WorkspaceMessageReadScope,
  WorkspaceOptimisticMessageReadChange,
  WorkspaceScopedMessageMutationOptions,
} from "./message.model.types";

const EMPTY_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
const EMPTY_CONVERSATION_WINDOWS_BY_ID: Record<
  MessengerConversationId,
  WorkspaceConversationWindow
> = {};
const EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID: Record<MessengerConversationId, boolean> = {};
const EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID: Record<MessengerConversationId, string | null> = {};
const EMPTY_MESSAGE_MUTATION_REVISIONS_BY_ID: Record<MessengerUuid, number> = {};
const EMPTY_DELETED_MESSAGE_REVISIONS_BY_ID: Record<MessengerUuid, number> = {};

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
  const incomingSnapshot: MessengerMessage = {
    ...incomingMessage,
    optimisticReactionUserUuidsByEmojiName: undefined,
  };
  if (previousMessage == null) return incomingSnapshot;

  const incomingOwnProjection = incomingSnapshot.ownReactionUuidsByEmojiName;
  if (Object.keys(incomingOwnProjection).length > 0) return incomingSnapshot;

  return {
    ...incomingSnapshot,
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

function optimisticReactionUserUuids(
  previousUserUuids: readonly MessengerUuid[] | null,
  previousCount: number,
  operation: MessengerPendingOwnReactionOperation,
  currentUserUuid: MessengerUuid,
): readonly MessengerUuid[] | null {
  if (previousUserUuids == null) {
    return operation === "add" && previousCount === 0 ? [currentUserUuid] : null;
  }
  if (operation === "remove") {
    return previousUserUuids.filter((userUuid) => userUuid !== currentUserUuid);
  }
  return previousUserUuids.includes(currentUserUuid)
    ? previousUserUuids
    : [...previousUserUuids, currentUserUuid];
}

function createEmptyWorkspaceMessageData(): WorkspaceMessageStoreData {
  return {
    ownerKey: null,
    messagesById: EMPTY_MESSAGES_BY_ID,
    conversationWindowsById: EMPTY_CONVERSATION_WINDOWS_BY_ID,
    messagesLoadingByConversationId: EMPTY_MESSAGES_LOADING_BY_CONVERSATION_ID,
    messagesErrorByConversationId: EMPTY_MESSAGES_ERROR_BY_CONVERSATION_ID,
    messageMutationRevision: 0,
    messageMutationRevisionById: EMPTY_MESSAGE_MUTATION_REVISIONS_BY_ID,
    deletedMessageRevisionById: EMPTY_DELETED_MESSAGE_REVISIONS_BY_ID,
  };
}

function messageFitsWindowBounds(
  window: WorkspaceConversationWindow,
  message: MessengerMessage,
  messagesById: Record<MessengerUuid, MessengerMessage>,
): boolean {
  const oldest = window.messageUuids
    .map((messageUuid) => messagesById[messageUuid])
    .find((candidate): candidate is MessengerMessage => candidate != null);
  const newest = [...window.messageUuids]
    .reverse()
    .map((messageUuid) => messagesById[messageUuid])
    .find((candidate): candidate is MessengerMessage => candidate != null);
  if (oldest == null || newest == null) {
    return window.beforePageMarker == null && window.afterPageMarker == null;
  }
  if (compareWorkspaceMessages(message, oldest) < 0) return window.beforePageMarker == null;
  if (compareWorkspaceMessages(message, newest) > 0) return window.afterPageMarker == null;
  return true;
}

function shouldInsertLiveMessageIntoWindow(
  window: WorkspaceConversationWindow,
  message: MessengerMessage,
  messagesById: Record<MessengerUuid, MessengerMessage>,
): boolean {
  return (
    !window.messageUuids.includes(message.uuid) &&
    messageFitsWindowBounds(window, message, messagesById)
  );
}

function mergeSnapshotMessages(
  state: WorkspaceMessageStoreData,
  messages: readonly MessengerMessage[],
  capturedMutationRevision: number,
): { messagesById: Record<MessengerUuid, MessengerMessage>; acceptedMessages: MessengerMessage[] } {
  const messagesById = { ...state.messagesById };
  const acceptedMessages: MessengerMessage[] = [];
  for (const message of messages) {
    if ((state.deletedMessageRevisionById[message.uuid] ?? 0) > capturedMutationRevision) {
      continue;
    }
    if ((state.messageMutationRevisionById[message.uuid] ?? 0) > capturedMutationRevision) {
      const currentMessage = state.messagesById[message.uuid];
      if (currentMessage != null) acceptedMessages.push(currentMessage);
      continue;
    }
    messagesById[message.uuid] = mergeWorkspaceMessageSnapshot(messagesById[message.uuid], message);
    acceptedMessages.push(message);
  }
  return { messagesById, acceptedMessages };
}

function liveMessagesForReplacement(
  state: WorkspaceMessageStoreData,
  conversationId: MessengerConversationId,
  previousWindow: WorkspaceConversationWindow | undefined,
  serverWindow: WorkspaceConversationWindow,
  capturedMutationRevision: number,
): MessengerMessage[] {
  const serverMessageUuids = new Set(serverWindow.messageUuids);
  const candidateUuids = new Set(previousWindow?.messageUuids ?? []);
  for (const message of Object.values(state.messagesById)) {
    if ((state.messageMutationRevisionById[message.uuid] ?? 0) <= capturedMutationRevision) {
      continue;
    }
    if (
      conversationBucketsForWorkspaceMessage(message, {
        includeStreamConversation: true,
      }).includes(conversationId)
    ) {
      candidateUuids.add(message.uuid);
    }
  }

  return [...candidateUuids]
    .filter(
      (messageUuid) =>
        !serverMessageUuids.has(messageUuid) &&
        (state.messageMutationRevisionById[messageUuid] ?? 0) > 0 &&
        (state.deletedMessageRevisionById[messageUuid] ?? 0) === 0,
    )
    .map((messageUuid) => state.messagesById[messageUuid])
    .filter(
      (message): message is MessengerMessage =>
        message != null && messageFitsWindowBounds(serverWindow, message, state.messagesById),
    );
}

function nextWindowRevision(window: WorkspaceConversationWindow | undefined): number {
  return (window?.revision ?? 0) + 1;
}

export const useWorkspaceMessageStore = create<WorkspaceMessageStoreState>((set) => ({
  ...createEmptyWorkspaceMessageData(),

  setOwner(ownerKey, preserveExisting) {
    set((state) => {
      if (state.ownerKey === ownerKey) {
        if (ownerKey != null || preserveExisting) return state;
        removedStreamUuids.clear();
        return createEmptyWorkspaceMessageData();
      }
      if (state.ownerKey == null && ownerKey != null && preserveExisting) {
        return { ...state, ownerKey };
      }
      removedStreamUuids.clear();
      return { ...createEmptyWorkspaceMessageData(), ownerKey };
    });
  },

  replaceConversationWindow(input) {
    logStoreAction("workspaceMessage", "replaceConversationWindow", {
      conversationId: input.conversationId,
      messages: input.messages.length,
    });
    let appliedRevision: number | null = null;
    set((state) => {
      const previousWindow = state.conversationWindowsById[input.conversationId];
      const currentRevision = previousWindow?.revision ?? 0;
      const expectedRevisionMatches =
        input.expectedRevision == null
          ? previousWindow == null
          : input.expectedRevision === currentRevision;
      if (!expectedRevisionMatches || isRemovedStreamConversation(input.conversationId))
        return state;

      const { messagesById, acceptedMessages } = mergeSnapshotMessages(
        state,
        keepMessagesOutsideRemovedStreams(input.messages),
        input.capturedMutationRevision,
      );
      const revision = nextWindowRevision(previousWindow);
      const serverWindow: WorkspaceConversationWindow = {
        mode: input.mode,
        anchorMessageUuid: input.anchorMessageUuid,
        messageUuids: mergeSortedWorkspaceMessageIds(
          EMPTY_WORKSPACE_MESSAGE_IDS,
          acceptedMessages,
          messagesById,
        ),
        beforePageMarker: input.markers.beforePageMarker,
        afterPageMarker: input.markers.afterPageMarker,
        revision,
      };
      const retainedLiveMessages = liveMessagesForReplacement(
        { ...state, messagesById },
        input.conversationId,
        previousWindow,
        serverWindow,
        input.capturedMutationRevision,
      );
      const window: WorkspaceConversationWindow = {
        ...serverWindow,
        messageUuids: mergeSortedWorkspaceMessageIds(
          serverWindow.messageUuids,
          retainedLiveMessages,
          messagesById,
        ),
      };
      appliedRevision = revision;
      return {
        messagesById,
        conversationWindowsById: {
          ...state.conversationWindowsById,
          [input.conversationId]: window,
        },
        messagesLoadingByConversationId: {
          ...state.messagesLoadingByConversationId,
          [input.conversationId]: false,
        },
        messagesErrorByConversationId: {
          ...state.messagesErrorByConversationId,
          [input.conversationId]: null,
        },
      };
    });
    return appliedRevision;
  },

  mergeConversationWindowPage(input) {
    logStoreAction("workspaceMessage", "mergeConversationWindowPage", {
      conversationId: input.conversationId,
      direction: input.direction,
      messages: input.messages.length,
    });
    let appliedRevision: number | null = null;
    set((state) => {
      const previousWindow = state.conversationWindowsById[input.conversationId];
      if (
        previousWindow?.revision !== input.expectedRevision ||
        previousWindow[input.direction === "before" ? "beforePageMarker" : "afterPageMarker"] !==
          input.expectedPageMarker ||
        isRemovedStreamConversation(input.conversationId)
      ) {
        return state;
      }

      const { messagesById, acceptedMessages } = mergeSnapshotMessages(
        state,
        keepMessagesOutsideRemovedStreams(input.messages),
        input.capturedMutationRevision,
      );
      const revision = nextWindowRevision(previousWindow);
      appliedRevision = revision;
      return {
        messagesById,
        conversationWindowsById: {
          ...state.conversationWindowsById,
          [input.conversationId]: {
            ...previousWindow,
            messageUuids: mergeSortedWorkspaceMessageIds(
              previousWindow.messageUuids,
              acceptedMessages,
              messagesById,
            ),
            beforePageMarker:
              input.direction === "before" ? input.pageMarker : previousWindow.beforePageMarker,
            afterPageMarker:
              input.direction === "after" ? input.pageMarker : previousWindow.afterPageMarker,
            revision,
          },
        },
      };
    });
    return appliedRevision;
  },

  applyLiveCreatedMessage(message) {
    if (removedStreamUuids.has(message.streamUuid)) return;
    logStoreAction("workspaceMessage", "applyLiveCreatedMessage", { messageUuid: message.uuid });
    set((state) => {
      const mutationRevision = state.messageMutationRevision + 1;
      const messagesById = {
        ...state.messagesById,
        [message.uuid]: mergeWorkspaceMessageSnapshot(state.messagesById[message.uuid], message),
      };
      let conversationWindowsById = state.conversationWindowsById;
      for (const conversationId of conversationBucketsForWorkspaceMessage(message, {
        includeStreamConversation: true,
      })) {
        const window = state.conversationWindowsById[conversationId];
        if (
          window == null ||
          !shouldInsertLiveMessageIntoWindow(window, message, state.messagesById)
        ) {
          continue;
        }
        if (conversationWindowsById === state.conversationWindowsById) {
          conversationWindowsById = { ...state.conversationWindowsById };
        }
        conversationWindowsById[conversationId] = {
          ...window,
          messageUuids: insertSortedWorkspaceMessageId(
            window.messageUuids,
            message,
            messagesById,
            state.messagesById[message.uuid],
          ),
          revision: nextWindowRevision(window),
        };
      }
      const deletedMessageRevisionById = { ...state.deletedMessageRevisionById };
      delete deletedMessageRevisionById[message.uuid];
      return {
        messagesById,
        conversationWindowsById,
        messageMutationRevision: mutationRevision,
        messageMutationRevisionById: {
          ...state.messageMutationRevisionById,
          [message.uuid]: mutationRevision,
        },
        deletedMessageRevisionById,
      };
    });
  },

  applyLiveKnownBodyMutation(message, capturedMutationRevision) {
    if (removedStreamUuids.has(message.streamUuid)) return false;
    logStoreAction("workspaceMessage", "applyLiveKnownBodyMutation", {
      messageUuid: message.uuid,
    });
    let applied = false;
    set((state) => {
      if (
        capturedMutationRevision != null &&
        ((state.messageMutationRevisionById[message.uuid] ?? 0) > capturedMutationRevision ||
          (state.deletedMessageRevisionById[message.uuid] ?? 0) > capturedMutationRevision)
      ) {
        return state;
      }
      const mutationRevision = state.messageMutationRevision + 1;
      const previousMessage = state.messagesById[message.uuid];
      applied = true;
      return {
        messagesById:
          previousMessage == null
            ? state.messagesById
            : {
                ...state.messagesById,
                [message.uuid]: mergeWorkspaceMessageSnapshot(previousMessage, message),
              },
        messageMutationRevision: mutationRevision,
        messageMutationRevisionById: {
          ...state.messageMutationRevisionById,
          [message.uuid]: mutationRevision,
        },
      };
    });
    return applied;
  },

  upsertMessageBodyFromSnapshot(message, capturedMutationRevision) {
    if (removedStreamUuids.has(message.streamUuid)) return false;
    let applied = false;
    set((state) => {
      if (
        (state.messageMutationRevisionById[message.uuid] ?? 0) > capturedMutationRevision ||
        (state.deletedMessageRevisionById[message.uuid] ?? 0) > capturedMutationRevision
      ) {
        return state;
      }
      applied = true;
      return {
        messagesById: {
          ...state.messagesById,
          [message.uuid]: mergeWorkspaceMessageSnapshot(state.messagesById[message.uuid], message),
        },
      };
    });
    return applied;
  },

  removeMessageFromSnapshot(messageUuid, capturedMutationRevision) {
    let applied = false;
    set((state) => {
      if (
        (state.messageMutationRevisionById[messageUuid] ?? 0) > capturedMutationRevision ||
        (state.deletedMessageRevisionById[messageUuid] ?? 0) > capturedMutationRevision
      ) {
        return state;
      }
      applied = true;
      const conversationWindowsById = { ...state.conversationWindowsById };
      for (const [conversationId, window] of Object.entries(state.conversationWindowsById)) {
        if (!window.messageUuids.includes(messageUuid)) continue;
        conversationWindowsById[conversationId] = {
          ...window,
          messageUuids: removeWorkspaceMessageId(window.messageUuids, messageUuid),
          revision: nextWindowRevision(window),
        };
      }
      const mutationRevision = state.messageMutationRevision + 1;
      const messagesById = { ...state.messagesById };
      delete messagesById[messageUuid];
      return {
        messagesById,
        conversationWindowsById,
        messageMutationRevision: mutationRevision,
        messageMutationRevisionById: {
          ...state.messageMutationRevisionById,
          [messageUuid]: mutationRevision,
        },
        deletedMessageRevisionById: {
          ...state.deletedMessageRevisionById,
          [messageUuid]: mutationRevision,
        },
      };
    });
    return applied;
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

  beginOptimisticOwnMessageReaction(messageUuid, emojiName, operation, requestId, currentUserUuid) {
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
      const previousReactionUserUuids = message.reactionUserUuidsByEmojiName[emojiName] ?? null;
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
      const nextReactionUserUuids = optimisticReactionUserUuids(
        previousReactionUserUuids,
        previousCount,
        operation,
        currentUserUuid,
      );

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
            optimisticReactionUserUuidsByEmojiName: {
              ...message.optimisticReactionUserUuidsByEmojiName,
              [emojiName]: nextReactionUserUuids == null ? null : [...nextReactionUserUuids],
            },
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
      const optimisticReactionUserUuidsByEmojiName = {
        ...message.optimisticReactionUserUuidsByEmojiName,
      };
      const hasUnreconciledOptimisticUsers = Object.hasOwn(
        optimisticReactionUserUuidsByEmojiName,
        emojiName,
      );
      delete optimisticReactionUserUuidsByEmojiName[emojiName];

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
            reactions: hasUnreconciledOptimisticUsers
              ? setReactionCount(message.reactions, emojiName, pendingAction.previousCount)
              : message.reactions,
            optimisticReactionUserUuidsByEmojiName:
              Object.keys(optimisticReactionUserUuidsByEmojiName).length > 0
                ? optimisticReactionUserUuidsByEmojiName
                : undefined,
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

  removeMessage(messageUuid) {
    logStoreAction("workspaceMessage", "removeMessage", { messageUuid });
    set((state) => {
      const conversationIds = Object.keys(state.conversationWindowsById);
      let conversationWindowsById = state.conversationWindowsById;
      for (const conversationId of conversationIds) {
        const window = state.conversationWindowsById[conversationId];
        if (!window?.messageUuids.includes(messageUuid)) continue;
        if (conversationWindowsById === state.conversationWindowsById) {
          conversationWindowsById = { ...state.conversationWindowsById };
        }
        conversationWindowsById[conversationId] = {
          ...window,
          messageUuids: removeWorkspaceMessageId(window.messageUuids, messageUuid),
          revision: nextWindowRevision(window),
        };
      }
      const mutationRevision = state.messageMutationRevision + 1;
      const messagesById = { ...state.messagesById };
      delete messagesById[messageUuid];
      return {
        messagesById,
        conversationWindowsById,
        messageMutationRevision: mutationRevision,
        messageMutationRevisionById: {
          ...state.messageMutationRevisionById,
          [messageUuid]: mutationRevision,
        },
        deletedMessageRevisionById: {
          ...state.deletedMessageRevisionById,
          [messageUuid]: mutationRevision,
        },
      };
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
            state.conversationWindowsById[conversationId]?.messageUuids ??
            EMPTY_WORKSPACE_MESSAGE_IDS
          ).includes(messageUuid),
        );
        if (!messageIsVisible) return state;
      }

      const mutationRevision = state.messageMutationRevision + 1;
      return {
        messagesById: {
          ...state.messagesById,
          [messageUuid]: {
            ...message,
            read: true,
          },
        },
        messageMutationRevision: mutationRevision,
        messageMutationRevisionById: {
          ...state.messageMutationRevisionById,
          [messageUuid]: mutationRevision,
        },
      };
    });
  },

  markMessagesRead(messageUuids, options) {
    logStoreAction("workspaceMessage", "markMessagesRead", { messages: messageUuids.length });
    if (messageUuids.length === 0) return;
    set((state) => {
      const nextMessagesById = { ...state.messagesById };
      const nextMutationRevisionById = { ...state.messageMutationRevisionById };
      const mutationRevision = state.messageMutationRevision + 1;
      let changed = false;
      for (const messageUuid of new Set(messageUuids)) {
        const message = state.messagesById[messageUuid];
        if (message == null || message.read) continue;
        if (
          options?.conversationIds != null &&
          !options.conversationIds.some((conversationId) =>
            (
              state.conversationWindowsById[conversationId]?.messageUuids ??
              EMPTY_WORKSPACE_MESSAGE_IDS
            ).includes(messageUuid),
          )
        ) {
          continue;
        }
        nextMessagesById[messageUuid] = { ...message, read: true };
        nextMutationRevisionById[messageUuid] = mutationRevision;
        changed = true;
      }
      return changed
        ? {
            messagesById: nextMessagesById,
            messageMutationRevision: mutationRevision,
            messageMutationRevisionById: nextMutationRevisionById,
          }
        : state;
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
          for (const candidateMessageUuid of state.conversationWindowsById[conversationId]
            ?.messageUuids ?? EMPTY_WORKSPACE_MESSAGE_IDS) {
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
            compareWorkspaceMessages(message, anchor) <= 0,
        );

      if (changedMessages.length === 0) return state;

      const nextMessagesById = { ...state.messagesById };
      const nextMutationRevisionById = { ...state.messageMutationRevisionById };
      const mutationRevision = state.messageMutationRevision + 1;
      for (const message of changedMessages) {
        nextMessagesById[message.uuid] = { ...message, read: true };
        nextMutationRevisionById[message.uuid] = mutationRevision;
      }

      changedMessages = changedMessages
        .map((message) => nextMessagesById[message.uuid])
        .filter((message): message is MessengerMessage => message != null);
      return {
        messagesById: nextMessagesById,
        messageMutationRevision: mutationRevision,
        messageMutationRevisionById: nextMutationRevisionById,
      };
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
      const nextMutationRevisionById = { ...state.messageMutationRevisionById };
      const mutationRevision = state.messageMutationRevision + 1;
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
        nextMutationRevisionById[message.uuid] = mutationRevision;
      }

      return change.projectedMessages.length === 0
        ? state
        : {
            messagesById: nextMessagesById,
            messageMutationRevision: mutationRevision,
            messageMutationRevisionById: nextMutationRevisionById,
          };
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
      let nextMutationRevisionById = state.messageMutationRevisionById;
      const mutationRevision = state.messageMutationRevision + 1;
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
          nextMutationRevisionById = { ...state.messageMutationRevisionById };
        }
        nextMessagesById[previousMessage.uuid] = previousMessage;
        nextMutationRevisionById[previousMessage.uuid] = mutationRevision;
      }
      return nextMessagesById === state.messagesById
        ? state
        : {
            messagesById: nextMessagesById,
            messageMutationRevision: mutationRevision,
            messageMutationRevisionById: nextMutationRevisionById,
          };
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

  removeMessagesForStream(streamUuid) {
    logStoreAction("workspaceMessage", "removeMessagesForStream", { streamUuid });
    removedStreamUuids.add(streamUuid);
    set((state) => {
      const removedConversationIds = new Set(
        [
          ...Object.keys(state.conversationWindowsById),
          ...Object.keys(state.messagesLoadingByConversationId),
          ...Object.keys(state.messagesErrorByConversationId),
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
        conversationWindowsById: omitConversationRecords(
          state.conversationWindowsById,
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
      };
    });
  },

  restoreMessagesForStream(streamUuid) {
    removedStreamUuids.delete(streamUuid);
  },

  clear() {
    logStoreAction("workspaceMessage", "clear", {});
    removedStreamUuids.clear();
    set((state) => ({ ...createEmptyWorkspaceMessageData(), ownerKey: state.ownerKey }));
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
    state.conversationWindowsById[conversationId]?.messageUuids ?? EMPTY_WORKSPACE_MESSAGE_IDS;
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

export function selectWorkspaceConversationWindow(
  state: WorkspaceMessageStoreState,
  conversationId: MessengerConversationId,
): WorkspaceConversationWindow | null {
  return state.conversationWindowsById[conversationId] ?? null;
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
  const nextPageMarker = state.conversationWindowsById[conversationId]?.beforePageMarker ?? null;
  const hasMore = nextPageMarker != null;

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
