import type { MessengerConversationId, MessengerUuid } from "./messenger.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Conversation ids are frontend ids built from backend UUIDs, never Zulip narrows.
export type ParsedMessengerConversationId =
  | { kind: "stream"; streamUuid: MessengerUuid }
  | { kind: "topic"; streamUuid: MessengerUuid; topicUuid: MessengerUuid };

export function isMessengerUuid(value: unknown): value is MessengerUuid {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function assertMessengerUuid(value: string, label: string): void {
  if (!isMessengerUuid(value)) {
    throw new TypeError(`Invalid ${label}`);
  }
}

export function conversationIdForStream(streamUuid: MessengerUuid): MessengerConversationId {
  assertMessengerUuid(streamUuid, "stream uuid");
  return `stream:${streamUuid}`;
}

export function conversationIdForTopic(
  streamUuid: MessengerUuid,
  topicUuid: MessengerUuid,
): MessengerConversationId {
  assertMessengerUuid(streamUuid, "stream uuid");
  assertMessengerUuid(topicUuid, "topic uuid");
  return `topic:${streamUuid}:${topicUuid}`;
}

export function parseMessengerConversationId(
  conversationId: string,
): ParsedMessengerConversationId | null {
  const parts = conversationId.split(":");
  if (parts[0] === "stream" && parts.length === 2) {
    const streamUuid = parts[1];
    if (isMessengerUuid(streamUuid)) {
      return { kind: "stream", streamUuid };
    }
  }
  if (parts[0] === "topic" && parts.length === 3) {
    const streamUuid = parts[1];
    const topicUuid = parts[2];
    if (isMessengerUuid(streamUuid) && isMessengerUuid(topicUuid)) {
      return { kind: "topic", streamUuid, topicUuid };
    }
  }
  return null;
}
