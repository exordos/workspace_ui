import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllZulipEventQueueIds,
  clearZulipEventQueueId,
  getZulipEventQueueIdForCurrentInstance,
  setZulipEventQueueId,
} from "./zulip-event-queue-registry.lib";

const mockGetCurrentInstance = vi.fn();

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: () => mockGetCurrentInstance(),
}));

describe("zulip-event-queue-registry", () => {
  beforeEach(() => {
    clearAllZulipEventQueueIds();
    mockGetCurrentInstance.mockReset();
  });

  it("returns queue id for the current instance", () => {
    mockGetCurrentInstance.mockReturnValue({ id: "inst-a" });
    setZulipEventQueueId("inst-a", "q-1");
    expect(getZulipEventQueueIdForCurrentInstance()).toBe("q-1");
  });

  it("clears queue id for an instance", () => {
    mockGetCurrentInstance.mockReturnValue({ id: "inst-a" });
    setZulipEventQueueId("inst-a", "q-1");
    clearZulipEventQueueId("inst-a");
    expect(getZulipEventQueueIdForCurrentInstance()).toBeUndefined();
  });
});
