/**
 * Sticker API — placeholder for backend integration.
 *
 * The Zulip/Workspace server does not yet have a sticker API.
 * These functions define the expected contract. When the backend is ready,
 * replace the mock implementations with real HTTP calls.
 *
 * Stickers are sent as messages with a special markdown format:
 *   [sticker:pack_id:sticker_id](sticker_url)
 *
 * This allows them to degrade gracefully in clients that don't support stickers
 * (they'll see a linked image).
 */

import { createLogger } from "~/shared/lib/logger";
import type {
  StickerPack,
  StickerPackListResponse,
  StickerSearchResult,
  Sticker,
} from "./sticker.types";

const log = createLogger("sticker:api");

const API_NOT_READY_MSG = "Sticker API not available yet — using local data";

// ---------------------------------------------------------------------------
// Pack management
// ---------------------------------------------------------------------------

export function fetchStickerPacks(): Promise<StickerPackListResponse> {
  log.info(API_NOT_READY_MSG);
  return Promise.resolve({ packs: [], totalCount: 0 });
}

export function fetchStickerPack(packId: string): Promise<StickerPack | null> {
  log.info(API_NOT_READY_MSG, { packId });
  return Promise.resolve(null);
}

export function installStickerPack(packId: string): Promise<boolean> {
  log.info(API_NOT_READY_MSG, { packId });
  return Promise.resolve(false);
}

export function uninstallStickerPack(packId: string): Promise<boolean> {
  log.info(API_NOT_READY_MSG, { packId });
  return Promise.resolve(false);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function searchStickers(query: string): Promise<StickerSearchResult> {
  log.info(API_NOT_READY_MSG, { query });
  return Promise.resolve({ stickers: [], query });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/**
 * Build the markdown content for a sticker message.
 * Format: `[sticker:packId:stickerId](url)`
 *
 * This is a linked image that degrades to a regular image in clients
 * without sticker support.
 */
export function buildStickerMarkdown(sticker: Sticker): string {
  return `[sticker:${sticker.packId}:${sticker.id}](${sticker.url})`;
}

/**
 * Parse sticker metadata from message content.
 * Returns null if the message is not a sticker.
 */
export function parseStickerFromContent(
  content: string,
): { packId: string; stickerId: string; url: string } | null {
  const match = /\[sticker:([^:]+):([^\]]+)\]\(([^)]+)\)/.exec(content);
  if (!match) return null;
  return {
    packId: match[1]!,
    stickerId: match[2]!,
    url: match[3]!,
  };
}

/**
 * Check if a message content is a sticker-only message
 * (no other text besides the sticker markdown).
 */
export function isStickerMessage(content: string): boolean {
  const trimmed = content.trim();
  return /^\[sticker:[^:]+:[^\]]+\]\([^)]+\)$/.test(trimmed);
}
