/**
 * Message reaction add/remove handlers for the chat page message list.
 */
import { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { addReaction, removeReaction } from "~/shared/api/zulip-messages";
import type { MessageReactionPayload, Reaction } from "~/shared/api/zulip.types";

export interface UseChatPageReactionParams {
  currentUserId: number | null;
  setActionError: (message: string | null) => void;
  updateMessageReactionInStore: (
    messageId: number,
    reaction: Reaction,
    op: "add" | "remove",
  ) => void;
}

export interface UseChatPageReactionResult {
  onMessageAddReaction: (messageId: number, payload: MessageReactionPayload) => void;
  onMessageRemoveReaction: (messageId: number, payload: MessageReactionPayload) => void;
}

function reactionFromPayload(payload: MessageReactionPayload, userId: number): Reaction {
  return {
    emoji_name: payload.emojiName,
    emoji_code: payload.emojiCode ?? "",
    reaction_type: payload.reactionType,
    user_id: userId,
  };
}

export function useChatPageReaction(params: UseChatPageReactionParams): UseChatPageReactionResult {
  const { currentUserId, setActionError, updateMessageReactionInStore } = params;

  const onMessageAddReaction = useCallback(
    (messageId: number, payload: MessageReactionPayload) => {
      setActionError(null);
      addReaction(messageId, payload.emojiName, {
        reactionType: payload.reactionType,
        emojiCode: payload.emojiCode,
      })
        .then(() => {
          updateMessageReactionInStore(
            messageId,
            reactionFromPayload(payload, currentUserId ?? 0),
            "add",
          );
        })
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : t("message.reactionError")),
        );
    },
    [currentUserId, setActionError, updateMessageReactionInStore],
  );

  const onMessageRemoveReaction = useCallback(
    (messageId: number, payload: MessageReactionPayload) => {
      setActionError(null);
      removeReaction(messageId, payload.emojiName, {
        reactionType: payload.reactionType,
        emojiCode: payload.emojiCode,
      })
        .then(() => {
          updateMessageReactionInStore(
            messageId,
            reactionFromPayload(payload, currentUserId ?? 0),
            "remove",
          );
        })
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : t("message.reactionError")),
        );
    },
    [currentUserId, setActionError, updateMessageReactionInStore],
  );

  return { onMessageAddReaction, onMessageRemoveReaction };
}
