import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { createMessengerMessageIdentity } from "./messenger-message-identity.lib";
import type {
  MessengerOutgoingMessage,
  MessengerOutgoingMessageDraft,
} from "./messenger-outbox.types";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

const EMPTY_OUTGOING_MESSAGES: readonly MessengerOutgoingMessage[] = [];
const EMPTY_PLACEMENT_UUIDS: readonly MessengerUuid[] = [];

export interface MessengerOutboxStoreState {
  outgoingMessagesByPlacementUuid: Record<string, MessengerOutgoingMessage>;
  outgoingMessagePlacementUuidsByConversationId: Record<
    MessengerConversationId,
    readonly MessengerUuid[]
  >;

  enqueueOutgoingMessage: (draft: MessengerOutgoingMessageDraft) => MessengerOutgoingMessage;
  markOutgoingMessageSending: (
    placementUuid: MessengerUuid,
    patch?: { markdown?: string; sourceMarkdown?: string },
  ) => void;
  markOutgoingMessageFailed: (placementUuid: MessengerUuid, error: string) => void;
  removeOutgoingMessage: (placementUuid: MessengerUuid) => void;
  clearOwner: (ownerKey: string) => void;
  clear: () => void;
}

function appendPlacementUuid(
  placementUuidsByConversationId: Record<MessengerConversationId, readonly MessengerUuid[]>,
  conversationId: MessengerConversationId,
  placementUuid: MessengerUuid,
): Record<MessengerConversationId, readonly MessengerUuid[]> {
  const previousPlacementUuids =
    placementUuidsByConversationId[conversationId] ?? EMPTY_PLACEMENT_UUIDS;
  if (previousPlacementUuids.includes(placementUuid)) return placementUuidsByConversationId;

  return {
    ...placementUuidsByConversationId,
    [conversationId]: [...previousPlacementUuids, placementUuid],
  };
}

function removePlacementUuid(
  placementUuidsByConversationId: Record<MessengerConversationId, readonly MessengerUuid[]>,
  conversationId: MessengerConversationId,
  placementUuid: MessengerUuid,
): Record<MessengerConversationId, readonly MessengerUuid[]> {
  const previousPlacementUuids = placementUuidsByConversationId[conversationId];
  if (previousPlacementUuids?.includes(placementUuid) !== true)
    return placementUuidsByConversationId;

  const nextPlacementUuids = previousPlacementUuids.filter(
    (candidate) => candidate !== placementUuid,
  );
  const nextPlacementUuidsByConversationId = { ...placementUuidsByConversationId };
  if (nextPlacementUuids.length === 0) {
    delete nextPlacementUuidsByConversationId[conversationId];
  } else {
    nextPlacementUuidsByConversationId[conversationId] = nextPlacementUuids;
  }
  return nextPlacementUuidsByConversationId;
}

function removeOutgoingMessageFromState(
  state: Pick<
    MessengerOutboxStoreState,
    "outgoingMessagesByPlacementUuid" | "outgoingMessagePlacementUuidsByConversationId"
  >,
  placementUuid: MessengerUuid,
): Pick<
  MessengerOutboxStoreState,
  "outgoingMessagesByPlacementUuid" | "outgoingMessagePlacementUuidsByConversationId"
> {
  const message = state.outgoingMessagesByPlacementUuid[placementUuid];
  if (message == null) return state;

  const nextMessagesByPlacementUuid = { ...state.outgoingMessagesByPlacementUuid };
  delete nextMessagesByPlacementUuid[placementUuid];

  return {
    outgoingMessagesByPlacementUuid: nextMessagesByPlacementUuid,
    outgoingMessagePlacementUuidsByConversationId: removePlacementUuid(
      state.outgoingMessagePlacementUuidsByConversationId,
      message.conversationId,
      placementUuid,
    ),
  };
}

function createEmptyOutboxState(): Pick<
  MessengerOutboxStoreState,
  "outgoingMessagesByPlacementUuid" | "outgoingMessagePlacementUuidsByConversationId"
> {
  return {
    outgoingMessagesByPlacementUuid: {},
    outgoingMessagePlacementUuidsByConversationId: {},
  };
}

