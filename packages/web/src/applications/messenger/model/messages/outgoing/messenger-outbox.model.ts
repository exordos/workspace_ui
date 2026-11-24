import { create } from "zustand";
import { createLogger, logStoreAction } from "~/shared/lib/logger";
import { encodeChatE2eePayload } from "../../crypto/chat-e2ee-payload-adapters.lib";
import { createMessengerMessageIdentity } from "../messenger-message-identity.lib";
import type {
  MessengerOutgoingMessage,
  MessengerOutgoingMessageDraft,
} from "./messenger-outbox.types";
import type { ChatEncryptedPayload } from "../../crypto/chat-e2ee.types";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "../../messenger.types";

const EMPTY_OUTGOING_MESSAGES: readonly MessengerOutgoingMessage[] = [];
const EMPTY_PLACEMENT_UUIDS: readonly MessengerUuid[] = [];
// Transient evidence for attempts awaiting their transport response.
const receiptObservers = new Map<string, Set<{ confirmed: boolean }>>();
// Завершение черновика живёт столько же, сколько операция в исходящих.
const outgoingConfirmations = new Map<string, () => void>();
const outboxLog = createLogger("messenger-outbox");

// Receipts are scoped to the same outgoing operation across transport attempts.
function outgoingReceiptKey(ownerKey: string, placementUuid: MessengerUuid): string {
  return `${ownerKey}\u0000${placementUuid}`;
}

// Watches for a verified receipt until the delivery attempt finishes.
export function trackMessengerOutgoingReceipt(ownerKey: string, placementUuid: MessengerUuid) {
  const key = outgoingReceiptKey(ownerKey, placementUuid);
  const observers = receiptObservers.get(key) ?? new Set<{ confirmed: boolean }>();
  const receiver = { confirmed: false };
  observers.add(receiver);
  receiptObservers.set(key, observers);
  return {
    get confirmed() {
      return receiver.confirmed;
    },
    release() {
      observers.delete(receiver);
      if (observers.size === 0 && receiptObservers.get(key) === observers)
        receiptObservers.delete(key);
    },
  };
}

export interface MessengerOutboxStoreState {
  outgoingMessagesByPlacementUuid: Record<string, MessengerOutgoingMessage>;
  outgoingMessagePlacementUuidsByConversationId: Record<
    MessengerConversationId,
    readonly MessengerUuid[]
  >;

  enqueueOutgoingMessage: (
    draft: MessengerOutgoingMessageDraft,
    onConfirmed?: () => void,
  ) => MessengerOutgoingMessage;
  markOutgoingMessageSending: (
    placementUuid: MessengerUuid,
    patch?: { markdown?: string; sourceMarkdown?: string },
  ) => void;
  markOutgoingMessageFailed: (placementUuid: MessengerUuid, error: string) => void;
  retainEncryptedFragments: (
    placementUuid: MessengerUuid,
    fragments: readonly ChatEncryptedPayload[],
    markdown: string,
  ) => void;
  retainEncryptedPayload: (placementUuid: MessengerUuid, payload: ChatEncryptedPayload) => void;
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

  enqueueOutgoingMessage(draft, onConfirmed) {
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
      ...(draft.encryption == null ? {} : { encryption: { ...draft.encryption } }),
    };

    logStoreAction("messengerOutbox", "enqueueOutgoingMessage", {
      placementUuid,
      ownerKey: draft.ownerKey,
      conversationId: draft.conversationId,
      status: draft.status,
    });
    // Подписчики могут увидеть и подтвердить строку прямо во время публикации.
    if (onConfirmed != null)
      outgoingConfirmations.set(outgoingReceiptKey(draft.ownerKey, placementUuid), onConfirmed);
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

  retainEncryptedPayload(placementUuid, payload) {
    const message = get().outgoingMessagesByPlacementUuid[placementUuid];
    const encryption = message?.encryption;
    if (message == null || encryption?.keyUuid !== payload.keyUuid) throw new Error("stale");
    if (encryption.payload != null) return;
    set((state) => ({
      outgoingMessagesByPlacementUuid: {
        ...state.outgoingMessagesByPlacementUuid,
        [placementUuid]: {
          ...message,
          encryption: {
            ...encryption,
            payload: { ...payload, content: { bytes: payload.content.bytes.slice() } },
          },
        },
      },
    }));
  },

