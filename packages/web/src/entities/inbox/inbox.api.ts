/**
 * Inbox data layer — local IDB bootstrap plus a no-network server fetch placeholder.
 */

import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { getInstanceMessagesAscending } from "~/shared/lib/message-cache-db";
import { buildInboxEntries } from "./inbox.lib";
import type { InboxMuteFilterOptions } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

export interface FetchInboxEntriesWithSnapshotResult {
  entries: InboxEntry[];
  unreadSnapshot: ZulipUnreadMessagesSnapshot;
  unreadSnapshotComplete: boolean;
  unreadMessages: ZulipRawMessage[];
}

const EMPTY_UNREAD_SNAPSHOT: ZulipUnreadMessagesSnapshot = {
  streams: [],
  dms: [],
  totalCount: 0,
  mentionMessageIds: [],
};

function rejectIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export function fetchInboxEntriesWithSnapshot(
  _currentUserId: number | null = null,
  _options: InboxMuteFilterOptions = {},
  requestOptions?: { signal?: AbortSignal },
): Promise<FetchInboxEntriesWithSnapshotResult> {
  rejectIfAborted(requestOptions?.signal);
  return Promise.resolve({
    entries: [],
    unreadSnapshot: EMPTY_UNREAD_SNAPSHOT,
    unreadSnapshotComplete: true,
    unreadMessages: [],
  });
}

export async function fetchInboxEntries(
  currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
  requestOptions?: { signal?: AbortSignal },
): Promise<InboxEntry[]> {
  const result = await fetchInboxEntriesWithSnapshot(currentUserId, options, requestOptions);
  return result.entries;
}

/** Local inbox bootstrap from message IDB; unread = messages without the `read` flag. */
export async function hydrateInboxEntriesFromCache(
  instanceId: string | null,
  currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
): Promise<InboxEntry[]> {
  if (instanceId == null) return [];
  const messages = await getInstanceMessagesAscending(instanceId);
  const unread = messages.filter((message) => !message.flags?.includes("read"));
  return buildInboxEntries(unread, currentUserId, options);
}
