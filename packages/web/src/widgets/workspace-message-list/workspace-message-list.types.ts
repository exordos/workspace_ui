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
import type { WorkspaceUrnReference } from "~/shared/lib/workspace-reference-urn.lib";
import type { WorkspaceQuoteRenderMode } from "./workspace-message-quote.types";

export type WorkspaceMessageConversationReference = Extract<
  WorkspaceUrnReference,
  { kind: "stream" } | { kind: "topic" }
>;

export interface WorkspaceMessageMediaGalleryItem {
  messageUuid: MessengerUuid;
  file: WorkspaceMessageFileReference;
}

export interface WorkspaceMessageMediaGalleryOpenRequest {
  items: readonly WorkspaceMessageMediaGalleryItem[];
  startIndex: number;
}

export interface WorkspaceMessageListActions {
  jitsiServerBaseUrl?: string | null;
  jitsiLocationName?: string | null;
  onReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onAddReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onForwardMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onOpenMessageInChat?: (messageUuid: MessengerUuid) => void;
  onOpenWorkspaceReference?: (reference: WorkspaceMessageConversationReference) => void;
  onOpenAuthorProfile?: (userUuid: MessengerUuid) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onToggleMessageSelection?: (messageUuid: MessengerUuid) => void;
  onEditMessage?: (messageUuid: MessengerUuid) => void;
  onRequestDeleteMessage?: (messageUuid: MessengerUuid) => void;
  onCopyMessageText?: (messageUuid: MessengerUuid, text: string) => void | Promise<void>;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
  onOpenMentionUser?: (userUuid: MessengerUuid) => void;
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
}

export interface WorkspaceMessageListServerItem {
  kind: "server";
  key: string;
  message: MessengerMessage;
  createdAt: string;
  authorUuid: MessengerUuid;
  isOwn: boolean;
  read: boolean;
}

export interface WorkspaceMessageListOutgoingItem {
  kind: "outgoing";
  key: string;
  message: MessengerOutgoingMessage;
  createdAt: string;
  authorUuid: MessengerUuid;
  isOwn: true;
  read: true;
}

export type WorkspaceMessageListItem =
  | WorkspaceMessageListServerItem
  | WorkspaceMessageListOutgoingItem;

export interface WorkspaceMessageListPresentation {
  topicDividers?: boolean;
  topicLabels?: boolean;
  quoteRenderMode?: WorkspaceQuoteRenderMode;
}

export interface WorkspaceMessageListProps {
  messages: readonly MessengerMessage[];
  outgoingMessages?: readonly MessengerOutgoingMessage[];
  resolveServerMessageRenderKey?: (messageUuid: MessengerUuid) => string | undefined;
  currentUserUuid: MessengerUuid;
  conversationId: MessengerConversationId;
  initialPositionReady?: boolean;
  scrollToBottomKey?: string;
  scrollToBottomAfterSendNonce?: number;
  firstUnreadUuid?: MessengerUuid;
  unreadCount?: number;
  focusedMessageUuid?: MessengerUuid | null;
  selectionMode?: boolean;
  selectedMessageUuids?: ReadonlySet<MessengerUuid>;
  isLoadingOlder?: boolean;
  isLoadingNewer?: boolean;
  hasOlderMessages?: boolean;
  hasNewerMessages?: boolean;
  lastMessageUuid?: MessengerUuid | null;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
  onLoadLatestWindow?: (lastMessageUuid: MessengerUuid) => void | Promise<void>;
  onCancelLatestWindowLoad?: (lastMessageUuid: MessengerUuid) => void;
  onUnreadMessagesVisible?: (messageUuids: MessengerUuid[]) => void;
  onUnreadMessagesAtBottom?: (messageUuids: MessengerUuid[]) => void;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveTopicLabel?: (topicUuid: MessengerUuid) => string | null | undefined;
  presentation?: WorkspaceMessageListPresentation;
  resolveMention?: WorkspaceMessageMentionResolver;
  actions?: WorkspaceMessageListActions;
}
