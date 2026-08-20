import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type { EmojiClickData } from "emoji-picker-react";

export interface WorkspaceMessageBubbleMenuAnchor {
  left: number;
  top: number;
}

export interface WorkspaceMessageBubbleMenuProps {
  message: MessengerMessage;
  isOwn: boolean;
  open: boolean;
  contextAnchor: WorkspaceMessageBubbleMenuAnchor | null;
  contextLinkUrl: string | null;
  contextImageFile: WorkspaceMessageFileReference | null;
  onOpenChange: (open: boolean) => void;
  onReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onAddReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onForwardMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onToggleMessageSelection?: (messageUuid: MessengerUuid) => void;
  onEditMessage?: (messageUuid: MessengerUuid) => void;
  onRequestDeleteMessage?: (messageUuid: MessengerUuid) => void;
  onCopyMessageText?: (messageUuid: MessengerUuid, text: string) => void | Promise<void>;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  getSelectedText: () => string | undefined;
}

export interface WorkspaceReactionEmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiPick: (data: EmojiClickData) => void;
}
