/**
 * Typing indicator API — sends start/stop typing notifications to Zulip.
 *
 * Zulip API: POST /typing
 *   op: "start" | "stop"
 *   type: "direct" | "stream"
 *
 * For DMs: to = JSON array of user IDs
 * For streams: stream_id + topic
 */

import { zulipApi } from "~/shared/api/client";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("typing-api");

export async function sendTypingStart(userIds: number[]): Promise<void> {
  try {
    await zulipApi.post("/typing", {
      op: "start",
      to: JSON.stringify(userIds),
      type: "direct",
    });
  } catch (err) {
    log.warn("Failed to send typing start", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendTypingStop(userIds: number[]): Promise<void> {
  try {
    await zulipApi.post("/typing", {
      op: "stop",
      to: JSON.stringify(userIds),
      type: "direct",
    });
  } catch (err) {
    log.warn("Failed to send typing stop", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendStreamTypingStart(streamId: number, topic: string): Promise<void> {
  try {
    await zulipApi.post("/typing", {
      op: "start",
      type: "stream",
      stream_id: String(streamId),
      topic,
    });
  } catch (err) {
    log.warn("Failed to send stream typing start", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendStreamTypingStop(streamId: number, topic: string): Promise<void> {
  try {
    await zulipApi.post("/typing", {
      op: "stop",
      type: "stream",
      stream_id: String(streamId),
      topic,
    });
  } catch (err) {
    log.warn("Failed to send stream typing stop", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
