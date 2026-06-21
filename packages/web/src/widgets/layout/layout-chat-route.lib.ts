/** Parses `?msg=` anchor id from messenger route search string. */
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";

export function parseFocusedMessageIdFromSearch(search: string): MessageId | null {
  const raw = new URLSearchParams(search).get("msg");
  return normalizeMessageId(raw);
}
