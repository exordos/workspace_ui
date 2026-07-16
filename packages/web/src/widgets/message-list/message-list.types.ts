import type { MessageReactionPayload, MockMessage, RealmEmoji } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
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
  onMessageAddReaction?: (messageId: MessageId, payload: MessageReactionPayload) => void;
  onMessageRemoveReaction?: (messageId: MessageId, payload: MessageReactionPayload) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onMessageViews?: (message: MockMessage) => void;
  onMessageOpenInChat?: (message: MockMessage) => void;
  onMessagePermalinkClick?: (href: string) => boolean;
  onTopicSeparatorClick?: (message: MockMessage) => void;
  onMessageAuthorClick?: (userId: UserId) => void;
  onOpenDirectMessage?: (userId: UserId) => void;
  onRetryFailedOutgoing?: (message: MockMessage) => void;
  onRemoveFailedOutgoing?: (message: MockMessage) => void;
  onRetryFailedEdit?: (message: MockMessage) => void;
  onCancelFailedEdit?: (message: MockMessage) => void;
}

/** Props for grouped non-own messages (avatar column + bubbles). */
export interface MessageListSenderGroupProps {
  messages: MockMessage[];
  currentUserId?: UserId;
  bubbleCallbacks?: MessageBubbleCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<MessageId>;
  focusedMessageId?: MessageId | null;
  mediaGallery: MessageMediaGallery;
  customEmojis?: RealmEmoji[];
  onEmojiPickerOpen?: () => void;
  resolveCustomEmojiImageUrl?: (emojiName: string) => string | undefined;
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
  /** Show topic label next to sender name in stream messages. */
  showTopicInSenderName?: boolean;
}

export interface MessageListProps {
  messages: MockMessage[];
  /** Current stream topic display names keyed by lowercase topic UUID. */
  topicNamesByUuid?: ReadonlyMap<string, string>;
  currentUserId?: UserId;
  /** Changes when chat/topic/DM changes; resets list-local scroll/read bookkeeping. */
  scrollToBottomKey?: string;
  callbacks?: MessageListCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<MessageId>;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** True only while load-newer is in flight (excludes load-older). */
  isLoadingNewer?: boolean;
  onLoadNewer?: () => void;
  hasNewerMessages?: boolean;
  /** ID of the first unread message — an "unread" separator is shown above it */
  firstUnreadId?: MessageId;
  /** Count of unread messages for marker text parity. */
  unreadCount?: number;
  /** Optional message to bring into view and visually highlight. */
  focusedMessageId?: MessageId | null;
  /** Called when unread messages become at least 50% visible in viewport. */
  onUnreadMessagesVisible?: (messageIds: MessageId[]) => void;
  /** Called when user reaches chat bottom with unread messages in the loaded list. */
  onUnreadMessagesAtBottom?: (messageIds: MessageId[]) => void;
  /** Shows non-blocking floating loading indicator above the list. */
  showLoadingOverlay?: boolean;
  /** Show topic label next to sender name in stream messages (default: true). */
  showTopicInSenderName?: boolean;
}