  retainEncryptedFragments(placementUuid, fragments, markdown) {
    const message = get().outgoingMessagesByPlacementUuid[placementUuid];
    const encryption = message?.encryption;
    if (
      message == null ||
      encryption?.mode !== "fragments" ||
      fragments.some((payload) => payload.keyUuid !== encryption.keyUuid)
    )
      throw new Error("stale");
    if (encryption.preparedMarkdown != null) return;
    set((state) => ({
      outgoingMessagesByPlacementUuid: {
        ...state.outgoingMessagesByPlacementUuid,
        [placementUuid]: {
          ...message,
          encryption: { ...encryption, fragments, preparedMarkdown: markdown },
        },
      },
    }));
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
    const outgoing = get().outgoingMessagesByPlacementUuid[placementUuid];
    if (outgoing != null)
      outgoingConfirmations.delete(outgoingReceiptKey(outgoing.ownerKey, placementUuid));
    set((state) => removeOutgoingMessageFromState(state, placementUuid));
  },

  clearOwner(ownerKey) {
    logStoreAction("messengerOutbox", "clearOwner", { ownerKey });
    for (const key of receiptObservers.keys()) {
      if (key.startsWith(`${ownerKey}\u0000`)) receiptObservers.delete(key);
    }
    set((state) => {
      const nextMessagesByPlacementUuid: Record<string, MessengerOutgoingMessage> = {};
      let nextPlacementUuidsByConversationId = state.outgoingMessagePlacementUuidsByConversationId;

      for (const message of Object.values(state.outgoingMessagesByPlacementUuid)) {
        if (message.ownerKey === ownerKey) {
          outgoingConfirmations.delete(outgoingReceiptKey(ownerKey, message.placementUuid));
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
    outgoingConfirmations.clear();
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

export function isMessengerOutgoingMessageReceipt(
  outgoing: MessengerOutgoingMessage,
  message: MessengerMessage,
): boolean {
  const encryption = outgoing.encryption;
  const preparedPayload =
    encryption?.payload == null ? null : encodeChatE2eePayload(encryption.payload);
  return (
    outgoing.placementUuid === message.uuid &&
    outgoing.projectId === message.projectId &&
    outgoing.streamUuid === message.streamUuid &&
    outgoing.topicUuid === message.topicUuid &&
    outgoing.authorUuid === message.authorUuid &&
    (encryption == null ||
      (encryption.mode === "fragments"
        ? message.payload.kind === "markdown" &&
          encryption.preparedMarkdown != null &&
          message.payload.content === encryption.preparedMarkdown
        : message.payload.kind === "e2ee" &&
          message.payload.keyUuid === encryption.keyUuid &&
          preparedPayload?.kind === "e2ee" &&
          message.payload.content === preparedPayload.content))
  );
}

export function settleMessengerOutgoingMessage(
  ownerKey: string,
  message: MessengerMessage,
): boolean {
  const state = useMessengerOutboxStore.getState();
  const outgoingMessage = state.outgoingMessagesByPlacementUuid[message.uuid];
  if (
    outgoingMessage?.ownerKey !== ownerKey ||
    !isMessengerOutgoingMessageReceipt(outgoingMessage, message)
  )
    return false;

  // Only an authoritative receipt proves delivery, even if the body is later edited or deleted.
  const observers = receiptObservers.get(outgoingReceiptKey(ownerKey, message.uuid));
  if (observers != null) {
    for (const receiver of observers) receiver.confirmed = true;
  }
  const onConfirmed = outgoingConfirmations.get(outgoingReceiptKey(ownerKey, message.uuid));
  state.removeOutgoingMessage(message.uuid);
  try {
    onConfirmed?.();
  } catch (error) {
    // Завершение черновика не может отменить приём сообщения или курсора.
    outboxLog.warn("Outgoing confirmation effect failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
  }
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
