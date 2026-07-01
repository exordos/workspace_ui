import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { RealmEmoji, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { normalizeEmojiShortcodeName } from "~/shared/lib/emoji-shortcodes.lib";
import { ensureRealmEmojisLoaded, getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import { resolveReactionTitle } from "~/widgets/message-list/message-bubble-reactions-row.lib";
import { getActivityPeerReactionGroups, hasReactionCounts } from "./activity-page.lib";

export interface ActivityPeerReactionsRowProps {
  message: WorkspaceRawMessage;
}

const ActivityPeerReactionsRowComponent: React.FC<ActivityPeerReactionsRowProps> = ({
  message,
}) => {
  const [customEmojis, setCustomEmojis] = useState<RealmEmoji[]>(() => getCachedRealmEmojis());
  const hasReactions = hasReactionCounts(message.reactions);

  useEffect(() => {
    if (!hasReactions) return;
    void ensureRealmEmojisLoaded()
      .then((list) => {
        setCustomEmojis(list);
      })
      .catch(() => {});
  }, [hasReactions]);

  const customEmojiByName = useMemo(() => {
    const map = new Map<string, RealmEmoji>();
    for (const emoji of customEmojis) {
      for (const name of emoji.names) {
        const normalized = normalizeEmojiShortcodeName(name);
        if (normalized.length > 0) {
          map.set(normalized, emoji);
        }
      }
    }
    return map;
  }, [customEmojis]);

  const resolveCustomEmojiImageUrl = useCallback(
    (emojiName: string): string | undefined => {
      const normalized = normalizeEmojiShortcodeName(emojiName);
      if (normalized.length === 0) return undefined;
      return customEmojiByName.get(normalized)?.imgUrl;
    },
    [customEmojiByName],
  );

  const reactionGroups = useMemo(
    () => getActivityPeerReactionGroups(message.reactions ?? {}, resolveCustomEmojiImageUrl),
    [message.reactions, resolveCustomEmojiImageUrl],
  );

  if (reactionGroups.length === 0) return null;

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1"
      data-testid={`activity-peer-reactions-${message.id}`}
    >
      {reactionGroups.map(({ key, count, displayChar, emojiName, imageUrl }) => {
        const reactionPrefix = imageUrl != null ? `:${emojiName}:` : displayChar;
        const reactionTitle = resolveReactionTitle({
          reactionAuthors: "",
          reactionPrefix,
          count,
        });
        return (
          <span
            key={key}
            className="bg-bg-elevated/90 inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg border border-border-subtle px-2 py-0.5 text-sm"
            title={reactionTitle}
            aria-label={reactionTitle}
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
            {count > 1 && (
              <span className="min-w-0 truncate text-[11px] text-text-muted">{count}</span>
            )}
          </span>
        );
      })}
    </div>
  );
};

export const ActivityPeerReactionsRow = React.memo(ActivityPeerReactionsRowComponent);
ActivityPeerReactionsRow.displayName = "ActivityPeerReactionsRow";
