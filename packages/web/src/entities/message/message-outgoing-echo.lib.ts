/**
 * Normalizes message bodies so an optimistic client draft can match a Zulip server echo
 * (often HTML-rendered). Used when merging real-time `message` events with pending sends.
 *
 * Out-of-order delivery of identical bodies can still pair incorrectly; pairing uses a FIFO
 * queue of echo keys plus this content check — see `useCurrentChatMessagesStore.appendMessage`.
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import { stripHtml } from "~/shared/lib/html";

function normalizeEchoBody(raw: string): string {
  return stripHtml(raw).replace(/\s+/g, " ").trim();
}

/** True if `serverEcho` is likely the delivered version of `optimistic` (same author assumed). */
export function outgoingEchoContentMatches(
  optimistic: MockMessage,
  serverEcho: MockMessage,
): boolean {
  return normalizeEchoBody(optimistic.content) === normalizeEchoBody(serverEcho.content);
}
