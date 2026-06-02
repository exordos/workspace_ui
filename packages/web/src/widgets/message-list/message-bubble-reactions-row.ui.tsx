import React from "react";
import { isOneToOneDirectMessage } from "./message-bubble-emoji.lib";
import { resolveReactionTitle } from "./message-bubble-reactions-row.lib";
import type { MessageBubbleReactionsRowProps } from "./message-bubble-reactions-row.types";

/** Up to this many reactors — chip shows comma-separated names; above — numeric count only. */
const REACTION_CHIP_NAMES_INSTEAD_OF_COUNT_MAX = 3;

/**
 * Выбирает мета-текст рядом с эмодзи реакции:
 * - для небольшого числа реакций показывает имена реакторов;
 * - для большого числа показывает только счётчик;
 * - в режимах со скрытой мета-информацией не показывает ничего.
 */
function getReactionChipMetaText(
  hideReactionChipMeta: boolean,
  reactionAuthors: string,
  count: number,
): string | null {
  if (hideReactionChipMeta) {
    return null;
  }

  // Для 1..3 реакций показываем имена, если они известны: это полезнее, чем просто цифра.
  const shouldShowAuthors =
    count >= 1 && count <= REACTION_CHIP_NAMES_INSTEAD_OF_COUNT_MAX && reactionAuthors.length > 0;
  if (shouldShowAuthors) {
    return reactionAuthors;
  }

  // После этого в старой логике обе ветки (`count >= 4` и `count > 1`) давали одно и то же.
  return count > 1 ? String(count) : null;
}

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
              {imageUrl != null ? (
                <img
                  src={imageUrl}
                  alt={`:${emojiName}:`}
                  className="h-4 w-4 shrink-0 object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="shrink-0">{displayChar}</span>
              )}
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
