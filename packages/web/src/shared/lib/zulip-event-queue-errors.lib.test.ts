import { describe, expect, it } from "vitest";
import {
  isBadEventQueueIdError,
  isBadEventQueueIdResponse,
  isEventPollSuccessResponse,
  shouldReRegisterEventQueueFromPollResponse,
} from "./zulip-event-queue-errors.lib";

describe("zulip-event-queue-errors", () => {
  it("treats result success as valid poll", () => {
    expect(isEventPollSuccessResponse({ result: "success", events: [] })).toBe(true);
    expect(shouldReRegisterEventQueueFromPollResponse({ result: "success", events: [] })).toBe(
      false,
    );
  });

  it("re-registers on error or missing result", () => {
    expect(shouldReRegisterEventQueueFromPollResponse({ result: "error", msg: "fail" })).toBe(true);
    expect(shouldReRegisterEventQueueFromPollResponse({ events: [] })).toBe(true);
    expect(shouldReRegisterEventQueueFromPollResponse(null)).toBe(true);
  });

  it("detects BAD_EVENT_QUEUE_ID by code", () => {
    expect(
      isBadEventQueueIdResponse({
        result: "error",
        code: "BAD_EVENT_QUEUE_ID",
        msg: "expired",
      }),
    ).toBe(true);
  });

  it("detects Russian Zulip error message without relying on code only", () => {
    expect(
      isBadEventQueueIdResponse({
        result: "error",
        msg: "Недопустимый идентификатор очереди событий: q-1",
        queue_id: "q-1",
      }),
    ).toBe(true);
  });

  it("detects BAD_EVENT_QUEUE_ID in thrown Error message", () => {
    expect(isBadEventQueueIdError(new Error("BAD_EVENT_QUEUE_ID"))).toBe(true);
  });
});
