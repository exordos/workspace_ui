import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageBubbleOwnDeliveryStatus } from "./message-bubble.types";

export function resolveOwnMessageDeliveryStatus(
  message: MockMessage,
): MessageBubbleOwnDeliveryStatus {
  if (message.delivery_status != null) {
    return message.delivery_status;
  }
  return "sent";
}
