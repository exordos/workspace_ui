import type { MessengerMessage, MessengerUuid } from "./messenger.types";

export interface MessengerReadBoundary {
  ownerKey: string;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  createdAt: string;
  messageUuid: MessengerUuid;
  epochVersion?: number;
}

const boundaries = new Map<string, MessengerReadBoundary>();

function boundaryKey(
  ownerKey: string,
  streamUuid: MessengerUuid,
  topicUuid: MessengerUuid,
): string {
  return `${ownerKey}\u0000${streamUuid}\u0000${topicUuid}`;
}

export function compareMessengerMessageOrder(
  left: Pick<MessengerReadBoundary, "createdAt" | "messageUuid">,
  right: Pick<MessengerReadBoundary, "createdAt" | "messageUuid">,
): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  return createdAtOrder !== 0 ? createdAtOrder : left.messageUuid.localeCompare(right.messageUuid);
}

export function readMessengerReadBoundary(
  ownerKey: string,
  streamUuid: MessengerUuid,
  topicUuid: MessengerUuid,
): MessengerReadBoundary | null {
  return boundaries.get(boundaryKey(ownerKey, streamUuid, topicUuid)) ?? null;
}

export function advanceMessengerReadBoundary(
  boundary: MessengerReadBoundary,
): MessengerReadBoundary {
  const key = boundaryKey(boundary.ownerKey, boundary.streamUuid, boundary.topicUuid);
  const previous = boundaries.get(key);
  if (previous != null && compareMessengerMessageOrder(previous, boundary) >= 0) return previous;
  boundaries.set(key, boundary);
  return boundary;
}

export function restoreMessengerReadBoundaries(rows: readonly MessengerReadBoundary[]): void {
  for (const row of rows) advanceMessengerReadBoundary(row);
}

export function clearMessengerReadBoundariesForOwner(ownerKey: string): void {
  for (const [key, boundary] of boundaries) {
    if (boundary.ownerKey === ownerKey) boundaries.delete(key);
  }
}

export function applyMessengerReadBoundary<TMessage extends MessengerMessage>(
  message: TMessage,
  ownerKey: string,
): TMessage {
  if (message.read || message.isOwn) return message;
  const boundary = readMessengerReadBoundary(ownerKey, message.streamUuid, message.topicUuid);
  if (boundary == null) return message;
  return compareMessengerMessageOrder(
    { createdAt: message.createdAt, messageUuid: message.uuid },
    boundary,
  ) <= 0
    ? { ...message, read: true }
    : message;
}

export function applyMessengerReadBoundaries<TMessage extends MessengerMessage>(
  messages: readonly TMessage[],
  ownerKey: string,
): TMessage[] {
  return messages.map((message) => applyMessengerReadBoundary(message, ownerKey));
}
