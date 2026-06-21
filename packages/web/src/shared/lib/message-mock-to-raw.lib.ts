/**
 * Converts {@link MockMessage} (UI / IDB) to {@link WorkspaceRawMessage} for chat-list and activity stores.
 */
import type { MockMessage, WorkspaceRawMessage } from "~/shared/api/messenger.types";

export function mockMessageToRawMessage(message: MockMessage): WorkspaceRawMessage {
  const displayRecipient =
    message.display_recipient ?? (message.stream_uuid != null ? (message.channel ?? "") : undefined);
  const isPrivate =
    message.stream_uuid == null &&
    (Array.isArray(displayRecipient) || typeof displayRecipient !== "string");

  return {
    id: message.id,
    sender_id: message.sender_id,
    sender_full_name: message.sender_full_name,
    content: message.content,
    timestamp: message.timestamp,
    display_recipient: displayRecipient,
    subject: message.subject,
    topic_uuid: message.topic_uuid,
    type: isPrivate ? "private" : "stream",
    stream_uuid: message.stream_uuid,
    flags: message.flags,
    reactions: message.reactions,
  };
}
