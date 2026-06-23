/**
 * Feed data layer — IDB bootstrap for instant UI and server refresh for authoritative data.
 */

import { fetchAllMessagesPage } from "~/shared/api/messenger-messages";
import type { MessagesPageResult, MockMessage } from "~/shared/api/messenger.types";
import { createLogger, logApiCall } from "~/shared/lib/logger";
import { getInstanceMessagesAscending } from "~/shared/lib/message-cache-db";
import type { MessageId } from "~/shared/lib/message-id.lib";

const log = createLogger("feed:api");

export async function fetchFeedMessages(
  anchor: MessageId = "newest",
  numBefore = 50,
  options?: { signal?: AbortSignal },
): Promise<MessagesPageResult> {
  const start = performance.now();
  try {
    const page = await fetchAllMessagesPage(anchor, numBefore, options);
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages/", {
      status: 200,
      durationMs,
    });
    return page;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages/", {
      error: String(err),
      durationMs,
    });
    log.error("Failed to fetch feed messages", { error: String(err) });
    throw err;
  }
}

/** Best-effort IDB bootstrap; retention limits may make this slice incomplete. */
export async function hydrateFeedMessagesFromCache(
  instanceId: string | null,
  limit = 200,
): Promise<MockMessage[]> {
  if (instanceId == null) return [];
  const all = await getInstanceMessagesAscending(instanceId);
  if (all.length <= limit) return all;
  return all.slice(all.length - limit);
}
