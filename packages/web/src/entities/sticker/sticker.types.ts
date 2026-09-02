export type StickerFormat = "gif" | "webp" | "png";

export type StickerProvider = "giphy";

export type StickerRating = "g" | "pg" | "pg-13" | "r";

export type StickerCatalogAccessMode = "allowlist" | "unrestricted";

export type StickerReference =
  | { kind: "workspace"; stickerId: string }
  | { kind: "provider"; provider: StickerProvider; externalId: string };

export interface StickerSource {
  provider: StickerProvider;
  externalId: string;
}

export interface StickerMediaMetadata {
  animated: boolean;
  width: number;
  height: number;
  aspectRatio: number;
  preferredFormat: StickerFormat;
}

export interface StickerAttribution {
  provider: string;
  creator?: string;
  pageUrl?: string;
}

/** Persisted metadata for one approved sticker. It never contains media URLs. */
export interface StickerCatalogEntry {
  id: string;
  source: StickerSource;
  title: string;
  alt: string;
  emoji: readonly string[];
  tags: readonly string[];
  media: StickerMediaMetadata;
  attribution: StickerAttribution;
  rating: StickerRating;
  active: boolean;
  blocked: boolean;
}

export interface StickerCatalog {
  schemaVersion: 1;
  catalogVersion: string;
  accessMode: StickerCatalogAccessMode;
  stickers: readonly StickerCatalogEntry[];
}

/** Resolved media returned to UI. Provider result IDs are opaque and URLs are session-only. */
export interface Sticker extends Omit<StickerCatalogEntry, "id"> {
  id: string;
  reference: StickerReference;
  format: StickerFormat;
  url: string;
  thumbnailUrl?: string;
  fileSize?: number;
}

export interface StickerPack {
  id: string;
  title: string;
  coverStickerId?: string;
  stickers: Sticker[];
}

export interface RecentSticker {
  stickerId: string;
  usedAt: number;
}
