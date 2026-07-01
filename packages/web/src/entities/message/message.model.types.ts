import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";

export interface WorkspaceMessageStoreData {
  messagesById: Record<MessengerUuid, MessengerMessage>;
  messageIdsByConversationId: Record<MessengerConversationId, MessengerUuid[]>;
  messagesLoadingByConversationId: Record<MessengerConversationId, boolean>;
  messagesErrorByConversationId: Record<MessengerConversationId, string | null>;
  nextPageMarkerByConversationId: Record<MessengerConversationId, string | null>;
  hasMoreByConversationId: Record<MessengerConversationId, boolean>;
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
  removeMessage: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => void;
  markMessageRead: (
    messageUuid: MessengerUuid,
    options?: WorkspaceScopedMessageMutationOptions,
  ) => void;
  setMessagesLoading: (conversationId: MessengerConversationId, loading: boolean) => void;
  setMessagesError: (conversationId: MessengerConversationId, error: string | null) => void;
  setConversationPagination: (
    conversationId: MessengerConversationId,
    pagination: WorkspaceConversationPagination,
  ) => void;
  clear: () => void;
}
