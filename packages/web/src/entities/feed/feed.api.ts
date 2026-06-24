/**
 * Feed data layer — IDB bootstrap for instant UI and Zulip server refresh for authoritative data.
 */

import { fetchAllMessagesPage } from "~/shared/api/zulip-messages";
import type { MessagesPageResult, MockMessage } from "~/shared/api/zulip.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger, logApiCall } from "~/shared/lib/logger";
import { getInstanceMessagesAscending } from "~/shared/lib/message-cache-db";

const log = createLogger("feed:api");

export async function fetchFeedMessages(
  anchor: number | "newest" = "newest",
  numBefore = 50,
  options?: { signal?: AbortSignal },
): Promise<MessagesPageResult> {
  const start = performance.now();
  try {
    const page = await fetchAllMessagesPage(anchor, numBefore, options);
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=all", {
      status: 200,
      durationMs,
    });
    return page;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const aborted = isAbortError(err) || options?.signal?.aborted === true;
    logApiCall("GET", "/messages?narrow=all", {
      durationMs,
      ...(aborted ? { aborted: true } : { error: String(err) }),
    });
    if (!aborted) {
      log.error("Failed to fetch feed messages", { error: String(err) });
    }
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
