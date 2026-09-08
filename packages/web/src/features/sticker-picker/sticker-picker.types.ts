import type { Sticker } from "~/entities/sticker/sticker.types";
import type { ReactNode } from "react";

export interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
  onClose?: () => void;
  embedded?: boolean;
  adminAction?: ReactNode;
}
