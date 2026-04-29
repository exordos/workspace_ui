import type { RealmEmoji } from "~/shared/api/zulip.types";
import type { MediaPickerTab } from "./message-composer.types";
import type { EmojiClickData } from "emoji-picker-react";
import type { CSSProperties } from "react";

export interface MessageComposerMediaPickerPopoverProps {
  mediaPickerStyle: CSSProperties;
  mediaPickerTab: MediaPickerTab;
  onClose: () => void;
  onTabChange: (tab: MediaPickerTab) => void;
  onEmojiClick: (data: EmojiClickData) => void;
  onStickerSelect: (markdown: string) => void;
  customEmojis?: RealmEmoji[];
}
