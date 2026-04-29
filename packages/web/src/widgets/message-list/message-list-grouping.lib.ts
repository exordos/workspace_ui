import type { MockMessage } from "~/shared/api/zulip.types";

/** Splits the message array into groups of consecutive messages from the same sender. */
export function getSenderGroups(items: MockMessage[]): MockMessage[][] {
  const result: MockMessage[][] = [];
  for (const msg of items) {
    const last = result[result.length - 1];
    if (last?.[0]?.sender_id === msg.sender_id) last.push(msg);
    else result.push([msg]);
  }
  return result;
}
