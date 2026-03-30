/**
 * Feed API — fetches all messages in chronological order with pagination.
 *
 * Uses the Zulip messages endpoint with no narrow (all messages)
 * and anchor-based pagination for infinite scroll.
 */

import { fetchAllMessagesPage } from "~/shared/api/zulip-messages";
import type { MessagesPageResult } from "~/shared/api/zulip.types";
import { createLogger, logApiCall } from "~/shared/lib/logger";

const log = createLogger("feed:api");

/**
 * Fetches a page of all messages for the feed view.
 *
 * @param anchor - Message ID to fetch relative to, or "newest" for latest.
 * @param numBefore - Number of messages before the anchor to fetch.
 */
export async function fetchFeedMessages(
  anchor: number | "newest" = "newest",
  numBefore = 50,
): Promise<MessagesPageResult> {
  const start = performance.now();
  try {
    const page = await fetchAllMessagesPage(anchor, numBefore);
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=all", {
      status: 200,
      durationMs,
    });
    return page;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=all", {
      error: String(err),
      durationMs,
    });
    log.error("Failed to fetch feed messages", { error: String(err) });
    throw err;
  }
}
