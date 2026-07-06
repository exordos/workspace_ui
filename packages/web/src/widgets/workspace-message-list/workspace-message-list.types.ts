import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolver,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";

export interface WorkspaceMessageListActions {
  onReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onEditMessage?: (messageUuid: MessengerUuid) => void;
  onRequestDeleteMessage?: (messageUuid: MessengerUuid) => void;
  onCopyMessageText?: (messageUuid: MessengerUuid, text: string) => void | Promise<void>;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
  onOpenMentionUser?: (userUuid: MessengerUuid) => void;
  onDownloadFile?: (file: WorkspaceMessageFileReference) => void | Promise<void>;
  onOpenUnsupportedFilePreview?: (file: WorkspaceMessageFileReference) => void;
}

export interface WorkspaceMessageListProps {
  messages: readonly MessengerMessage[];
  currentUserUuid: MessengerUuid;
  conversationId: MessengerConversationId;
  scrollToBottomKey?: string;
  scrollToBottomAfterSendNonce?: number;
  firstUnreadUuid?: MessengerUuid;
  unreadCount?: number;
  focusedMessageUuid?: MessengerUuid | null;
  isLoadingOlder?: boolean;
  isLoadingNewer?: boolean;
  hasOlderMessages?: boolean;
  hasNewerMessages?: boolean;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
  onUnreadMessagesVisible?: (messageUuids: MessengerUuid[]) => void;
  onUnreadMessagesAtBottom?: (messageUuids: MessengerUuid[]) => void;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveMention?: WorkspaceMessageMentionResolver;
  actions?: WorkspaceMessageListActions;
}
