/**
 * Targeted in-place array patches for the current-chat messages list.
 *
 * Avoids full `messages.map` on single-id realtime updates (reactions, flags, edits).
 */
import type { MockMessage } from "~/shared/api/zulip.types";

export function patchMessageAtId(
  messages: readonly MockMessage[],
  messageId: number,
  patch: (message: MockMessage) => MockMessage,
): MockMessage[] {
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return messages as MockMessage[];
  const current = messages[idx]!;
  const nextMessage = patch(current);
  if (nextMessage === current) return messages as MockMessage[];
  const next = messages.slice();
  next[idx] = nextMessage;
  return next;
}

export function patchMessagesFlags(
  messages: readonly MockMessage[],
  messageIds: ReadonlySet<number>,
  flag: string,
  op: "add" | "remove",
): MockMessage[] {
  if (messageIds.size === 0) return messages as MockMessage[];

  let next: MockMessage[] | undefined;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    if (!messageIds.has(message.id)) continue;
    const flags = message.flags ?? [];
    const hasFlag = flags.includes(flag);
    if (op === "add") {
      if (hasFlag) continue;
      if (!next) next = messages.slice();
      next[i] = { ...message, flags: [...flags, flag] };
      continue;
    }
    if (!hasFlag) continue;
    if (!next) next = messages.slice();
    next[i] = { ...message, flags: flags.filter((f) => f !== flag) };
  }
  return next ?? (messages as MockMessage[]);
}
