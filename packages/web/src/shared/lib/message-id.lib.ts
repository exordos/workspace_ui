export type MessageId = string;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMessageId(value: unknown): value is MessageId {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function normalizeMessageId(value: unknown): MessageId | null {
  if (!isMessageId(value)) {
    return null;
  }
  return value.trim().toLowerCase();
}

export function createMessageId(): MessageId {
  return crypto.randomUUID();
}

export function compareMessageTimeline(
  left: { id: MessageId; timestamp?: number },
  right: { id: MessageId; timestamp?: number },
): number {
  const leftTimestamp = left.timestamp ?? 0;
  const rightTimestamp = right.timestamp ?? 0;
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return left.id.localeCompare(right.id);
}
