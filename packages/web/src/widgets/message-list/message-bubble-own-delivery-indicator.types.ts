import type { MockMessage } from "~/shared/api/zulip.types";
import type { MessageBubbleCallbacks } from "./message-bubble.types";

export interface MessageBubbleOwnDeliveryIndicatorProps {
  message: MockMessage;
  status: "sent" | "sending" | "failed";
  onViews?: MessageBubbleCallbacks["onViews"];
  onRetryFailedOutgoing?: MessageBubbleCallbacks["onRetryFailedOutgoing"];
  onRemoveFailedOutgoing?: MessageBubbleCallbacks["onRemoveFailedOutgoing"];
}
