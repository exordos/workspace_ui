import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type {
  MessengerOutgoingMessage,
  MessengerOutgoingMessageDraft,
} from "./messenger-outbox.types";
import type { MessengerConversationId } from "./messenger.types";

const EMPTY_OUTGOING_MESSAGES: readonly MessengerOutgoingMessage[] = [];
const EMPTY_LOCAL_IDS: readonly string[] = [];

let nextOutgoingMessageOrdinal = 1;

export interface MessengerOutboxStoreState {
  outgoingMessagesByLocalId: Record<string, MessengerOutgoingMessage>;
  outgoingMessageLocalIdsByConversationId: Record<MessengerConversationId, readonly string[]>;

  enqueueOutgoingMessage: (draft: MessengerOutgoingMessageDraft) => MessengerOutgoingMessage;
  markOutgoingMessageUploading: (localId: string) => void;
  markOutgoingMessageSending: (
    localId: string,
    patch?: { markdown?: string; sourceMarkdown?: string; files?: readonly File[] | null },
  ) => void;
  markOutgoingMessageFailed: (localId: string, error: string) => void;
  removeOutgoingMessage: (localId: string) => void;
  clearOwner: (ownerKey: string) => void;
  clear: () => void;
}

function createOutgoingMessageLocalId(): string {
  const ordinal = nextOutgoingMessageOrdinal;
  nextOutgoingMessageOrdinal += 1;
  return `outgoing:${Date.now().toString(36)}:${ordinal.toString(36)}`;
}

function appendLocalId(
  idsByConversationId: Record<MessengerConversationId, readonly string[]>,
  conversationId: MessengerConversationId,
  localId: string,
): Record<MessengerConversationId, readonly string[]> {
  const previousIds = idsByConversationId[conversationId] ?? EMPTY_LOCAL_IDS;
  if (previousIds.includes(localId)) return idsByConversationId;

  return {
    ...idsByConversationId,
    [conversationId]: [...previousIds, localId],
  };
}

function removeLocalId(
  idsByConversationId: Record<MessengerConversationId, readonly string[]>,
  conversationId: MessengerConversationId,
  localId: string,
): Record<MessengerConversationId, readonly string[]> {
  const previousIds = idsByConversationId[conversationId];
  if (previousIds?.includes(localId) !== true) return idsByConversationId;

  const nextIds = previousIds.filter((candidate) => candidate !== localId);
  const nextIdsByConversationId = { ...idsByConversationId };
  if (nextIds.length === 0) {
    delete nextIdsByConversationId[conversationId];
  } else {
    nextIdsByConversationId[conversationId] = nextIds;
  }
  return nextIdsByConversationId;
}

function removeOutgoingMessageFromState(
  state: Pick<
    MessengerOutboxStoreState,
    "outgoingMessagesByLocalId" | "outgoingMessageLocalIdsByConversationId"
  >,
  localId: string,
): Pick<
  MessengerOutboxStoreState,
  "outgoingMessagesByLocalId" | "outgoingMessageLocalIdsByConversationId"
> {
  const message = state.outgoingMessagesByLocalId[localId];
  if (message == null) return state;

  const nextMessagesByLocalId = { ...state.outgoingMessagesByLocalId };
  delete nextMessagesByLocalId[localId];

  return {
    outgoingMessagesByLocalId: nextMessagesByLocalId,
    outgoingMessageLocalIdsByConversationId: removeLocalId(
      state.outgoingMessageLocalIdsByConversationId,
      message.conversationId,
      localId,
    ),
  };
}

function createEmptyOutboxState(): Pick<
  MessengerOutboxStoreState,
  "outgoingMessagesByLocalId" | "outgoingMessageLocalIdsByConversationId"
> {
  return {
    outgoingMessagesByLocalId: {},
    outgoingMessageLocalIdsByConversationId: {},
  };
}

