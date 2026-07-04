import type {
  MessageReactionPayload,
  MockMessage,
  MockMessageDeliveryStatus,
  Reaction,
  RealmEmoji,
} from "~/shared/api/zulip.types";
import type { WorkspaceGroupedReaction } from "./message-bubble-emoji.lib";
import type { MessageMediaGallery } from "./message-list-media.lib";

// Узкое расширение старого сообщения для Workspace route. Поле хранит готовые
// grouped chips и не меняет Zulip reactions-массив, который остается только для
// legacy-пути.
export type MessageBubbleMessage = MockMessage & {
  workspaceReactionGroups?: WorkspaceGroupedReaction[];
};

/** Download chip state for user-upload attachment links in the bubble. */
export type MessageBubbleAttachmentDownloadStatus = "idle" | "downloading" | "downloaded" | "error";

export type MessageBubbleOwnDeliveryStatus = MockMessageDeliveryStatus | "sent";

export interface MessageBubbleCallbacks {
  onReply?: (message: MessageBubbleMessage, selectedText?: string) => void;
  onEdit?: (message: MessageBubbleMessage) => void;
  onDelete?: (message: MessageBubbleMessage) => void;
  onCopy?: (message: MessageBubbleMessage) => void;
  onForward?: (message: MessageBubbleMessage, selectedText?: string) => void;
  onStar?: (message: MessageBubbleMessage) => void;
  onSelect?: (message: MessageBubbleMessage) => void;
  onToggleSelect?: (message: MessageBubbleMessage) => void;
  onAddReaction?: (messageId: number, payload: MessageReactionPayload) => void;
  onRemoveReaction?: (messageId: number, payload: MessageReactionPayload) => void;
  // Safe toggle нужен Workspace chips: UI aggregate может быть свежее или
  // старее own projection, поэтому решение add/remove принимает action layer.
  onToggleReaction?: (messageId: number, payload: MessageReactionPayload) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onViews?: (message: MessageBubbleMessage) => void;
  onOpenInChat?: (message: MessageBubbleMessage) => void;
  /** Intercepts anchor clicks inside message body. Return true when handled by app navigation. */
  onPermalinkClick?: (href: string) => boolean;
  onAuthorClick?: (userId: number) => void;
  onOpenDirectMessage?: (userId: number) => void;
  onOpenDirectMessageByUuid?: (userUuid: string) => void;
  /** Resend a failed optimistic outgoing message (negative id, delivery failed). */
  onRetryFailedOutgoing?: (message: MessageBubbleMessage) => void;
  /** Drop a failed optimistic outgoing message from the list. */
  onRemoveFailedOutgoing?: (message: MessageBubbleMessage) => void;
  /** Retry a failed optimistic edit for an existing message. */
  onRetryFailedEdit?: (message: MessageBubbleMessage) => void;
  /** Revert a failed optimistic edit back to the previous message body. */
  onCancelFailedEdit?: (message: MessageBubbleMessage) => void;
}

export interface MessageBubbleProps {
  message: MessageBubbleMessage;
  isOwn?: boolean;
  /** Show avatar (for a standalone message; in a group the avatar is rendered by the outer block). */
  showAvatar?: boolean;
  /** Show sender name (only for the first message in a consecutive group). */
  showSenderName?: boolean;
  /** Show topic label next to sender name (stream-wide view only). */
  showTopicInSenderName?: boolean;
  /** Message inside a sender group: avatar is rendered outside, content has no avatar column. */
  inSenderGroup?: boolean;
  currentUserId?: number;
  selectionMode?: boolean;
  isSelected?: boolean;
  isFocused?: boolean;
  mediaGallery?: MessageMediaGallery;
  customEmojis?: RealmEmoji[];
  onEmojiPickerOpen?: () => void;
  customEmojisSupported?: boolean;
  resolveCustomEmojiImageUrl?: (reaction: Reaction) => string | undefined;
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
  callbacks?: MessageBubbleCallbacks;
}
