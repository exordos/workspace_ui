/**
 * Index pending outgoing messages by local echo key for O(1) realtime echo replacement.
 */
import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";

export function buildSendingEchoKeyIndex(messages: readonly MockMessage[]): Map<MessageId, number> {
  const index = new Map<MessageId, number>();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    if (message.delivery_status !== "sending") continue;
    const key = message.local_echo_key ?? message.id;
    if (key !== undefined) {
      index.set(key, i);
    }
  }
  return index;
}
