/**
 * Inbox API — fetches unread messages and groups them into inbox entries.
 *
 * Uses the Zulip `is:unread` narrow to get unread messages, then
 * groups them by stream+topic (for stream messages) or DM conversation
 * route slug (for private messages). Returns InboxEntry[] sorted by most recent.
 */

import { fetchMessagesWithNarrow } from "~/shared/api/zulip";
import { createLogger, logApiCall } from "~/shared/lib/logger";
import { buildInboxEntries } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

const log = createLogger("inbox:api");

/**
 * Fetches unread messages from Zulip and groups them into inbox entries.
 * Stream messages group by (streamId, topic); DMs group by conversation route slug.
 */
export async function fetchInboxEntries(
  currentUserId: number | null = null,
): Promise<InboxEntry[]> {
  const start = performance.now();
  try {
    const messages = await fetchMessagesWithNarrow(
      [{ operator: "is", operand: "unread" }],
      "newest",
      5000,
      0,
    );
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=is:unread", { status: 200, durationMs });
    return buildInboxEntries(messages, currentUserId);
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=is:unread", {
      error: String(err),
      durationMs,
    });
    log.error("Failed to fetch inbox entries", { error: String(err) });
    throw err;
  }
}
