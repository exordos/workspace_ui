/**
 * Message reaction add/remove handlers for the legacy chat page message list.
 */
import { useCallback } from "react";
import { t } from "~/i18n/i18n";

export interface ChatPageReactionPayload {
  emojiName: string;
  reactionType: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  emojiCode?: string;
  imageUrl?: string;
}

export interface ChatPageReaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: ChatPageReactionPayload["reactionType"];
  user_id: number;
}

export interface UseChatPageReactionParams {
  currentUserId: number | null;
  setActionError: (message: string | null) => void;
  updateMessageReactionInStore: (
    messageId: number,
    reaction: ChatPageReaction,
    op: "add" | "remove",
  ) => void;
}

export interface UseChatPageReactionResult {
  onMessageAddReaction: (messageId: number, payload: ChatPageReactionPayload) => void;
  onMessageRemoveReaction: (messageId: number, payload: ChatPageReactionPayload) => void;
}

export function useChatPageReaction(params: UseChatPageReactionParams): UseChatPageReactionResult {
  const { setActionError } = params;

  const onMessageAddReaction = useCallback(
    (_messageId: number, _payload: ChatPageReactionPayload) => {
      setActionError(t("message.reactionError"));
    },
    [setActionError],
  );

  const onMessageRemoveReaction = useCallback(
    (_messageId: number, _payload: ChatPageReactionPayload) => {
      setActionError(t("message.reactionError"));
    },
    [setActionError],
  );

  return { onMessageAddReaction, onMessageRemoveReaction };
}
