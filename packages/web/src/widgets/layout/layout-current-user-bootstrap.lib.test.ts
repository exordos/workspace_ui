import { describe, expect, it, vi } from "vitest";
import { syncCurrentUserIdFromActiveInstance } from "./layout-current-user-bootstrap.lib";

describe("syncCurrentUserIdFromActiveInstance", () => {
  it("sets current user id from active instance before bootstrap", () => {
    const setCurrentUserId = vi.fn();

    syncCurrentUserIdFromActiveInstance({
      instances: [
        {
          id: "inst-1",
          realm: "https://z.test",
          email: "user@example.com",
          apiKey: "k1",
          userId: 42,
        },
      ],
      currentInstanceId: "inst-1",
      currentUserId: null,
      setCurrentUserId,
    });

    expect(setCurrentUserId).toHaveBeenCalledWith(42);
  });

  it("clears stale current user id when active instance has no saved user id", () => {
    const setCurrentUserId = vi.fn();

    syncCurrentUserIdFromActiveInstance({
      instances: [
        {
          id: "inst-1",
          realm: "https://z.test",
          email: "user@example.com",
          apiKey: "k1",
        },
      ],
      currentInstanceId: "inst-1",
      currentUserId: 42,
      setCurrentUserId,
    });

    expect(setCurrentUserId).toHaveBeenCalledWith(null);
  });
});
