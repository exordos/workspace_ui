import type { Sticker, StickerPack } from "~/entities/sticker/sticker.types";

export interface StickerItemProps {
  sticker: Sticker;
  size?: number;
  onClick: (sticker: Sticker) => void;
}

export interface PackTabProps {
  pack: StickerPack;
  isActive: boolean;
  onClick: () => void;
}

export interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
  onClose?: () => void;
  embedded?: boolean;
}
