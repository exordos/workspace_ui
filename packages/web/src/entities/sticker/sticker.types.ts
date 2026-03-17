/**
 * Sticker system type definitions.
 *
 * Modeled after Telegram sticker packs: packs contain stickers,
 * stickers can be static (WebP/PNG) or animated (Lottie/TGS/WebM).
 * The backend API is not ready yet — these types define the contract
 * so frontend work can proceed independently.
 */

// ---------------------------------------------------------------------------
// Sticker
// ---------------------------------------------------------------------------

export type StickerFormat = "webp" | "png" | "lottie" | "webm";

export interface Sticker {
  /** Unique sticker ID (server-assigned). */
  id: string;
  /** Pack this sticker belongs to. */
  packId: string;
  /** Emoji associated with this sticker (for search/suggestions). */
  emoji: string;
  /** Optional alt text for accessibility. */
  alt?: string;
  /** Image/animation format. */
  format: StickerFormat;
  /** URL to the sticker file (CDN). */
  url: string;
  /** Thumbnail URL (static preview for animated stickers). */
  thumbnailUrl?: string;
  /** Width in pixels (original). */
  width: number;
  /** Height in pixels (original). */
  height: number;
  /** File size in bytes (for bandwidth budgeting). */
  fileSize?: number;
}

// ---------------------------------------------------------------------------
// Sticker Pack
// ---------------------------------------------------------------------------

export interface StickerPack {
  /** Unique pack ID. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Pack author / artist name. */
  author?: string;
  /** Cover sticker (used as pack icon). */
  coverStickerId?: string;
  /** Whether the pack contains animated stickers. */
  animated: boolean;
  /** All stickers in the pack (ordered). */
  stickers: Sticker[];
  /** When the pack was installed by the user (ISO date, null = built-in). */
  installedAt?: string;
  /** Whether this is a built-in default pack. */
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Recently Used
// ---------------------------------------------------------------------------

export interface RecentSticker {
  stickerId: string;
  packId: string;
  usedAt: number;
}

// ---------------------------------------------------------------------------
// Backend API contract (not yet implemented on server)
// ---------------------------------------------------------------------------

export interface StickerPackListResponse {
  packs: StickerPack[];
  totalCount: number;
}

export interface StickerSearchResult {
  stickers: Sticker[];
  query: string;
}

export interface InstallPackRequest {
  packId: string;
}

export interface SendStickerRequest {
  stickerId: string;
  packId: string;
}
