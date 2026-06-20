import type { GetEventsResult } from "~/shared/api/zulip.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Valid long-poll `/events` body — only `result: "success"` continues polling. */
export function isEventPollSuccessResponse(payload: unknown): boolean {
  return isRecord(payload) && payload.result === "success";
}

/** Any non-success poll payload (error, missing `result`, malformed) → re-register queue. */
export function shouldReRegisterEventQueueFromPollResponse(payload: unknown): boolean {
  return !isEventPollSuccessResponse(payload);
}

/** Zulip long-poll `/events` error: stale or unknown `queue_id`. */
export function isBadEventQueueIdResponse(payload: unknown): payload is GetEventsResult {
  if (!isRecord(payload)) {
    return false;
  }
  if (payload.code === "BAD_EVENT_QUEUE_ID") {
    return true;
  }
  if (payload.result !== "error") {
    return false;
  }
  const msg = typeof payload.msg === "string" ? payload.msg : "";
  if (msg.includes("BAD_EVENT_QUEUE_ID")) {
    return true;
  }
  if (/invalid.*event queue/i.test(msg)) {
    return true;
  }
  if (msg.includes("идентификатор очереди событий")) {
    return true;
  }
  const queueId = typeof payload.queue_id === "string" ? payload.queue_id : "";
  return queueId.length > 0 && (msg.includes("очеред") || msg.toLowerCase().includes("queue"));
}

export function isBadEventQueueIdError(err: unknown): boolean {
  if (isBadEventQueueIdResponse(err)) {
    return true;
  }
  if (!(err instanceof Error)) {
    return false;
  }
  return err.message.includes("BAD_EVENT_QUEUE_ID") || /invalid.*event queue/i.test(err.message);
}
