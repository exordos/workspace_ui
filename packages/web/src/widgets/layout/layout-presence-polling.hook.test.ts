import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutPresencePolling } from "./layout-presence-polling.hook";

const fetchRealmPresenceMock = vi.fn();

vi.mock("~/shared/api/zulip-users", () => ({
  fetchRealmPresence: () => fetchRealmPresenceMock(),
}));

vi.mock("~/shared/lib/visibility", () => ({
  createResilientInterval: () => () => {},
}));

vi.mock("~/entities/user/user.model", () => ({
  useUsersStore: {
    getState: () => ({
      setPresenceByEmail: vi.fn(),
    }),
  },
}));

describe("useLayoutPresencePolling", () => {
  beforeEach(() => {
    fetchRealmPresenceMock.mockResolvedValue({ result: "success", presences: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches presence once on mount when enabled", async () => {
    renderHook(() => useLayoutPresencePolling({ enabled: true, pollMs: 90_000 }));

    await waitFor(() => {
      expect(fetchRealmPresenceMock).toHaveBeenCalledTimes(1);
    });
  });
});
