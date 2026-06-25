import React from "react";
import { isOneToOneDirectMessage } from "./message-bubble-emoji.lib";
import { resolveReactionTitle } from "./message-bubble-reactions-row.lib";
import type { MessageBubbleReactionsRowProps } from "./message-bubble-reactions-row.types";

/** Up to this many reactors — chip shows comma-separated names; above — numeric count only. */
const REACTION_CHIP_NAMES_INSTEAD_OF_COUNT_MAX = 3;

/** Reaction chip meta: names for small counts, count only for large, nothing when hidden. */
function getReactionChipMetaText(
  hideReactionChipMeta: boolean,
  reactionAuthors: string,
  count: number,
): string | null {
  if (hideReactionChipMeta) {
    return null;
  }

  // For 1..3 reactions show names when known — more useful than a bare count.
  const shouldShowAuthors =
    count >= 1 && count <= REACTION_CHIP_NAMES_INSTEAD_OF_COUNT_MAX && reactionAuthors.length > 0;
  if (shouldShowAuthors) {
    return reactionAuthors;
  }

  // count >= 4 and count > 1 both resolve to numeric display.
  return count > 1 ? String(count) : null;
}

interface MessageBubbleReactionGlyphProps {
  displayChar: string;
  emojiName: string;
  imageUrl?: string;
}

const REACTION_GLYPH_CELL_CLASS_NAME =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden leading-none";

const REACTION_GLYPH_IMAGE_CLASS_NAME = "block h-4 w-4 max-w-full object-contain";

/** Stable 20px cell for both native font emoji and custom emoji images. */
const MessageBubbleReactionGlyph: React.FC<MessageBubbleReactionGlyphProps> = ({
  displayChar,
  emojiName,
  imageUrl,
}) => {
  if (imageUrl != null) {
    return (
      <span className={REACTION_GLYPH_CELL_CLASS_NAME}>
        <img
          src={imageUrl}
          alt={`:${emojiName}:`}
          className={REACTION_GLYPH_IMAGE_CLASS_NAME}
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span className={REACTION_GLYPH_CELL_CLASS_NAME}>
      <span className="block text-base leading-none">{displayChar}</span>
    </span>
  );
};

/** Grouped reaction chips shown at the bottom of the message bubble. */
export const MessageBubbleReactionsRow = React.memo(function MessageBubbleReactionsRow({
  message,
  currentUserId,
  reactionGroups,
  resolveReactionAuthorLabel,
  callbacks,
}: MessageBubbleReactionsRowProps) {
  if (reactionGroups.length === 0) return null;

  const hideReactionChipMeta = isOneToOneDirectMessage(message);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-end justify-start gap-1">
      {reactionGroups.map(
        ({ key, count, userIds, displayChar, emojiName, emojiCode, reactionType, imageUrl }) => {
          const hasCurrentUser = currentUserId != null && userIds.includes(currentUserId);
          const reactionAuthors = userIds.map(resolveReactionAuthorLabel).join(", ");
          const reactionPrefix = imageUrl != null ? `:${emojiName}:` : displayChar;
          const reactionTitle = resolveReactionTitle({
            reactionAuthors,
            reactionPrefix,
            count,
          });
          const chipMetaText = getReactionChipMetaText(
            hideReactionChipMeta,
            reactionAuthors,
            count,
          );
          return (
            <button
              type="button"
              key={key}
              className={`inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-lg border px-2 py-0.5 text-sm transition-colors ${
                hasCurrentUser
                  ? "border-accent/40 bg-accent/15 hover:border-accent/50 hover:bg-accent/25"
                  : "bg-bg-elevated/90 border-border-subtle hover:bg-bg-elevated"
              }`}
              title={hideReactionChipMeta ? undefined : reactionTitle}
              aria-label={reactionTitle}
              onClick={() => {
                const payload = {
                  emojiName,
                  reactionType,
                  ...(emojiCode ? { emojiCode } : {}),
                  ...(imageUrl ? { imageUrl } : {}),
                };
                if (hasCurrentUser) {
                  callbacks?.onRemoveReaction?.(message.id, payload);
                } else {
                  callbacks?.onAddReaction?.(message.id, payload);
                }
              }}
            >
              <MessageBubbleReactionGlyph
                displayChar={displayChar}
                emojiName={emojiName}
                imageUrl={imageUrl}
              />
              {chipMetaText != null && (
                <span className="min-w-0 truncate text-[11px] text-text-muted">{chipMetaText}</span>
              )}
            </button>
          );
        },
      )}
    </div>
  );
});
