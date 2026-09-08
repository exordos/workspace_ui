export type StickerFormat = "gif" | "webp" | "png";

export interface StickerReference {
  kind: "workspace";
  stickerId: string;
}

export interface Sticker {
  id: string;
  title: string;
  alt: string;
  emoji: readonly string[];
  tags: readonly string[];
  media: { width?: number; height?: number; aspectRatio?: number };
  category?: "gif" | "sticker";
  isFavorite?: boolean;
  reference: StickerReference;
  format: StickerFormat;
  url: string;
}
