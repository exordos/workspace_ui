import type { InboxEntry } from "./inbox.types";

export function mapInboxEntryAfterMarkRead(
  entry: InboxEntry,
  readIds: ReadonlySet<number>,
): InboxEntry | null {
  const remaining = entry.messageIds.filter((id) => !readIds.has(id));
  if (remaining.length === entry.messageIds.length) {
    return entry;
  }
  if (remaining.length === 0) {
    return null;
  }
  return {
    ...entry,
    messageIds: remaining,
    unreadCount: remaining.length,
  };
}

export function applyMarkAsReadToInboxEntries(
  entries: InboxEntry[],
  messageIds: number[],
): InboxEntry[] {
  const readIds = new Set(messageIds);
  return entries
    .map((entry) => mapInboxEntryAfterMarkRead(entry, readIds))
    .filter((entry): entry is InboxEntry => entry !== null);
}
