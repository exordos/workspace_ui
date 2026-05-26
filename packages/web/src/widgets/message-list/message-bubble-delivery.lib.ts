import type { MockMessage } from "~/shared/api/zulip.types";
import type { MessageBubbleOwnDeliveryStatus } from "./message-bubble.types";

export function resolveOwnMessageDeliveryStatus(
  message: MockMessage,
): MessageBubbleOwnDeliveryStatus {
  if (message.delivery_status != null) {
    return message.delivery_status;
  }
  return message.id > 0 ? "sent" : "sending";
}
