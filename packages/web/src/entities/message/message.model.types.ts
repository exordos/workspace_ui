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
  messagesById: Record<MessengerUuid, MessengerMessage>;
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>;
  messagesLoadingByConversationId: Record<MessengerConversationId, boolean>;
  messagesErrorByConversationId: Record<MessengerConversationId, string | null>;
  nextPageMarkerByConversationId: Record<MessengerConversationId, string | null>;
  hasMoreByConversationId: Record<MessengerConversationId, boolean>;
  beforePageMarkerByConversationId: Record<MessengerConversationId, string | null>;
  afterPageMarkerByConversationId: Record<MessengerConversationId, string | null>;
}

export interface WorkspaceMessageBucketIndexOptions {
  includeStreamConversation?: boolean;
  conversationIds?: readonly MessengerConversationId[];
}

export interface WorkspaceScopedMessageMutationOptions {
  conversationIds?: readonly MessengerConversationId[];
}

export interface WorkspaceMessageEditPatch {
  markdown: string;
  updatedAt?: string;
}

export interface WorkspaceConversationPagination {
  nextPageMarker: string | null;
  hasMore: boolean;
}

export interface WorkspaceConversationWindowMarkers {
  beforePageMarker: string | null;
  afterPageMarker: string | null;
}

export interface WorkspaceConversationMessagesStatus {
  loading: boolean;
  error: string | null;
  nextPageMarker: string | null;
  hasMore: boolean;
}

export interface WorkspaceMessageStoreState extends WorkspaceMessageStoreData {
  replaceOrMergeConversationMessagesPage: (
    conversationId: MessengerConversationId,
    messages: MessengerMessage[],
  ) => void;
  replaceConversationMessagesWindow: (
    conversationId: MessengerConversationId,
    messages: MessengerMessage[],
  ) => void;
  mergeConversationMessagesPage: (
    conversationId: MessengerConversationId,
    messages: MessengerMessage[],
  ) => void;
  indexMessageIntoConversationBuckets: (
    message: MessengerMessage,
    options?: WorkspaceMessageBucketIndexOptions,
  ) => void;
  upsertMessage: (message: MessengerMessage) => void;
  upsertMessageBody: (message: MessengerMessage) => void;
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
  removeMessage: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => void;
  markMessageRead: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => void;
  markMessagesReadUpTo: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => MessengerMessage[];
  setMessagesLoading: (conversationId: MessengerConversationId, loading: boolean) => void;
  setMessagesError: (conversationId: MessengerConversationId, error: string | null) => void;
  setConversationPagination: (
    conversationId: MessengerConversationId,
    pagination: WorkspaceConversationPagination,
  ) => void;
  setConversationWindowMarkers: (
    conversationId: MessengerConversationId,
    markers: WorkspaceConversationWindowMarkers,
  ) => void;
  clear: () => void;
}
