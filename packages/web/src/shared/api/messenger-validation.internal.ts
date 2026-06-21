/**
 * Shared validation helpers for Messenger API calls. Internal to messenger API modules.
 */
import { guard, invariant } from "~/shared/lib/guards";
import type { MessageId } from "~/shared/lib/message-id.lib";

export function validateMessageIds(messageIds: MessageId[], context: string): MessageId[] {
  return messageIds.map((messageId, index) => guard.messageId(messageId, `${context}[${index}]`));
}

export function validateQueueId(queueId: string, context: string): string {
  return guard.nonEmpty(queueId, `${context}.queueId`);
}

export function validateEventCursor(lastEventId: number, context: string): number {
  invariant(
    Number.isInteger(lastEventId) && lastEventId >= -1,
    `${context}.lastEventId must be an integer >= -1, got: ${lastEventId}`,
  );
  return lastEventId;
}

const ALLOWED_MESSAGE_ANCHORS = ["newest", "oldest", "first_unread"] as const;

/** A message UUID, or one of the `ALLOWED_MESSAGE_ANCHORS` sentinel strings. */
export type MessagesApiAnchor = MessageId;

export function validateMessagesApiAnchor(anchor: string, context: string): MessagesApiAnchor {
  const normalizedAnchor = guard.nonEmpty(anchor, `${context}.anchor`);
  if ((ALLOWED_MESSAGE_ANCHORS as readonly string[]).includes(normalizedAnchor)) {
    return normalizedAnchor;
  }
  return guard.messageId(normalizedAnchor, `${context}.anchor`);
}

export function validateNonNegativeInteger(value: number, label: string): number {
  invariant(
    Number.isInteger(value) && value >= 0,
    `${label} must be a non-negative integer, got: ${value}`,
  );
  return value;
}
