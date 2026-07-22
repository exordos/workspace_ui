import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolver,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type {
  WorkspaceMessageConversationReference,
  WorkspaceMessageMediaGalleryOpenRequest,
  WorkspaceMessageListPresentation,
} from "~/widgets/workspace-message-list/workspace-message-list.types";

export type WorkspaceChatMessagesLoadErrorKind = "initial" | "refresh";

export interface ChatPageWorkspaceMessageListSectionProps {
  messagesLoading: boolean;
  hasInitialPayload: boolean;
  messages: readonly MessengerMessage[];
  outgoingMessages?: readonly MessengerOutgoingMessage[];
  resolveServerMessageRenderKey?: (messageUuid: MessengerUuid) => string | undefined;
  currentUserUuid: MessengerUuid;
  conversationId: MessengerConversationId;
  scrollToBottomKey: string | undefined;
  onLoadOlder: () => void;
  isLoadingOlder: boolean;
  isLoadingNewer: boolean;
  onLoadNewer: () => void;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  firstUnreadUuid: MessengerUuid | undefined;
  unreadCount: number;
  focusedMessageUuid: MessengerUuid | null | undefined;
  selectionMode?: boolean;
  selectedMessageUuids?: ReadonlySet<MessengerUuid>;
  onUnreadMessagesVisible: (messageUuids: MessengerUuid[]) => void;
  onUnreadMessagesAtBottom: (messageUuids: MessengerUuid[]) => void;
  onReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onAddReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onForwardMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onOpenMessageInChat?: (messageUuid: MessengerUuid) => void;
  onOpenWorkspaceReference?: (reference: WorkspaceMessageConversationReference) => void;
  jitsiServerBaseUrl?: string | null;
  jitsiLocationName?: string | null;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onOpenMentionUser?: (userUuid: MessengerUuid) => void;
  onToggleMessageSelection?: (messageUuid: MessengerUuid) => void;
  onEditMessage?: (messageUuid: MessengerUuid) => void;
  onRequestDeleteMessage?: (messageUuid: MessengerUuid) => void;
  onCopyMessageText?: (messageUuid: MessengerUuid, text: string) => void | Promise<void>;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
  onDownloadFile?: (file: WorkspaceMessageFileReference) => void | Promise<void>;
  onLoadWorkspaceFilePreview?: (
    file: WorkspaceMessageFileReference,
    signal: AbortSignal,
  ) => Promise<Blob>;
  onOpenWorkspaceMedia?: (
    file: WorkspaceMessageFileReference,
    gallery?: WorkspaceMessageMediaGalleryOpenRequest,
  ) => void | Promise<void>;
  onOpenUnsupportedFilePreview?: (file: WorkspaceMessageFileReference) => void;
  onRetryOutgoingMessage?: (localId: string) => void;
  onRemoveOutgoingMessage?: (localId: string) => void;
  messagesLoadError: WorkspaceChatMessagesLoadErrorKind | null;
  onRetryMessagesLoad: () => void;
  boundaryLoadFailed: boolean;
  onDismissBoundaryLoadFailed: () => void;
  scrollToBottomAfterSendNonce: number;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveTopicLabel?: (topicUuid: MessengerUuid) => string | null | undefined;
  presentation?: WorkspaceMessageListPresentation;
  resolveMention?: WorkspaceMessageMentionResolver;
}
