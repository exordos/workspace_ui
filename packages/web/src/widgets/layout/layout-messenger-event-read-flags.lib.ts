/**
 * Pure helpers for the messenger API `update_message_flags` realtime events (read/unread sync).
 */
import type { MessengerUnreadMessagesSnapshot } from "~/shared/api/messenger-unread.lib";
import type {
  MockMessage,
  MessengerEvent,
  WorkspaceRawMessage,
} from "~/shared/api/messenger.types";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
import type { LayoutMessageFlagOp } from "./layout-messenger-event-dispatch.types";

export interface ParsedUpdateMessageFlagsEvent {
  op: LayoutMessageFlagOp;
  flag: string;
  messageIds: MessageId[];
  markAllRead: boolean;
}

export interface WorkspaceMarkUnreadMessageDetail {
  type: "stream" | "private";
  stream_id?: number;
  topic?: string;
  user_ids?: number[];
  mentioned?: boolean;
}

export const EMPTY_MARK_ALL_READ_SNAPSHOT: MessengerUnreadMessagesSnapshot = {
  streams: [],
  dms: [],
  totalCount: 0,
  mentionMessageIds: [],
};

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

/** Loaded open-chat rows that still lack the read flag. */
export function collectUnreadLoadedMessageIds(messages: readonly MockMessage[]): MessageId[] {
  const out: MessageId[] = [];
  for (const message of messages) {
    if (message.flags?.includes("read")) continue;
    out.push(message.id);
  }
  return out;
}

/** Converts Workspace mark-unread `message_details` into minimal raw messages for location indexing. */
export function messengerRawMessagesFromMarkUnreadDetails(
  messageIds: readonly MessageId[],
  messageDetails: Record<string, WorkspaceMarkUnreadMessageDetail> | undefined,
  currentUserId: UserId | null,
): WorkspaceRawMessage[] {
  if (messageDetails == null) return [];
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  const placeholderSenderId =
    numericCurrentUserId != null && numericCurrentUserId > 0 ? numericCurrentUserId + 100_000 : 1;
  const out: WorkspaceRawMessage[] = [];

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
