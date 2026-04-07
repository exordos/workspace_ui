/**
 * StickerMessage — renders a sticker inside a message bubble.
 *
 * Detects sticker markdown format: [sticker:packId:stickerId](url)
 * Renders as a large image (no bubble background) for sticker-only messages,
 * or inline for mixed content.
 *
 * Supports: WebP, PNG (static), Lottie/WebM (animated — future).
 */
import React from "react";
import { isValidUrl } from "../lib/validation";
import type { StickerMessageProps } from "./sticker-message.types";

const STICKER_RE = /\[sticker:([^:]+):([^\]]+)\]\(([^)]+)\)/;

function parseStickerFromContent(
  content: string,
): { packId: string; stickerId: string; url: string } | null {
  const match = STICKER_RE.exec(content);
  if (!match) return null;
  return { packId: match[1]!, stickerId: match[2]!, url: match[3]! };
}

function isStickerMessage(content: string): boolean {
  return /^\[sticker:[^:]+:[^\]]+\]\([^)]+\)$/.test(content.trim());
}

export const StickerMessage: React.FC<StickerMessageProps> = ({ content, maxSize = 180 }) => {
  const parsed = parseStickerFromContent(content);
  if (!parsed || !isValidUrl(parsed.url)) return null;

  const isFullSticker = isStickerMessage(content);

  return (
    <div
      className={`inline-flex items-center justify-center ${isFullSticker ? "" : "my-1"}`}
      data-sticker-pack={parsed.packId}
      data-sticker-id={parsed.stickerId}
    >
      <img
        src={parsed.url}
        alt={`Sticker ${parsed.stickerId}`}
        className="select-none"
        style={{
          maxWidth: isFullSticker ? maxSize : maxSize * 0.6,
          maxHeight: isFullSticker ? maxSize : maxSize * 0.6,
        }}
        loading="lazy"
        draggable={false}
      />
    </div>
  );
};
