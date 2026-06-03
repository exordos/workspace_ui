import type { RealmEmoji } from "~/shared/api/zulip.types";
import type { ContextItemLabel } from "./message-bubble-context.lib";
import type { EmojiClickData } from "emoji-picker-react";

/** Menu opened from overflow trigger or right-click context. */
export type MessageBubbleContextMenuSource = "trigger" | "context";

/** Anchor position for context (right-click) mode. */
export interface MessageBubbleContextMenuAnchor {
  left: number;
  top: number;
}

export interface MessageBubbleContextMenuProps {
  open: boolean;
  source: MessageBubbleContextMenuSource;
  contextAnchor: MessageBubbleContextMenuAnchor | null;
  onSourceChange: (source: MessageBubbleContextMenuSource) => void;
  onOpenChange: (open: boolean) => void;
  /** Align menu for own vs others' messages in trigger mode. */
  isOwn: boolean;
  emojiPickerOpen: boolean;
  onEmojiPickerOpenChange: (open: boolean) => void;
  visibleContextSections: readonly (readonly ContextItemLabel[])[];
  onMenuItem: (label: ContextItemLabel) => void;
  onQuickReaction: (emojiName: string) => void;
  onEmojiPick: (data: EmojiClickData) => void;
  customEmojis?: RealmEmoji[];
}
