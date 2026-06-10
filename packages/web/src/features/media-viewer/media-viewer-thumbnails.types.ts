import type { MediaItem } from "./media-viewer.types";
import type { RefObject } from "react";

export interface MediaViewerThumbnailsProps {
  items: MediaItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export interface MediaViewerThumbnailItemProps {
  item: MediaItem;
  index: number;
  isActive: boolean;
  onSelect: (index: number) => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}
