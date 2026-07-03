/**
 * Renders the custom status emoji glyph next to a chat title (DM sidebar rows).
 * Does not render status text — only the emoji picture/character from Zulip payload.
 */
import React from "react";

export interface SidebarUserStatusEmojiProps {
  status: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function unicodeEmojiFromCode(value: string): string | null {
  const codePoints = value
    .split(/[-_ ]+/)
    .map((part) => Number.parseInt(part, 16))
    .filter((part) => Number.isFinite(part) && part > 0);
  if (codePoints.length === 0) {
    return null;
  }
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return null;
  }
}

function resolveStatusEmojiLabel(status: unknown): string | null {
  if (!isRecord(status)) {
    return null;
  }
  const emojiCode = typeof status.emojiCode === "string" ? status.emojiCode.trim() : "";
  const reactionType = typeof status.reactionType === "string" ? status.reactionType : "";
  if (reactionType === "unicode_emoji" && emojiCode.length > 0) {
    return unicodeEmojiFromCode(emojiCode);
  }
  const emojiName = typeof status.emojiName === "string" ? status.emojiName.trim() : "";
  return emojiName.length > 0 ? `:${emojiName}:` : null;
}

export const SidebarUserStatusEmoji = React.memo<SidebarUserStatusEmojiProps>(
  function SidebarUserStatusEmoji({ status }) {
    const label = resolveStatusEmojiLabel(status);
    if (label == null) {
      return null;
    }
    return (
      <span data-testid="sidebar-user-status-emoji" aria-hidden className="shrink-0 text-xs">
        {label}
      </span>
    );
  },
);
