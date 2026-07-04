import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";

export type WorkspaceChatMessagesLoadErrorKind = "initial" | "refresh";

export interface ChatPageWorkspaceMessageListSectionProps {
  messagesLoading: boolean;
  hasInitialPayload: boolean;
  messages: readonly MessengerMessage[];
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
  onUnreadMessagesVisible: (messageUuids: MessengerUuid[]) => void;
  onUnreadMessagesAtBottom: (messageUuids: MessengerUuid[]) => void;
  onReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onEditMessage?: (messageUuid: MessengerUuid) => void;
  onRequestDeleteMessage?: (messageUuid: MessengerUuid) => void;
  onCopyMessageText?: (messageUuid: MessengerUuid, text: string) => void | Promise<void>;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
  messagesLoadError: WorkspaceChatMessagesLoadErrorKind | null;
  onRetryMessagesLoad: () => void;
  boundaryLoadFailed: boolean;
  onDismissBoundaryLoadFailed: () => void;
  scrollToBottomAfterSendNonce: number;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
}
