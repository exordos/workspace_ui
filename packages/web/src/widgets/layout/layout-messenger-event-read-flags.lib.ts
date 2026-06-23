/**
 * Pure helpers for the messenger API `update_message_flags` realtime events.
 */
import type { MockMessage, MessengerEvent } from "~/shared/api/messenger.types";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { LayoutMessageFlagOp } from "./layout-messenger-event-dispatch.types";

export interface ParsedUpdateMessageFlagsEvent {
  op: LayoutMessageFlagOp;
  flag: string;
  messageIds: MessageId[];
  markAllRead: boolean;
}

function dedupeValidMessageIds(raw: unknown): MessageId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<MessageId>();
  const out: MessageId[] = [];
  for (const rawId of raw) {
    const id = normalizeMessageId(rawId);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function resolveMessageFlagOp(event: MessengerEvent): LayoutMessageFlagOp | null {
  const rawOp = event.op ?? event.operation;
  if (rawOp === "add" || rawOp === "remove") return rawOp;
  return null;
}

/** Parses `update_message_flags` queue events for flag handlers. */
export function parseUpdateMessageFlagsEvent(
  event: MessengerEvent,
): ParsedUpdateMessageFlagsEvent | null {
  if (event.type !== "update_message_flags") return null;
  const op = resolveMessageFlagOp(event);
  if (op == null) return null;
  const flag = typeof event.flag === "string" ? event.flag : "";
  const messageIds = dedupeValidMessageIds(event.messages);
  const markAllRead = flag === "read" && op === "add" && event.all === true;
  return { op, flag, messageIds, markAllRead };
}

/** Loaded open-chat rows to update after an authoritative mark-all-read event. */
export function collectLoadedMessageIds(messages: readonly MockMessage[]): MessageId[] {
  return messages.map((message) => message.id);
}
