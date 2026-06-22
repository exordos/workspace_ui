/**
 * Inbox data layer — stream/topic metadata backed unread entries.
 */

import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { buildInboxEntriesFromStreamMetadata } from "./inbox.lib";
import type { InboxMuteFilterOptions } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

const log = createLogger("inbox:api");

export interface FetchUnreadInboxEntriesResult {
  entries: InboxEntry[];
  complete: boolean;
  messages: WorkspaceRawMessage[];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export function fetchUnreadInboxEntries(
  _currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
  requestOptions?: { signal?: AbortSignal },
): Promise<FetchUnreadInboxEntriesResult> {
  const start = performance.now();
  try {
    throwIfAborted(requestOptions?.signal);
    const entries = buildInboxEntriesFromStreamMetadata(
      useChatListStore.getState().streamsMap,
      options,
    );
    throwIfAborted(requestOptions?.signal);
    const durationMs = Math.round(performance.now() - start);
    log.info("Built inbox entries from stream/topic unread metadata", {
      entryCount: entries.length,
      durationMs,
    });
    return Promise.resolve({
      entries,
      complete: true,
      messages: [],
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    log.error("Failed to fetch inbox entries", {
      error: String(err),
      durationMs,
    });
    const error = err instanceof Error ? err : new Error(String(err));
    return Promise.reject(error);
  }
}

export async function fetchInboxEntries(
  currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
  requestOptions?: { signal?: AbortSignal },
): Promise<InboxEntry[]> {
  const result = await fetchUnreadInboxEntries(currentUserId, options, requestOptions);
  return result.entries;
}

/** Inbox hydrate uses current stream/topic metadata; message cache is not authoritative for unread. */
export function hydrateInboxEntriesFromMetadata(
  _instanceId: string | null,
  _currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
): Promise<InboxEntry[]> {
  return Promise.resolve(
    buildInboxEntriesFromStreamMetadata(useChatListStore.getState().streamsMap, options),
  );
}
