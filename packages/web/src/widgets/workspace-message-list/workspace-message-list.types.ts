import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";

export interface WorkspaceMessageListActions {
  onReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onEditMessage?: (messageUuid: MessengerUuid) => void;
  onRequestDeleteMessage?: (messageUuid: MessengerUuid) => void;
  onCopyMessageText?: (messageUuid: MessengerUuid, text: string) => void | Promise<void>;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
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
  actions?: WorkspaceMessageListActions;
}
