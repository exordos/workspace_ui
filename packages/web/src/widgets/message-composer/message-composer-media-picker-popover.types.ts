import type { EmojiClickData } from "emoji-picker-react";
import type { CSSProperties } from "react";
import type { MediaPickerTab } from "./message-composer.types";

export interface MessageComposerMediaPickerPopoverProps {
  mediaPickerStyle: CSSProperties;
  mediaPickerTab: MediaPickerTab;
  onClose: () => void;
  onTabChange: (tab: MediaPickerTab) => void;
  onEmojiClick: (data: EmojiClickData) => void;
  onStickerSelect: (markdown: string) => void;
}
