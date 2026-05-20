/**
 * Index pending outgoing messages by local echo key for O(1) realtime echo replacement.
 */
import type { MockMessage } from "~/shared/api/zulip.types";

export function buildSendingEchoKeyIndex(messages: readonly MockMessage[]): Map<number, number> {
  const index = new Map<number, number>();
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    if (message.delivery_status !== "sending") continue;
    const key = message.local_echo_key ?? (message.id < 0 ? message.id : undefined);
    if (key !== undefined) {
      index.set(key, i);
    }
  }
  return index;
}
