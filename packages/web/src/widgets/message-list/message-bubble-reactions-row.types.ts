import type { MockMessage } from "~/shared/api/messenger.types";
import type { GroupedReaction } from "./message-bubble-emoji.lib";
import type { MessageBubbleCallbacks } from "./message-bubble.types";

export interface MessageBubbleReactionsRowProps {
  message: MockMessage;
  isOwn: boolean;
  ownReactionEmojiNames: ReadonlySet<string>;
  reactionGroups: GroupedReaction[];
  callbacks?: MessageBubbleCallbacks;
}
