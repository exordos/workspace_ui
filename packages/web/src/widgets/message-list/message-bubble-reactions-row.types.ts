import type { MockMessage } from "~/shared/api/zulip.types";
import type { GroupedReaction } from "./message-bubble-emoji.lib";
import type { MessageBubbleCallbacks } from "./message-bubble.types";

export interface MessageBubbleReactionsRowProps {
  message: MockMessage;
  isOwn: boolean;
  currentUserId: number | undefined;
  reactionGroups: GroupedReaction[];
  resolveReactionAuthorLabel: (userId: number) => string;
  callbacks?: MessageBubbleCallbacks;
}
