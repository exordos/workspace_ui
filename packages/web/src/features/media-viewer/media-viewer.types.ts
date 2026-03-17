/**
 * Media Viewer type definitions.
 *
 * Supports full-screen viewing of images and videos from message content.
 * Allows navigating between multiple media items within the same context.
 */

export type MediaType = "image" | "video";

export interface MediaItem {
  url: string;
  type: MediaType;
  alt?: string;
  width?: number;
  height?: number;
}

export interface MediaViewerState {
  isOpen: boolean;
  currentIndex: number;
  items: MediaItem[];

  open: (items: MediaItem[], startIndex?: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  currentItem: () => MediaItem | undefined;
}
