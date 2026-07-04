import type {
  MessageReactionPayload,
  MockMessage,
  Reaction,
  RealmEmoji,
} from "~/shared/api/zulip.types";
import type { WorkspaceGroupedReaction } from "./message-bubble-emoji.lib";
import type { MessageBubbleCallbacks } from "./message-bubble.types";
import type { MessageMediaGallery } from "./message-list-media.lib";

// Workspace route все еще использует старую MessageList оболочку, но реакции
// передает отдельным native-полем. Это намеренно не расширяет Zulip Reaction[]
// и не заставляет adapter придумывать фальшивых реакторов.
export type MessageListMessage = MockMessage & {
  workspaceReactionGroups?: WorkspaceGroupedReaction[];
};

export interface MessageListCallbacks {
  onMessageReply?: (message: MessageListMessage, selectedText?: string) => void;
  onMessageEdit?: (message: MessageListMessage) => void;
  onMessageDelete?: (message: MessageListMessage) => void;
  onMessageCopy?: (message: MessageListMessage) => void;
  onMessageForward?: (message: MessageListMessage, selectedText?: string) => void;
  onMessageStar?: (message: MessageListMessage) => void;
  onMessageSelect?: (message: MessageListMessage) => void;
  onMessageAddReaction?: (messageId: number, payload: MessageReactionPayload) => void;
  onMessageRemoveReaction?: (messageId: number, payload: MessageReactionPayload) => void;
  // Workspace chip click не может доверять reactedByMe после reload, поэтому
  // route может передать safe toggle, который сначала сверяет own rows.
  onMessageToggleReaction?: (messageId: number, payload: MessageReactionPayload) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onMessageViews?: (message: MessageListMessage) => void;
  onMessageOpenInChat?: (message: MessageListMessage) => void;
  onMessagePermalinkClick?: (href: string) => boolean;
  onTopicSeparatorClick?: (message: MockMessage) => void;
  onMessageAuthorClick?: (userId: number) => void;
  onOpenDirectMessage?: (userId: number) => void;
  onOpenDirectMessageByUuid?: (userUuid: string) => void;
  onRetryFailedOutgoing?: (message: MessageListMessage) => void;
  onRemoveFailedOutgoing?: (message: MessageListMessage) => void;
  onRetryFailedEdit?: (message: MessageListMessage) => void;
  onCancelFailedEdit?: (message: MessageListMessage) => void;
}

/** Props for grouped non-own messages (avatar column + bubbles). */
export interface MessageListSenderGroupProps {
  messages: MessageListMessage[];
  currentUserId?: number;
  bubbleCallbacks?: MessageBubbleCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<number>;
  focusedMessageId?: number | null;
  mediaGallery: MessageMediaGallery;
  customEmojis?: RealmEmoji[];
  onEmojiPickerOpen?: () => void;
  customEmojisSupported?: boolean;
  resolveCustomEmojiImageUrl?: (reaction: Reaction) => string | undefined;
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
  /** Show topic label next to sender name in stream messages. */
  showTopicInSenderName?: boolean;
}

export interface MessageListProps {
  messages: MessageListMessage[];
  currentUserId?: number;
  /** When the key changes (chat/topic/DM), scroll resets to the latest messages */
  scrollToBottomKey?: string;
  /** Increment after the user sends a message to force scroll to the latest row */
  scrollToBottomAfterSendNonce?: number;
  callbacks?: MessageListCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<number>;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** True only while load-newer is in flight (excludes load-older). */
  isLoadingNewer?: boolean;
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
  /** Show topic label next to sender name in stream messages (default: true). */
  showTopicInSenderName?: boolean;
  // Workspace route отключает кастомные emoji только на уровне UI: список не
  // грузит realm catalog и не передает customEmojis в picker/markdown resolver.
  customEmojisSupported?: boolean;
}
