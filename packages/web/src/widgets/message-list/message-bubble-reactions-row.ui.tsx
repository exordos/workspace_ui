import React from "react";
import type { MockMessage } from "~/shared/api/zulip.types";
import type { MessageBubbleCallbacks } from "./message-bubble.types";
import type { GroupedReaction } from "./message-bubble-emoji.lib";

export interface MessageBubbleReactionsRowProps {
  message: MockMessage;
  isOwn: boolean;
  currentUserId: number | undefined;
  reactionGroups: GroupedReaction[];
  resolveReactionAuthorLabel: (userId: number) => string;
  callbacks?: MessageBubbleCallbacks;
}

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

  return (
    <div
      className={`absolute bottom-2 left-2 right-14 flex flex-wrap items-end gap-1 ${
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
        return (
          <button
            type="button"
            key={key}
            className={`inline-flex cursor-pointer items-center gap-0.5 rounded-full border-0 px-1.5 py-0.5 text-sm transition-colors ${
              hasCurrentUser ? "bg-accent/25 hover:bg-accent/35" : "bg-bg/50 hover:bg-bg/80"
            }`}
            title={reactionTitle}
            aria-label={reactionTitle}
            onClick={() => {
              if (hasCurrentUser) {
                callbacks?.onRemoveReaction?.(message.id, emojiName);
              } else {
                callbacks?.onAddReaction?.(message.id, emojiName);
              }
            }}
          >
            <span>{displayChar}</span>
            {count > 1 && <span className="text-[11px] text-text-muted">{count}</span>}
          </button>
        );
      })}
    </div>
  );
});
