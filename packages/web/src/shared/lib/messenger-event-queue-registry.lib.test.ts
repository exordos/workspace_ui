import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllMessengerEventQueueIds,
  clearMessengerEventQueueId,
  getMessengerEventQueueIdForCurrentInstance,
  setMessengerEventQueueId,
} from "./messenger-event-queue-registry.lib";

const mockGetCurrentInstance = vi.fn();

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: () => mockGetCurrentInstance(),
}));

describe("messenger-event-queue-registry", () => {
  beforeEach(() => {
    clearAllMessengerEventQueueIds();
    mockGetCurrentInstance.mockReset();
  });

  it("returns queue id for the current instance", () => {
    mockGetCurrentInstance.mockReturnValue({ id: "inst-a" });
    setMessengerEventQueueId("inst-a", "q-1");
    expect(getMessengerEventQueueIdForCurrentInstance()).toBe("q-1");
  });

  it("clears queue id for an instance", () => {
    mockGetCurrentInstance.mockReturnValue({ id: "inst-a" });
    setMessengerEventQueueId("inst-a", "q-1");
    clearMessengerEventQueueId("inst-a");
    expect(getMessengerEventQueueIdForCurrentInstance()).toBeUndefined();
  });
});
