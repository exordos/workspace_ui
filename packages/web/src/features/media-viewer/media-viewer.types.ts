/**
 * Media Viewer type definitions.
 *
 * Supports full-screen viewing of images and videos from message content.
 * Allows navigating between multiple media items within the same context.
 */

export type MediaType = "image" | "video";

export interface MediaViewerWorkspaceFile {
  fileUuid: string;
  name?: string;
  contentType?: string;
  objectUrl?: string;
  onDownload?: (file: MediaViewerWorkspaceFile) => void | Promise<void>;
}

export interface MediaItem {
  url: string;
  type: MediaType;
  previewUrl?: string;
  downloadFileName?: string;
  alt?: string;
  width?: number;
  height?: number;
  workspaceFile?: MediaViewerWorkspaceFile;
}

export interface MediaViewerState {
  isOpen: boolean;
  currentIndex: number;
  items: MediaItem[];

  open: (items: MediaItem[], startIndex?: number) => void;
  replaceItem: (index: number, item: MediaItem) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  currentItem: () => MediaItem | undefined;
}
