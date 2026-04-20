import type { MockMessage, MockMessageDeliveryStatus } from "~/shared/api/zulip.types";
import type { MessageMediaGallery } from "./message-list-media.lib";

/** Download chip state for user-upload attachment links in the bubble. */
export type MessageBubbleAttachmentDownloadStatus = "idle" | "downloading" | "downloaded" | "error";

export type MessageBubbleOwnDeliveryStatus = MockMessageDeliveryStatus | "sent";

export interface MessageBubbleCallbacks {
  onReply?: (message: MockMessage, selectedText?: string) => void;
  onEdit?: (message: MockMessage) => void;
  onDelete?: (message: MockMessage) => void;
  onCopy?: (message: MockMessage) => void;
  onForward?: (message: MockMessage, selectedText?: string) => void;
  onStar?: (message: MockMessage) => void;
  onSelect?: (message: MockMessage) => void;
  onToggleSelect?: (message: MockMessage) => void;
  onAddReaction?: (messageId: number, emojiName: string) => void;
  onRemoveReaction?: (messageId: number, emojiName: string) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onViews?: (message: MockMessage) => void;
  onOpenInChat?: (message: MockMessage) => void;
  /** Intercepts anchor clicks inside message body. Return true when handled by app navigation. */
  onPermalinkClick?: (href: string) => boolean;
  onAuthorClick?: (userId: number) => void;
  onOpenDirectMessage?: (userId: number) => void;
  /** Resend a failed optimistic outgoing message (negative id, delivery failed). */
  onRetryFailedOutgoing?: (message: MockMessage) => void;
  /** Drop a failed optimistic outgoing message from the list. */
  onRemoveFailedOutgoing?: (message: MockMessage) => void;
}

export interface MessageBubbleProps {
  message: MockMessage;
  isOwn?: boolean;
  /** Show avatar (for a standalone message; in a group the avatar is rendered by the outer block). */
  showAvatar?: boolean;
  /** Show sender name (only for the first message in a consecutive group). */
  showSenderName?: boolean;
  /** Message inside a sender group: avatar is rendered outside, content has no avatar column. */
  inSenderGroup?: boolean;
  currentUserId?: number;
  selectionMode?: boolean;
  isSelected?: boolean;
  isFocused?: boolean;
  mediaGallery?: MessageMediaGallery;
  callbacks?: MessageBubbleCallbacks;
}
