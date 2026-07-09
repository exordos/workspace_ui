/**
 * Tests for Zulip API (zulip-users module).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUser, fetchUsers, fetchUsersAvatarMap, getCurrentUser } from "./zulip-users";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCurrentUser", () => {
  it("returns null without HTTP", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getCurrentUser()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchUsers", () => {
  it("returns an empty list without HTTP", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchUsers()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchUser", () => {
  it("returns null without HTTP for a valid user id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchUser(42)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws for invalid userId (0)", async () => {
    await expect(fetchUser(0)).rejects.toThrow(/Invalid userId/);
  });

  it("throws for negative userId", async () => {
    await expect(fetchUser(-5)).rejects.toThrow(/Invalid userId/);
  });
});

describe("fetchUsersAvatarMap", () => {
  it("returns an empty map without HTTP", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const map = await fetchUsersAvatarMap();
    expect(map.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
