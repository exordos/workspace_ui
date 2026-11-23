import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerPendingOwnReactionOperation,
  MessengerOwnReactionProjectionRow,
  MessengerOwnReactionUuidsByName,
  MessengerReactionCountsByName,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";

export interface WorkspaceMessageStoreData {
  ownerKey: string | null;
  messagesById: Record<MessengerUuid, MessengerMessage>;
  conversationWindowsById: Record<MessengerConversationId, WorkspaceConversationWindow>;
  messagesLoadingByConversationId: Record<MessengerConversationId, boolean>;
  messagesErrorByConversationId: Record<MessengerConversationId, string | null>;
  messageMutationRevision: number;
  messageMutationRevisionById: Record<MessengerUuid, number>;
  deletedMessageRevisionById: Record<MessengerUuid, number>;
  messagePlacementRevisionById: Record<MessengerUuid, number>; // Last move or removal of a UUID.
}

export interface WorkspaceMessageBucketIndexOptions {
  includeStreamConversation?: boolean;
  conversationIds?: readonly MessengerConversationId[];
}

export interface WorkspaceScopedMessageMutationOptions {
  conversationIds?: readonly MessengerConversationId[];
}

// The server supplies the topic and message order even when the anchor has since moved.
export type WorkspaceMessageReadBoundaryAnchor = Pick<
  MessengerMessage,
  "uuid" | "streamUuid" | "topicUuid" | "createdAt"
>;

export interface WorkspaceMessageReadScope {
  streamUuid: MessengerUuid;
  topicUuid?: MessengerUuid;
}

export interface WorkspaceOptimisticMessageReadChange {
  previousMessages: readonly MessengerMessage[];
  projectedMessages: readonly MessengerMessage[];
}

export interface WorkspaceMessageEditPatch {
  markdown: string;
  updatedAt?: string;
}

export interface WorkspaceConversationWindowMarkers {
  beforePageMarker: string | null;
  afterPageMarker: string | null;
}

export type WorkspaceConversationWindowMode = "tail" | "around-anchor";

export interface WorkspaceConversationWindow {
  mode: WorkspaceConversationWindowMode;
  anchorMessageUuid: MessengerUuid | null;
  messageUuids: MessengerUuid[];
  beforePageMarker: string | null;
  afterPageMarker: string | null;
  revision: number; // Ревизия полного набора строк и маркеров.
  generation: symbol; // Новая идентичность для каждой полной установки окна.
}

export interface WorkspaceConversationWindowReplaceInput {
  conversationId: MessengerConversationId;
  expectedRevision: number | null;
  capturedMutationRevision: number;
  mode: WorkspaceConversationWindowMode;
  anchorMessageUuid: MessengerUuid | null;
  messages: readonly MessengerMessage[];
  markers: WorkspaceConversationWindowMarkers;
}

export type WorkspaceConversationWindowPageDirection = "before" | "after";

// Снимок выбранной границы. Изменения противоположного края не влияют на него.
export interface WorkspaceConversationWindowBoundary {
  generation: symbol; // Идентичность установленного окна.
  direction: WorkspaceConversationWindowPageDirection; // Сторона запрошенной страницы.
  pageMarker: string; // Серверный маркер на момент запроса.
  edgeMessageUuid: MessengerUuid | null; // Крайняя строка с этой стороны.
}

// Страница дополняет окно только при актуальном снимке границы.
export interface WorkspaceConversationWindowPageMergeInput {
  conversationId: MessengerConversationId; // Разговор, чьё окно расширяется.
  boundary: WorkspaceConversationWindowBoundary; // Граница на момент начала запроса.
  capturedMutationRevision: number; // Ревизия тел перед запросом.
  messages: readonly MessengerMessage[]; // Полученные строки.
  pageMarker: string | null; // Следующий серверный маркер с той же стороны.
}

