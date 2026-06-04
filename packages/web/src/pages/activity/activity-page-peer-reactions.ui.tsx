import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import type { Reaction, RealmEmoji, ZulipRawMessage } from "~/shared/api/zulip.types";
import { normalizeEmojiShortcodeName } from "~/shared/lib/emoji-shortcodes.lib";
import { ensureRealmEmojisLoaded, getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import { resolveReactionTitle } from "~/widgets/message-list/message-bubble-reactions-row.lib";
import { getActivityPeerReactionGroups } from "./activity-page.lib";

export interface ActivityPeerReactionsRowProps {
  message: ZulipRawMessage;
  currentUserId: number | null;
}

const ActivityPeerReactionsRowComponent: React.FC<ActivityPeerReactionsRowProps> = ({
  message,
  currentUserId,
}) => {
  const getUser = useUsersStore((s) => s.getUser);
  const [customEmojis, setCustomEmojis] = useState<RealmEmoji[]>(() => getCachedRealmEmojis());

  const hasPeerRealmEmoji = useMemo(
    () =>
      (message.reactions ?? []).some(
        (reaction) =>
          reaction.reaction_type === "realm_emoji" &&
          currentUserId != null &&
          reaction.user_id !== currentUserId,
      ),
    [currentUserId, message.reactions],
  );

  useEffect(() => {
    if (!hasPeerRealmEmoji) return;
    void ensureRealmEmojisLoaded()
      .then((list) => {
        setCustomEmojis(list);
      })
      .catch(() => {});
  }, [hasPeerRealmEmoji]);

  const customEmojiById = useMemo(() => {
    const map = new Map<string, RealmEmoji>();
    for (const emoji of customEmojis) {
      const id = emoji.id.trim();
      if (id.length > 0) {
        map.set(id, emoji);
      }
    }
    return map;
  }, [customEmojis]);

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
    (reaction: Reaction): string | undefined => {
      if (reaction.reaction_type !== "realm_emoji") {
        return undefined;
      }
      const byCode = customEmojiById.get(reaction.emoji_code.trim());
      if (byCode != null) {
        return byCode.imgUrl;
      }
      const byName = customEmojiByName.get(normalizeEmojiShortcodeName(reaction.emoji_name));
      return byName?.imgUrl;
    },
    [customEmojiById, customEmojiByName],
  );

  const reactionGroups = useMemo(
    () =>
      getActivityPeerReactionGroups(
        message.reactions ?? [],
        currentUserId,
        resolveCustomEmojiImageUrl,
      ),
    [currentUserId, message.reactions, resolveCustomEmojiImageUrl],
  );

  const resolveReactionAuthorLabel = useCallback(
    (userId: number): string => {
      const reactionUser = getUser(userId);
      const fullName = reactionUser?.full_name?.trim();
      return fullName != null && fullName.length > 0 ? fullName : `#${userId}`;
    },
    [getUser],
  );

  if (reactionGroups.length === 0) return null;

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1"
      data-testid={`activity-peer-reactions-${message.id}`}
    >
      {reactionGroups.map(({ key, count, userIds, displayChar, emojiName, imageUrl }) => {
        const reactionAuthors = userIds.map(resolveReactionAuthorLabel).join(", ");
        const reactionPrefix = imageUrl != null ? `:${emojiName}:` : displayChar;
        const reactionTitle = resolveReactionTitle({
          reactionAuthors,
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
            {reactionAuthors.length > 0 && (
              <span className="min-w-0 truncate text-[11px] text-text-muted">
                {reactionAuthors}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
};

export const ActivityPeerReactionsRow = React.memo(ActivityPeerReactionsRowComponent);
ActivityPeerReactionsRow.displayName = "ActivityPeerReactionsRow";
