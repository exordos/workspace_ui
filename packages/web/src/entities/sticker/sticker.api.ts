/**
 * Sticker wire-format helpers for message content.
 *
 * Stickers are sent as messages with a special markdown format:
 *   [sticker:pack_id:sticker_id](sticker_url)
 *
 * Server pack management API is not wired yet — sticker data lives in the local store.
 */

import type { Sticker } from "./sticker.types";

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
