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
}

export interface WorkspaceMessageBucketIndexOptions {
  includeStreamConversation?: boolean;
  conversationIds?: readonly MessengerConversationId[];
}

export interface WorkspaceScopedMessageMutationOptions {
  conversationIds?: readonly MessengerConversationId[];
}

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
  revision: number;
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

export interface WorkspaceConversationWindowPageMergeInput {
  conversationId: MessengerConversationId;
  expectedRevision: number;
  expectedPageMarker: string | null;
  capturedMutationRevision: number;
  direction: WorkspaceConversationWindowPageDirection;
  messages: readonly MessengerMessage[];
  pageMarker: string | null;
}

export interface WorkspaceConversationMessagesStatus {
  loading: boolean;
  error: string | null;
  nextPageMarker: string | null;
  hasMore: boolean;
}

export interface WorkspaceMessageStoreState extends WorkspaceMessageStoreData {
  setOwner: (ownerKey: string | null, preserveExisting: boolean) => void;
  replaceConversationWindow: (input: WorkspaceConversationWindowReplaceInput) => number | null;
  mergeConversationWindowPage: (input: WorkspaceConversationWindowPageMergeInput) => number | null;
  applyLiveCreatedMessage: (message: MessengerMessage) => void;
  applyLiveKnownBodyMutation: (
    message: MessengerMessage,
    capturedMutationRevision?: number,
  ) => boolean;
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
  beginOptimisticMessagesRead: (
    scope: WorkspaceMessageReadScope,
  ) => WorkspaceOptimisticMessageReadChange;
  rollbackOptimisticMessagesRead: (change: WorkspaceOptimisticMessageReadChange) => void;
  setMessagesLoading: (conversationId: MessengerConversationId, loading: boolean) => void;
  setMessagesError: (conversationId: MessengerConversationId, error: string | null) => void;
  removeMessagesForStream: (streamUuid: MessengerUuid) => void;
  restoreMessagesForStream: (streamUuid: MessengerUuid) => void;
  clear: () => void;
}
