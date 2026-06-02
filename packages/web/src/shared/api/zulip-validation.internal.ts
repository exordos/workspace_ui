/**
 * Shared validation helpers for Zulip API calls. Internal to zulip API modules.
 */
import { guard, invariant } from "~/shared/lib/guards";

export function validateMessageIds(messageIds: number[], context: string): number[] {
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

export type MessagesApiAnchor = number | "newest" | "oldest" | "first_unread";

export function validateMessagesApiAnchor(
  anchor: string | number,
  context: string,
): MessagesApiAnchor {
  return typeof anchor === "number"
    ? guard.messageId(anchor, `${context}.anchor`)
    : guard.oneOf(
        guard.nonEmpty(anchor, `${context}.anchor`),
        ALLOWED_MESSAGE_ANCHORS,
        `${context}.anchor`,
      );
}

export function validateNonNegativeInteger(value: number, label: string): number {
  invariant(
    Number.isInteger(value) && value >= 0,
    `${label} must be a non-negative integer, got: ${value}`,
  );
  return value;
}
