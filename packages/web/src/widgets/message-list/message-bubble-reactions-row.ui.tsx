import React from "react";
import { isOneToOneDirectMessage } from "./message-bubble-emoji.lib";
import type { MessageBubbleReactionsRowProps } from "./message-bubble-reactions-row.types";

/** Up to this many reactors — chip shows comma-separated names; above — numeric count only. */
const REACTION_CHIP_NAMES_INSTEAD_OF_COUNT_MAX = 3;

/** Grouped reaction chips shown at the bottom of the message bubble. */
export const MessageBubbleReactionsRow = React.memo(function MessageBubbleReactionsRow({
  message,
  isOwn,
  currentUserId,
  reactionGroups,
  resolveReactionAuthorLabel,
  callbacks,
}: MessageBubbleReactionsRowProps) {
  if (reactionGroups.length === 0) return null;

  const hideReactionChipMeta = isOneToOneDirectMessage(message);

  return (
    <div
      className={`flex min-w-0 flex-1 flex-wrap items-end gap-1 ${
        isOwn ? "justify-end" : "justify-start"
      }`}
    >
      {reactionGroups.map(({ key, count, userIds, displayChar }) => {
        const emojiName = key.split(":")[1] ?? key;
        const hasCurrentUser = currentUserId != null && userIds.includes(currentUserId);
        const reactionAuthors = userIds.map(resolveReactionAuthorLabel).join(", ");
        const reactionTitle =
          reactionAuthors.length > 0
            ? `${displayChar} ${count} - ${reactionAuthors}`
            : count > 0
              ? `${displayChar} ${count}`
              : undefined;
        const showAuthorNamesOnChip =
          count >= 1 &&
          count <= REACTION_CHIP_NAMES_INSTEAD_OF_COUNT_MAX &&
          reactionAuthors.length > 0;
        const chipMetaText = hideReactionChipMeta
          ? null
          : showAuthorNamesOnChip
            ? reactionAuthors
            : count >= 4
              ? String(count)
              : count > 1
                ? String(count)
                : null;
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
              if (hasCurrentUser) {
                callbacks?.onRemoveReaction?.(message.id, emojiName);
              } else {
                callbacks?.onAddReaction?.(message.id, emojiName);
              }
            }}
          >
            <span className="shrink-0">{displayChar}</span>
            {chipMetaText != null && (
              <span className="min-w-0 truncate text-[11px] text-text-muted">{chipMetaText}</span>
            )}
          </button>
        );
      })}
    </div>
  );
});
