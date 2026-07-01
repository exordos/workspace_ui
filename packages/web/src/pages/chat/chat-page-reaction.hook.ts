/**
 * Message reaction add/remove handlers for the chat page message list.
 */
import { useCallback, useRef } from "react";
import { t } from "~/i18n/i18n";
import {
  addReaction,
  fetchMessageReactions,
  removeReaction,
} from "~/shared/api/messenger-messages";
import type { MessageReactionPayload, Reaction } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { isIamUserUuid, userIdsEqual, type UserId } from "~/shared/lib/user-id.lib";

export interface UseChatPageReactionParams {
  currentUserId: UserId | null;
  setActionError: (message: string | null) => void;
}

export interface UseChatPageReactionResult {
  onMessageAddReaction: (messageId: MessageId, payload: MessageReactionPayload) => void;
  onMessageRemoveReaction: (messageId: MessageId, payload: MessageReactionPayload) => void;
}

function reactionCacheKey(messageId: MessageId, emojiName: string): string {
  return `${messageId}:${emojiName}`;
}

export function useChatPageReaction(params: UseChatPageReactionParams): UseChatPageReactionResult {
  const { currentUserId, setActionError } = params;
  const ownUserUuid = isIamUserUuid(currentUserId) ? currentUserId : null;
  const ownReactionsRef = useRef(new Map<string, Reaction>());

  const rememberOwnReactions = useCallback(
    (messageId: MessageId, reactions: Reaction[]) => {
      if (ownUserUuid == null) {
        return;
      }
      for (const reaction of reactions) {
        if (userIdsEqual(reaction.user_uuid, ownUserUuid)) {
          ownReactionsRef.current.set(reactionCacheKey(messageId, reaction.emoji_name), reaction);
        }
      }
    },
    [ownUserUuid],
  );

  const getOwnReaction = useCallback(
    async (messageId: MessageId, emojiName: string): Promise<Reaction | null> => {
      const key = reactionCacheKey(messageId, emojiName);
      const cached = ownReactionsRef.current.get(key);
      if (cached != null) {
        return cached;
      }
      if (ownUserUuid == null) {
        return null;
      }
      const reactions = await fetchMessageReactions(messageId, { userUuid: ownUserUuid });
      rememberOwnReactions(messageId, reactions);
      return ownReactionsRef.current.get(key) ?? null;
    },
    [ownUserUuid, rememberOwnReactions],
  );

  const onMessageAddReaction = useCallback(
    (messageId: MessageId, payload: MessageReactionPayload) => {
      setActionError(null);
      addReaction(messageId, payload.emojiName, {
        ...(ownUserUuid != null ? { currentUserUuid: ownUserUuid } : {}),
      })
        .then(({ reaction }) => {
          ownReactionsRef.current.set(reactionCacheKey(messageId, reaction.emoji_name), reaction);
        })
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : t("message.reactionError")),
        );
    },
    [ownUserUuid, setActionError],
  );

  const onMessageRemoveReaction = useCallback(
    (messageId: MessageId, payload: MessageReactionPayload) => {
      setActionError(null);
      getOwnReaction(messageId, payload.emojiName)
        .then(async (reaction) => {
          if (reaction == null) {
            return;
          }
          await removeReaction(reaction.uuid);
          ownReactionsRef.current.delete(reactionCacheKey(messageId, reaction.emoji_name));
        })
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : t("message.reactionError")),
        );
    },
    [getOwnReaction, setActionError],
  );

  return { onMessageAddReaction, onMessageRemoveReaction };
}