export const useMessengerOutboxStore = create<MessengerOutboxStoreState>((set, get) => ({
  ...createEmptyOutboxState(),

  enqueueOutgoingMessage(draft) {
    const { canonicalMessageUuid, placementUuid } = createMessengerMessageIdentity(draft.topicUuid);
    const createdAt = draft.createdAt ?? new Date().toISOString();
    const message: MessengerOutgoingMessage = {
      canonicalMessageUuid,
      placementUuid,
      ownerKey: draft.ownerKey,
      conversationId: draft.conversationId,
      projectId: draft.projectId,
      streamUuid: draft.streamUuid,
      topicUuid: draft.topicUuid,
      authorUuid: draft.authorUuid,
      markdown: draft.markdown,
      sourceMarkdown: draft.sourceMarkdown ?? draft.markdown,
      status: draft.status,
      createdAt,
      updatedAt: createdAt,
      attempt: 1,
      error: null,
      includeStreamConversation: draft.includeStreamConversation,
    };

    logStoreAction("messengerOutbox", "enqueueOutgoingMessage", {
      placementUuid,
      ownerKey: draft.ownerKey,
      conversationId: draft.conversationId,
      status: draft.status,
    });
    set((state) => ({
      outgoingMessagesByPlacementUuid: {
        ...state.outgoingMessagesByPlacementUuid,
        [placementUuid]: message,
      },
      outgoingMessagePlacementUuidsByConversationId: appendPlacementUuid(
        state.outgoingMessagePlacementUuidsByConversationId,
        draft.conversationId,
        placementUuid,
      ),
    }));
    return get().outgoingMessagesByPlacementUuid[placementUuid] ?? message;
  },

  markOutgoingMessageSending(placementUuid, patch = {}) {
    logStoreAction("messengerOutbox", "markOutgoingMessageSending", { placementUuid });
    set((state) => {
      const message = state.outgoingMessagesByPlacementUuid[placementUuid];
      if (message == null) return state;
      const nextMessage: MessengerOutgoingMessage = {
        ...message,
        status: "sending",
        markdown: patch.markdown ?? message.markdown,
        sourceMarkdown: patch.sourceMarkdown ?? patch.markdown ?? message.sourceMarkdown,
        updatedAt: new Date().toISOString(),
        attempt: message.status === "failed" ? message.attempt + 1 : message.attempt,
        error: null,
      };
      return {
        outgoingMessagesByPlacementUuid: {
          ...state.outgoingMessagesByPlacementUuid,
          [placementUuid]: nextMessage,
        },
      };
    });
  },

  markOutgoingMessageFailed(placementUuid, error) {
    logStoreAction("messengerOutbox", "markOutgoingMessageFailed", { placementUuid });
    set((state) => {
      const message = state.outgoingMessagesByPlacementUuid[placementUuid];
      if (message == null) return state;

      return {
        outgoingMessagesByPlacementUuid: {
          ...state.outgoingMessagesByPlacementUuid,
          [placementUuid]: {
            ...message,
            status: "failed",
            updatedAt: new Date().toISOString(),
            error,
          },
        },
      };
    });
  },

  removeOutgoingMessage(placementUuid) {
    logStoreAction("messengerOutbox", "removeOutgoingMessage", { placementUuid });
    set((state) => removeOutgoingMessageFromState(state, placementUuid));
  },

  clearOwner(ownerKey) {
    logStoreAction("messengerOutbox", "clearOwner", { ownerKey });
    set((state) => {
      const nextMessagesByPlacementUuid: Record<string, MessengerOutgoingMessage> = {};
      let nextPlacementUuidsByConversationId = state.outgoingMessagePlacementUuidsByConversationId;

      for (const message of Object.values(state.outgoingMessagesByPlacementUuid)) {
        if (message.ownerKey === ownerKey) {
          nextPlacementUuidsByConversationId = removePlacementUuid(
            nextPlacementUuidsByConversationId,
            message.conversationId,
            message.placementUuid,
          );
          continue;
        }
        nextMessagesByPlacementUuid[message.placementUuid] = message;
      }

      return {
        outgoingMessagesByPlacementUuid: nextMessagesByPlacementUuid,
        outgoingMessagePlacementUuidsByConversationId: nextPlacementUuidsByConversationId,
      };
    });
  },

  clear() {
    logStoreAction("messengerOutbox", "clear", {});
    set(createEmptyOutboxState());
  },
}));

export function selectMessengerOutgoingMessagesForConversation(
  state: Pick<
    MessengerOutboxStoreState,
    "outgoingMessagesByPlacementUuid" | "outgoingMessagePlacementUuidsByConversationId"
  >,
  ownerKey: string | null | undefined,
  conversationId: MessengerConversationId | null | undefined,
): readonly MessengerOutgoingMessage[] {
  if (ownerKey == null || conversationId == null) return EMPTY_OUTGOING_MESSAGES;

  const placementUuids = state.outgoingMessagePlacementUuidsByConversationId[conversationId];
  if (placementUuids == null || placementUuids.length === 0) return EMPTY_OUTGOING_MESSAGES;

  const messages = placementUuids
    .map((placementUuid) => state.outgoingMessagesByPlacementUuid[placementUuid])
    .filter((message): message is MessengerOutgoingMessage => message?.ownerKey === ownerKey);

  return messages.length === 0 ? EMPTY_OUTGOING_MESSAGES : messages;
}

export function settleMessengerOutgoingMessage(
  ownerKey: string,
  message: MessengerMessage,
): boolean {
  const state = useMessengerOutboxStore.getState();
  const outgoingMessage = state.outgoingMessagesByPlacementUuid[message.uuid];
  if (
    outgoingMessage?.ownerKey !== ownerKey ||
    outgoingMessage.projectId !== message.projectId ||
    outgoingMessage.streamUuid !== message.streamUuid ||
    outgoingMessage.topicUuid !== message.topicUuid ||
    outgoingMessage.authorUuid !== message.authorUuid
  ) {
    return false;
  }

  state.removeOutgoingMessage(message.uuid);
  return true;
}

export function settleMessengerOutgoingMessages(
  ownerKey: string,
  messages: readonly MessengerMessage[],
): void {
  for (const message of messages) {
    settleMessengerOutgoingMessage(ownerKey, message);
  }
}
