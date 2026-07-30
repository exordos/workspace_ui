import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import type { DropdownMenuSource } from "~/shared/ui/dropdown-menu";
import type { EmojiClickData } from "emoji-picker-react";

export type WorkspaceMessageBubbleMenuSource = DropdownMenuSource;

export interface WorkspaceMessageBubbleMenuAnchor {
  left: number;
  top: number;
}

export interface WorkspaceMessageBubbleMenuProps {
  message: MessengerMessage;
  isOwn: boolean;
  open: boolean;
  source: WorkspaceMessageBubbleMenuSource;
  contextAnchor: WorkspaceMessageBubbleMenuAnchor | null;
  onSourceChange: (source: WorkspaceMessageBubbleMenuSource) => void;
  onOpenChange: (open: boolean) => void;
  onReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onAddReplyMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onForwardMessage?: (messageUuid: MessengerUuid, selectedText?: string) => void;
  onToggleMessageSelection?: (messageUuid: MessengerUuid) => void;
  onEditMessage?: (messageUuid: MessengerUuid) => void;
  onRequestDeleteMessage?: (messageUuid: MessengerUuid) => void;
  onCopyMessageText?: (messageUuid: MessengerUuid, text: string) => void | Promise<void>;
  onToggleMessageReaction?: (messageUuid: MessengerUuid, emojiName: string) => void | Promise<void>;
  getSelectedText: () => string | undefined;
}

export interface WorkspaceReactionEmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiPick: (data: EmojiClickData) => void;
}
