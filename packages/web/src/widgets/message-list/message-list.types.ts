import type { MockMessage } from "~/shared/api/zulip.types";
import type { MessageBubbleCallbacks } from "./message-bubble.types";
import type { MessageMediaGallery } from "./message-list-media.lib";

export interface MessageListCallbacks {
  onMessageReply?: (message: MockMessage, selectedText?: string) => void;
  onMessageEdit?: (message: MockMessage) => void;
  onMessageDelete?: (message: MockMessage) => void;
  onMessageCopy?: (message: MockMessage) => void;
  onMessageForward?: (message: MockMessage, selectedText?: string) => void;
  onMessageStar?: (message: MockMessage) => void;
  onMessageSelect?: (message: MockMessage) => void;
  onMessageAddReaction?: (messageId: number, emojiName: string) => void;
  onMessageRemoveReaction?: (messageId: number, emojiName: string) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onMessageViews?: (message: MockMessage) => void;
  onMessageOpenInChat?: (message: MockMessage) => void;
  onTopicSeparatorClick?: (message: MockMessage) => void;
  onMessageAuthorClick?: (userId: number) => void;
}

/** Props for grouped non-own messages (avatar column + bubbles). */
export interface MessageListSenderGroupProps {
  messages: MockMessage[];
  currentUserId?: number;
  bubbleCallbacks?: MessageBubbleCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<number>;
  focusedMessageId?: number | null;
  mediaGallery: MessageMediaGallery;
}

export interface MessageListProps {
  messages: MockMessage[];
  currentUserId?: number;
  /** When the key changes (chat/topic/DM), scroll resets to the latest messages */
  scrollToBottomKey?: string;
  callbacks?: MessageListCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<number>;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onLoadNewer?: () => void;
  hasNewerMessages?: boolean;
  /** ID of the first unread message — an "unread" separator is shown above it */
  firstUnreadId?: number;
  /** Count of unread messages for marker text parity. */
  unreadCount?: number;
  /** Optional message to bring into view and visually highlight. */
  focusedMessageId?: number | null;
  /** Called when unread messages become at least 50% visible in viewport. */
  onUnreadMessagesVisible?: (messageIds: number[]) => void;
  /** Called when user reaches chat bottom with unread messages in the loaded list. */
  onUnreadMessagesAtBottom?: (messageIds: number[]) => void;
  /** Shows non-blocking floating loading indicator above the list. */
  showLoadingOverlay?: boolean;
}
