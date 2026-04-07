/**
 * Tests for Zulip API (zulip-users module).
 */
import "./zulip.test.setup";
import { describe, expect, it } from "vitest";
import {
  fetchRealmPresence,
  fetchUser,
  fetchUsers,
  fetchUsersAvatarMap,
  getCurrentUser,
} from "./zulip-users";
import { getMockRefreshZulipApiBase, getMockZulipApi } from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();
const mockRefreshZulipApiBase = getMockRefreshZulipApiBase();

describe("getCurrentUser", () => {
  it("delegates through zulipApi.get and refreshes base URL first", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_id: 42, full_name: "Alice", email: "alice@test.com" },
      raw: { statusText: "OK" },
    });

    const result = await getCurrentUser();

    expect(result).toEqual({ user_id: 42, full_name: "Alice", email: "alice@test.com" });
    expect(mockRefreshZulipApiBase).toHaveBeenCalled();
    expect(mockZulipApi.get).toHaveBeenCalledWith("/users/me", undefined);
  });

  it("returns user on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_id: 42, full_name: "Alice", email: "alice@test.com" },
      raw: { statusText: "OK" },
    });
    const result = await getCurrentUser();
    expect(result).toEqual({ user_id: 42, full_name: "Alice", email: "alice@test.com" });
  });

  it("returns null on non-ok response", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 401,
      data: {},
      raw: { statusText: "Unauthorized" },
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null on error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null on network error", async () => {
    mockZulipApi.get.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await getCurrentUser()).toBeNull();
  });

  it("defaults missing fields to empty strings", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_id: 1 },
      raw: { statusText: "OK" },
    });
    const result = await getCurrentUser();
    expect(result).toEqual({ user_id: 1, full_name: "", email: "" });
  });
});

// ---------------------------------------------------------------------------
// fetchUsers — authenticated GET
// ---------------------------------------------------------------------------

describe("fetchUsers", () => {
  it("returns members array on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { members: [{ user_id: 1, full_name: "Alice" }] },
      raw: { statusText: "OK" },
    });
    const result = await fetchUsers();
    expect(result).toHaveLength(1);
    expect(result[0]!.full_name).toBe("Alice");
  });

  it("falls back to users array", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { users: [{ user_id: 2, full_name: "Bob" }] },
      raw: { statusText: "OK" },
    });
    const result = await fetchUsers();
    expect(result).toHaveLength(1);
    expect(result[0]!.full_name).toBe("Bob");
  });

  it("returns empty on error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await fetchUsers()).toEqual([]);
  });

  it("returns empty on non-ok response", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    expect(await fetchUsers()).toEqual([]);
  });

  it("returns empty on network error", async () => {
    mockZulipApi.get.mockRejectedValue(new TypeError("Offline"));
    expect(await fetchUsers()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchUser — authenticated GET with guard
// ---------------------------------------------------------------------------

describe("fetchUser", () => {
  it("returns user on success", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { user: { user_id: 42, full_name: "Alice", email: "a@t.com", role: 200 } },
      raw: { statusText: "OK" },
    });
    const result = await fetchUser(42);
    expect(result).toEqual({ user_id: 42, full_name: "Alice", email: "a@t.com", role: 200 });
  });

  it("throws for invalid userId (0)", async () => {
    await expect(fetchUser(0)).rejects.toThrow(/Invalid userId/);
  });

  it("throws for negative userId", async () => {
    await expect(fetchUser(-5)).rejects.toThrow(/Invalid userId/);
  });

  it("returns null on 404", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 404,
      data: {},
      raw: { statusText: "Not Found" },
    });
    expect(await fetchUser(42)).toBeNull();
  });

  it("returns null on error result", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error" },
      raw: { statusText: "OK" },
    });
    expect(await fetchUser(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchRealmPresence
// ---------------------------------------------------------------------------

describe("fetchRealmPresence", () => {
  it("returns presence data on success", async () => {
    const presences = { "alice@test.com": { aggregated: { status: "active", timestamp: 100 } } };
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { presences, server_timestamp: 200 },
      raw: { statusText: "OK" },
    });
    const result = await fetchRealmPresence();
    expect(result.presences).toEqual(presences);
  });

  it("returns error result on non-ok", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });
    expect(await fetchRealmPresence()).toEqual({ result: "error" });
  });

  it("returns error result on network failure", async () => {
    mockZulipApi.get.mockRejectedValue(new Error("Offline"));
    expect(await fetchRealmPresence()).toEqual({ result: "error" });
  });
});

// ---------------------------------------------------------------------------
// fetchRecentMessages — authenticated GET
// ---------------------------------------------------------------------------
describe("fetchUsersAvatarMap", () => {
  it("returns user_id to avatar_url map", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        members: [
          { user_id: 1, avatar_url: "/avatar/1.png" },
          { user_id: 2, avatar_url: "" },
          { user_id: 3, avatar_url: "/avatar/3.png" },
        ],
      },
      raw: { statusText: "OK" },
    });
    const map = await fetchUsersAvatarMap();
    expect(map.size).toBe(2);
    expect(map.get(1)).toBe("/avatar/1.png");
    expect(map.get(3)).toBe("/avatar/3.png");
    expect(map.has(2)).toBe(false);
  });
});
