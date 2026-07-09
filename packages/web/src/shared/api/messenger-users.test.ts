/**
 * Tests for Workspace gateway users API.
 */
import { describe, expect, it } from "vitest";
import {
  getMockGetCurrentInstance,
  getMockMessengerApi,
  getMockRefreshMessengerApiBase,
  TEST_INSTANCE,
} from "./messenger.test.setup";
// eslint-disable-next-line import-x/order -- setup module registers vi.mock("./client") before importing the subject.
import { fetchUser, fetchUsers, fetchUsersAvatarMap, getCurrentUser } from "./messenger-users";

const mockMessengerApi = getMockMessengerApi();
const mockRefreshMessengerApiBase = getMockRefreshMessengerApiBase();
const mockGetCurrentInstance = getMockGetCurrentInstance();

const CURRENT_USER_UUID = "00000000-0000-0000-0000-000000000000";
const PARTNER_UUID = "05c53ea8-4c94-4ec0-8b85-aa16717feaa2";

function jwtWithClaims(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return "header." + payload + ".signature";
}

function setIamInstance(accessToken = jwtWithClaims({ sub: CURRENT_USER_UUID })): void {
  mockGetCurrentInstance.mockReturnValue({
    ...TEST_INSTANCE,
    authType: "iam",
    iamAccessToken: accessToken,
  });
}

describe("getCurrentUser", () => {
  it("decodes current user UUID from access token and fetches user detail from gateway", async () => {
    setIamInstance(jwtWithClaims({ sub: CURRENT_USER_UUID, email: "admin@example.com" }));
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: CURRENT_USER_UUID,
        username: "admin",
        status: "active",
        first_name: "Admin",
        last_name: "User",
        email: "admin@example.com",
      },
      raw: { statusText: "OK" },
    });

    const result = await getCurrentUser();

    expect(result).toEqual({
      user_id: CURRENT_USER_UUID,
      full_name: "Admin User",
      email: "admin@example.com",
    });
    expect(mockRefreshMessengerApiBase).not.toHaveBeenCalled();
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/users/" + CURRENT_USER_UUID,
      undefined,
      undefined,
    );
  });

  it("returns null when access token does not contain a UUID", async () => {
    setIamInstance(jwtWithClaims({ sub: "42", email: "admin@example.com" }));

    await expect(getCurrentUser()).resolves.toBeNull();

    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
  });

  it("returns null when current user detail request fails", async () => {
    setIamInstance();
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 404,
      data: {},
      raw: { statusText: "Not Found" },
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("fetchUsers", () => {
  it("returns normalized users from gateway array response", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: CURRENT_USER_UUID,
          username: "admin",
          status: "active",
          status_emoji: "coffee",
          status_text: "Focusing",
          first_name: "Admin",
          last_name: "User",
          email: "admin@example.com",
          avatar: "urn:gavatar:" + CURRENT_USER_UUID,
          last_ping_at: "2026-06-24T10:21:00Z",
        },
        {
          uuid: PARTNER_UUID,
          username: "charlie",
          status: "do_not_disturb",
          first_name: "Charlie",
          last_name: "Brown",
          email: "charlie@example.com",
          avatar_url: "/avatar/charlie.png",
          last_ping_at: "2026-06-24T10:22:00Z",
        },
      ],
      raw: { statusText: "OK" },
    });

    const result = await fetchUsers();

    expect(result).toEqual([
      {
        user_id: CURRENT_USER_UUID,
        full_name: "Admin User",
        email: "admin@example.com",
        avatar_url: "urn:gavatar:" + CURRENT_USER_UUID,
        presence: {
          status: "active",
          timestamp: 1782296460,
        },
        status: {
          text: "Focusing",
          emojiName: "coffee",
          away: false,
        },
        is_active: true,
      },
      {
        user_id: PARTNER_UUID,
        full_name: "Charlie Brown",
        email: "charlie@example.com",
        avatar_url: "/avatar/charlie.png",
        presence: {
          status: "do_not_disturb",
          timestamp: 1782296520,
        },
        is_active: true,
      },
    ]);
    expect(mockMessengerApi.get).not.toHaveBeenCalled();
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith("/api/messenger/v1", "/users/");
  });

  it("falls back to username when first and last name are empty", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [{ uuid: PARTNER_UUID, username: "charlie", status: "active" }],
      raw: { statusText: "OK" },
    });

    const result = await fetchUsers();

    expect(result[0]?.full_name).toBe("charlie");
  });

  it("returns empty on non-array payload", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { members: [{ user_id: 1, full_name: "Legacy" }] },
      raw: { statusText: "OK" },
    });

    await expect(fetchUsers()).resolves.toEqual([]);
  });

  it("returns empty on non-ok response", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 500,
      data: {},
      raw: { statusText: "Server Error" },
    });

    await expect(fetchUsers()).resolves.toEqual([]);
  });

  it("returns empty on network error", async () => {
    mockMessengerApi.getWithBase.mockRejectedValue(new TypeError("Offline"));

    await expect(fetchUsers()).resolves.toEqual([]);
  });
});

describe("fetchUser", () => {
  it("returns normalized user by UUID", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: PARTNER_UUID,
        username: "charlie",
        email: "charlie@example.com",
        status: "active",
        status_emoji: "coffee",
        status_text: "Focusing",
        avatar: "urn:gavatar:" + PARTNER_UUID,
        last_ping_at: "2026-06-24T10:21:00Z",
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchUser(PARTNER_UUID.toUpperCase());

    expect(result).toEqual({
      user_id: PARTNER_UUID,
      full_name: "charlie",
      email: "charlie@example.com",
      avatar_url: "urn:gavatar:" + PARTNER_UUID,
      presence: {
        status: "active",
        timestamp: 1782296460,
      },
      status: {
        text: "Focusing",
        emojiName: "coffee",
        away: false,
      },
      is_active: true,
    });
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/users/" + PARTNER_UUID,
      undefined,
      undefined,
    );
  });

  it("returns null for numeric legacy user ids", async () => {
    await expect(fetchUser(42)).resolves.toBeNull();

    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
  });

  it("returns null on 404", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 404,
      data: {},
      raw: { statusText: "Not Found" },
    });

    await expect(fetchUser(PARTNER_UUID)).resolves.toBeNull();
  });
});

describe("fetchUsersAvatarMap", () => {
  it("returns user_id to avatar map from gateway rows", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        { uuid: CURRENT_USER_UUID, avatar: "urn:gavatar:" + CURRENT_USER_UUID },
        { uuid: PARTNER_UUID, avatar: "", avatar_url: "/avatar/partner.png" },
      ],
      raw: { statusText: "OK" },
    });

    const map = await fetchUsersAvatarMap();

    expect(map.size).toBe(2);
    expect(map.get(CURRENT_USER_UUID)).toBe("urn:gavatar:" + CURRENT_USER_UUID);
    expect(map.get(PARTNER_UUID)).toBe("/avatar/partner.png");
  });
});
