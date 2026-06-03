/**
 * Pure helpers for Zulip `update_message_flags` realtime events (read/unread sync).
 */
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type { MockMessage, ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip.types";
import type { LayoutMessageFlagOp } from "./layout-zulip-event-dispatch.types";

export interface ParsedUpdateMessageFlagsEvent {
  op: LayoutMessageFlagOp;
  flag: string;
  messageIds: number[];
  markAllRead: boolean;
}

export interface ZulipMarkUnreadMessageDetail {
  type: "stream" | "private";
  stream_id?: number;
  topic?: string;
  user_ids?: number[];
  mentioned?: boolean;
}

export const EMPTY_MARK_ALL_READ_SNAPSHOT: ZulipUnreadMessagesSnapshot = {
  streams: [],
  dms: [],
  totalCount: 0,
  mentionMessageIds: [],
};

function dedupeValidMessageIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of raw) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function resolveMessageFlagOp(event: ZulipEvent): LayoutMessageFlagOp | null {
  const rawOp = event.op ?? event.operation;
  if (rawOp === "add" || rawOp === "remove") return rawOp;
  return null;
}

/** Parses `update_message_flags` queue events for flag handlers. */
export function parseUpdateMessageFlagsEvent(
  event: ZulipEvent,
): ParsedUpdateMessageFlagsEvent | null {
  if (event.type !== "update_message_flags") return null;
  const op = resolveMessageFlagOp(event);
  if (op == null) return null;
  const flag = typeof event.flag === "string" ? event.flag : "";
  const messageIds = dedupeValidMessageIds(event.messages);
  const markAllRead = flag === "read" && op === "add" && event.all === true;
  return { op, flag, messageIds, markAllRead };
}

/** Loaded open-chat rows that still lack the read flag. */
export function collectUnreadLoadedMessageIds(messages: readonly MockMessage[]): number[] {
  const out: number[] = [];
  for (const message of messages) {
    if (message.flags?.includes("read")) continue;
    if (!Number.isInteger(message.id) || message.id <= 0) continue;
    out.push(message.id);
  }
  return out;
}

/** Converts Zulip mark-unread `message_details` into minimal raw messages for location indexing. */
export function zulipRawMessagesFromMarkUnreadDetails(
  messageIds: readonly number[],
  messageDetails: Record<string, ZulipMarkUnreadMessageDetail> | undefined,
  currentUserId: number | null,
): ZulipRawMessage[] {
  if (messageDetails == null) return [];
  const placeholderSenderId =
    currentUserId != null && currentUserId > 0 ? currentUserId + 100_000 : 1;
  const out: ZulipRawMessage[] = [];

  for (const messageId of messageIds) {
    const detail = messageDetails[String(messageId)];
    if (detail == null) continue;

    if (detail.type === "stream" && detail.stream_id != null) {
      out.push({
        id: messageId,
        sender_id: placeholderSenderId,
        content: "",
        timestamp: 0,
        type: "stream",
        stream_id: detail.stream_id,
        subject: detail.topic ?? "",
        flags: [],
      });
      continue;
    }

    if (detail.type === "private" && detail.user_ids != null) {
      const display_recipient = detail.user_ids.map((id) => ({
        id,
        full_name: "",
        email: "",
      }));
      const senderId =
        detail.user_ids.find((id) => id !== currentUserId) ??
        detail.user_ids[0] ??
        placeholderSenderId;
      out.push({
        id: messageId,
        sender_id: senderId,
        content: "",
        timestamp: 0,
        type: "private",
        display_recipient,
        flags: [],
      });
    }
  }

  return out;
}
