import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildZulipMessageSendBody } from "./zulip-message-send.internal";

vi.mock("~/shared/lib/zulip-event-queue-registry.lib", () => ({
  getZulipEventQueueIdForCurrentInstance: vi.fn(),
}));

import { getZulipEventQueueIdForCurrentInstance } from "~/shared/lib/zulip-event-queue-registry.lib";

const getQueueIdMock = vi.mocked(getZulipEventQueueIdForCurrentInstance);

describe("buildZulipMessageSendBody", () => {
  beforeEach(() => {
    getQueueIdMock.mockReset();
  });

  it("always includes read_by_sender", () => {
    getQueueIdMock.mockReturnValue(undefined);
    const body = buildZulipMessageSendBody({
      type: "stream",
      to: "general",
      topic: "test",
      content: "hello",
    });
    expect(body.read_by_sender).toBe("true");
    expect(body.queue_id).toBeUndefined();
    expect(body.local_id).toBeUndefined();
  });

  it("includes queue_id and local_id only when both are available", () => {
    getQueueIdMock.mockReturnValue("q-active");
    const body = buildZulipMessageSendBody(
      { type: "stream", to: "general", content: "hi" },
      { localId: "-42" },
    );
    expect(body).toMatchObject({
      read_by_sender: "true",
      queue_id: "q-active",
      local_id: "-42",
    });
  });

  it("omits queue_id when localId is missing even if queue is registered", () => {
    getQueueIdMock.mockReturnValue("q-active");
    const body = buildZulipMessageSendBody({ type: "private", to: [1], content: "hi" });
    expect(body.queue_id).toBeUndefined();
    expect(body.local_id).toBeUndefined();
    expect(body.read_by_sender).toBe("true");
  });

  it("omits queue_id when registry is empty even with localId", () => {
    getQueueIdMock.mockReturnValue(undefined);
    const body = buildZulipMessageSendBody(
      { type: "private", to: [1], content: "hi" },
      { localId: "-1" },
    );
    expect(body.queue_id).toBeUndefined();
    expect(body.local_id).toBeUndefined();
  });
});