export const useMessengerOutboxStore = create<MessengerOutboxStoreState>((set, get) => ({
  ...createEmptyOutboxState(),

  enqueueOutgoingMessage(draft) {
    const localId = createOutgoingMessageLocalId();
    const createdAt = draft.createdAt ?? new Date().toISOString();
    const message: MessengerOutgoingMessage = {
      localId,
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
      files: draft.files,
    };

    logStoreAction("messengerOutbox", "enqueueOutgoingMessage", {
      localId,
      ownerKey: draft.ownerKey,
      conversationId: draft.conversationId,
      status: draft.status,
      hasFiles: draft.files != null && draft.files.length > 0,
    });
    set((state) => ({
      outgoingMessagesByLocalId: {
        ...state.outgoingMessagesByLocalId,
        [localId]: message,
      },
      outgoingMessageLocalIdsByConversationId: appendLocalId(
        state.outgoingMessageLocalIdsByConversationId,
        draft.conversationId,
        localId,
      ),
    }));
    return get().outgoingMessagesByLocalId[localId] ?? message;
  },

  markOutgoingMessageUploading(localId) {
    logStoreAction("messengerOutbox", "markOutgoingMessageUploading", { localId });
    set((state) => {
      const message = state.outgoingMessagesByLocalId[localId];
      if (message == null) return state;

      // Повторная отправка после ошибки загрузки должна остаться той же строкой:
      // ревьюер видит один локальный bubble, а не новый дубль ниже в списке.
      return {
        outgoingMessagesByLocalId: {
          ...state.outgoingMessagesByLocalId,
          [localId]: {
            ...message,
            status: "uploading",
            updatedAt: new Date().toISOString(),
            attempt: message.status === "failed" ? message.attempt + 1 : message.attempt,
            error: null,
          },
        },
      };
    });
  },

  markOutgoingMessageSending(localId, patch = {}) {
    logStoreAction("messengerOutbox", "markOutgoingMessageSending", { localId });
    set((state) => {
      const message = state.outgoingMessagesByLocalId[localId];
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
      if (patch.files !== undefined) {
        nextMessage.files = patch.files ?? undefined;
      }

      return {
        outgoingMessagesByLocalId: {
          ...state.outgoingMessagesByLocalId,
          [localId]: nextMessage,
        },
      };
    });
  },

  markOutgoingMessageFailed(localId, error) {
    logStoreAction("messengerOutbox", "markOutgoingMessageFailed", { localId });
    set((state) => {
      const message = state.outgoingMessagesByLocalId[localId];
      if (message == null) return state;

      return {
        outgoingMessagesByLocalId: {
          ...state.outgoingMessagesByLocalId,
          [localId]: {
            ...message,
            status: "failed",
            updatedAt: new Date().toISOString(),
            error,
          },
        },
      };
    });
  },

  removeOutgoingMessage(localId) {
    logStoreAction("messengerOutbox", "removeOutgoingMessage", { localId });
    set((state) => removeOutgoingMessageFromState(state, localId));
  },

  clearOwner(ownerKey) {
    logStoreAction("messengerOutbox", "clearOwner", { ownerKey });
    set((state) => {
      const nextMessagesByLocalId: Record<string, MessengerOutgoingMessage> = {};
      let nextIdsByConversationId = state.outgoingMessageLocalIdsByConversationId;

      for (const message of Object.values(state.outgoingMessagesByLocalId)) {
        if (message.ownerKey === ownerKey) {
          nextIdsByConversationId = removeLocalId(
            nextIdsByConversationId,
            message.conversationId,
            message.localId,
          );
          continue;
        }
        nextMessagesByLocalId[message.localId] = message;
      }

      return {
        outgoingMessagesByLocalId: nextMessagesByLocalId,
        outgoingMessageLocalIdsByConversationId: nextIdsByConversationId,
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
    "outgoingMessagesByLocalId" | "outgoingMessageLocalIdsByConversationId"
  >,
  ownerKey: string | null | undefined,
  conversationId: MessengerConversationId | null | undefined,
): readonly MessengerOutgoingMessage[] {
  if (ownerKey == null || conversationId == null) return EMPTY_OUTGOING_MESSAGES;

  const localIds = state.outgoingMessageLocalIdsByConversationId[conversationId];
  if (localIds == null || localIds.length === 0) return EMPTY_OUTGOING_MESSAGES;

  const messages = localIds
    .map((localId) => state.outgoingMessagesByLocalId[localId])
    .filter((message): message is MessengerOutgoingMessage => message?.ownerKey === ownerKey);

  return messages.length === 0 ? EMPTY_OUTGOING_MESSAGES : messages;
}
