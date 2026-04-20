import type { ContextItemLabel } from "./message-bubble-context.lib";
import type { EmojiClickData } from "emoji-picker-react";

export interface MessageBubbleContextMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwn: boolean;
  emojiPickerOpen: boolean;
  onEmojiPickerOpenChange: (open: boolean) => void;
  visibleContextSections: readonly (readonly ContextItemLabel[])[];
  onMenuItem: (label: ContextItemLabel) => void;
  onQuickReaction: (emojiName: string) => void;
  onEmojiPick: (data: EmojiClickData) => void;
}