export interface WorkspaceConversationMessagesStatus {
  loading: boolean;
  error: string | null;
  nextPageMarker: string | null;
  hasMore: boolean;
}

export interface WorkspaceMessageStoreState extends WorkspaceMessageStoreData {
  setOwner: (ownerKey: string | null, preserveExisting: boolean) => void;
  // Возвращают установленное окно, в том числе если подписчик сразу заменил его.
  replaceConversationWindow: (
    input: WorkspaceConversationWindowReplaceInput,
  ) => WorkspaceConversationWindow | null;
  mergeConversationWindowPage: (
    input: WorkspaceConversationWindowPageMergeInput,
  ) => WorkspaceConversationWindow | null;
  applyLiveCreatedMessage: (message: MessengerMessage) => void;
  applyLiveCreatedMessages: (messages: readonly MessengerMessage[]) => void;
  // Returns the merged body, null for a recorded unknown UUID, or false if rejected.
  applyLiveKnownBodyMutation: (
    message: MessengerMessage,
    capturedMutationRevision?: number,
    source?: "poll-response",
  ) => MessengerMessage | null | false;
  upsertMessageBodyFromSnapshot: (
    message: MessengerMessage,
    capturedMutationRevision: number,
  ) => boolean;
  removeMessageFromSnapshot: (
    messageUuid: MessengerUuid,
    capturedMutationRevision: number,
  ) => boolean;
  applyMessageEdit: (messageUuid: MessengerUuid, patch: WorkspaceMessageEditPatch) => void;
  applyOwnMessageReactions: (
    messageUuid: MessengerUuid,
    projection: MessengerOwnReactionUuidsByName | readonly MessengerOwnReactionProjectionRow[],
  ) => void;
  setOwnMessageReaction: (
    messageUuid: MessengerUuid,
    emojiName: string,
    reactionUuid: MessengerUuid,
  ) => void;
  removeOwnMessageReaction: (messageUuid: MessengerUuid, emojiName: string) => void;
  beginOptimisticOwnMessageReaction: (
    messageUuid: MessengerUuid,
    emojiName: string,
    operation: MessengerPendingOwnReactionOperation,
    requestId: string,
    currentUserUuid: MessengerUuid,
  ) => void;
  settleOptimisticOwnMessageReaction: (
    messageUuid: MessengerUuid,
    emojiName: string,
    requestId: string,
  ) => void;
  rollbackOptimisticOwnMessageReaction: (
    messageUuid: MessengerUuid,
    emojiName: string,
    requestId: string,
  ) => void;
  applyMessageReactionAggregate: (
    messageUuid: MessengerUuid,
    aggregate: MessengerReactionCountsByName,
  ) => void;
  removeMessage: (messageUuid: MessengerUuid) => void;
  markMessageRead: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => void;
  markMessagesRead: (
    messageUuids: readonly MessengerUuid[],
    options?: WorkspaceScopedMessageMutationOptions,
  ) => void;
  markMessagesReadUpTo: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => MessengerMessage[];
  confirmMessagesReadUpTo: (
    anchor: WorkspaceMessageReadBoundaryAnchor,
    options: WorkspaceScopedMessageMutationOptions,
    capturedMutationRevision?: number,
  ) => MessengerMessage[];
  beginOptimisticMessagesRead: (
    scope: WorkspaceMessageReadScope,
  ) => WorkspaceOptimisticMessageReadChange;
  beginOptimisticMessagesReadUpTo: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => WorkspaceOptimisticMessageReadChange;
  rollbackOptimisticMessagesRead: (change: WorkspaceOptimisticMessageReadChange) => void;
  setMessagesLoading: (conversationId: MessengerConversationId, loading: boolean) => void;
  setMessagesError: (conversationId: MessengerConversationId, error: string | null) => void;
  removeMessagesForStream: (streamUuid: MessengerUuid) => void;
  restoreMessagesForStream: (streamUuid: MessengerUuid) => void;
  clear: () => void;
}
