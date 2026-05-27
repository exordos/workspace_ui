/**
 * Converts {@link MockMessage} (UI / IDB) to {@link ZulipRawMessage} for chat-list and activity stores.
 */
import type { MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";

export function mockMessageToRawMessage(message: MockMessage): ZulipRawMessage {
  const displayRecipient =
    message.display_recipient ?? (message.stream_id != null ? (message.channel ?? "") : undefined);
  const isPrivate =
    message.stream_id == null &&
    (Array.isArray(displayRecipient) || typeof displayRecipient !== "string");

  return {
    id: message.id,
    sender_id: message.sender_id,
    sender_full_name: message.sender_full_name,
    content: message.content,
    timestamp: message.timestamp,
    display_recipient: displayRecipient,
    subject: message.subject,
    type: isPrivate ? "private" : "stream",
    stream_id: message.stream_id,
    flags: message.flags,
    reactions: message.reactions,
  };
}
