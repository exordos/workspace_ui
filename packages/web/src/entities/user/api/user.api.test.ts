import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import {
  readUserStatusAwayPreference,
  removeUserStatusAwayPreference,
  writeUserStatusAwayPreference,
} from "../user-status-away-preference.lib";

const {
  getCurrentInstanceMock,
  getMessengerGatewayApiBaseForCurrentInstanceMock,
  mockGet,
  mockGetWithBase,
  mockPost,
  mockPostJsonWithBase,
  refreshMessengerApiBase,
  resolveIamAccessTokenMock,
  resolveUserUuidFromAccessTokenMock,
} = vi.hoisted(() => ({
  getCurrentInstanceMock: vi.fn(),
  getMessengerGatewayApiBaseForCurrentInstanceMock: vi.fn(() => "/api/workspace/v1/messenger"),
  mockGet: vi.fn(),
  mockGetWithBase: vi.fn(),
  mockPost: vi.fn(),
  mockPostJsonWithBase: vi.fn(),
  refreshMessengerApiBase: vi.fn(),
  resolveIamAccessTokenMock: vi.fn(),
  resolveUserUuidFromAccessTokenMock: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: (...args: unknown[]) => getCurrentInstanceMock(...args),
  getMessengerGatewayApiBaseForCurrentInstance: () =>
    getMessengerGatewayApiBaseForCurrentInstanceMock(),
  getWorkspaceCommonApiBaseForCurrentInstance: () => "/api/workspace/v1",
  messengerApi: {
    get: (...args: unknown[]) => mockGet(...args),
    getWithBase: (...args: unknown[]) => mockGetWithBase(...args),
    post: (...args: unknown[]) => mockPost(...args),
    postJsonWithBase: (...args: unknown[]) => mockPostJsonWithBase(...args),
  },
  refreshMessengerApiBase,
}));

vi.mock("~/shared/lib/access-token-claims.lib", () => ({
  resolveUserUuidFromAccessToken: (...args: unknown[]) =>
    resolveUserUuidFromAccessTokenMock(...args),
}));

vi.mock("~/shared/lib/iam-instance.lib", () => ({
  resolveIamAccessToken: (...args: unknown[]) => resolveIamAccessTokenMock(...args),
}));

function expectNoMessengerRequests(): void {
  expect(refreshMessengerApiBase).not.toHaveBeenCalled();
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockGetWithBase).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
  expect(mockPostJsonWithBase).not.toHaveBeenCalled();
}

describe("backend-only user api facade", () => {
  const USER_UUID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    getCurrentInstanceMock.mockReset();
    getMessengerGatewayApiBaseForCurrentInstanceMock.mockReset();
    getMessengerGatewayApiBaseForCurrentInstanceMock.mockReturnValue("/api/workspace/v1/messenger");
    mockGet.mockReset();
    mockGetWithBase.mockReset();
    mockPost.mockReset();
    mockPostJsonWithBase.mockReset();
    refreshMessengerApiBase.mockReset();
    resolveIamAccessTokenMock.mockReset();
    resolveUserUuidFromAccessTokenMock.mockReset();
    removeUserStatusAwayPreference(USER_UUID, "inst-1");
    removeUserStatusAwayPreference(USER_UUID);
    useUsersStore.getState().clear();
  });

  it("reports presence through the Workspace user presence action", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    mockGetWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "active",
        status_emoji: null,
        status_text: null,
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:20:00Z",
      },
    });
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "active",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { reportPresence } = await import("./user.api");

    await reportPresence("active");

    expect(mockGetWithBase).toHaveBeenCalledWith("/api/workspace/v1", `/users/${USER_UUID}`);
    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "active" },
    );
    expect(useUsersStore.getState().getUser(USER_UUID)).toMatchObject({
      full_name: "Alice Admin",
      email: "alice@example.com",
      presence: {
        status: "active",
        timestamp: 1782296460,
      },
    });
  });

  it("keeps heartbeat idle while the current custom status is marked away", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    useUsersStore.getState().mergeUser({
      user_id: USER_UUID,
      full_name: "Alice Admin",
      status: { text: "Focus", away: true },
    });
    useUsersStore.getState().setStatus(USER_UUID, { text: "Focus", away: true });
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "idle",
        status_text: "Focus",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { reportPresence } = await import("./user.api");

    await reportPresence("active");

    expect(mockGetWithBase).not.toHaveBeenCalled();
    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "idle" },
    );
  });

  it("loads saved away status before the first heartbeat after reload", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    mockGetWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "idle",
        status_emoji: "coffee",
        status_text: "Focusing",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:20:00Z",
      },
    });
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "idle",
        status_emoji: "coffee",
        status_text: "Focusing",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { reportPresence } = await import("./user.api");

    await reportPresence("active");

    expect(mockGetWithBase).toHaveBeenCalledWith("/api/workspace/v1", `/users/${USER_UUID}`);
    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "idle" },
    );
    expect(useUsersStore.getState().getUser(USER_UUID)).toMatchObject({
      status: { text: "Focusing", emojiName: "coffee", away: true },
      presence: { status: "idle" },
      statusFetchState: "ready",
    });
  });

  it("keeps locally saved away intent when the server snapshot is offline", async () => {
    getCurrentInstanceMock.mockReturnValue({
      id: "inst-1",
      iamAccessToken: "access-token",
    });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    writeUserStatusAwayPreference(USER_UUID, "inst-1", true);
    mockGetWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "offline",
        status_emoji: "coffee",
        status_text: "Focusing",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:20:00Z",
      },
    });
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "idle",
        status_emoji: "coffee",
        status_text: "Focusing",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { reportPresence } = await import("./user.api");

    await reportPresence("active");

    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "idle" },
    );
    expect(useUsersStore.getState().getUser(USER_UUID)).toMatchObject({
      status: { text: "Focusing", emojiName: "coffee", away: true },
    });
  });

  it("keeps locally cleared away intent stronger than server idle", async () => {
    getCurrentInstanceMock.mockReturnValue({
      id: "inst-1",
      iamAccessToken: "access-token",
    });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    writeUserStatusAwayPreference(USER_UUID, "inst-1", false);
    mockGetWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "idle",
        status_emoji: "coffee",
        status_text: "Focusing",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:20:00Z",
      },
    });
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "active",
        status_emoji: "coffee",
        status_text: "Focusing",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { reportPresence } = await import("./user.api");

    await reportPresence("active");

    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "active" },
    );
    expect(useUsersStore.getState().getUser(USER_UUID)).toMatchObject({
      status: { text: "Focusing", emojiName: "coffee", away: false },
    });
  });

  it("skips presence reporting when current user uuid is unavailable", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(null);
    const { reportPresence } = await import("./user.api");

    await reportPresence("idle");

    expectNoMessengerRequests();
  });

  it("fetches own custom status from the current user snapshot", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    mockGetWithBase.mockResolvedValue({
      ok: true,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "idle",
        status_emoji: "coffee",
        status_text: "Focusing",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { fetchOwnStatus } = await import("./user.api");

    await expect(fetchOwnStatus()).resolves.toEqual({
      text: "Focusing",
      emojiName: "coffee",
      away: true,
    });

    expect(mockGetWithBase).toHaveBeenCalledWith("/api/workspace/v1", `/users/${USER_UUID}`);
  });

  it("saves submitted status through the Workspace user presence action", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "idle",
        status_emoji: "plate_with_cutlery",
        status_text: "Lunch",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { updateOwnStatus } = await import("./user.api");

    const result = await updateOwnStatus({
      text: " Lunch ",
      emojiName: "plate_with_cutlery",
      emojiCode: "1f37d-fe0f",
      reactionType: "unicode_emoji",
      away: true,
    });

    expect(result).toEqual({
      ok: true,
      status: {
        text: "Lunch",
        emojiName: "plate_with_cutlery",
        emojiCode: "1f37d-fe0f",
        reactionType: "unicode_emoji",
        away: true,
      },
    });
    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "idle", emoji: "plate_with_cutlery", text: "Lunch" },
    );
    expect(readUserStatusAwayPreference(USER_UUID, "inst-1")).toBe(true);
  });

  it("clears stale emoji metadata when the submitted emoji name is empty", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "active",
        status_emoji: null,
        status_text: "Text only",
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { updateOwnStatus } = await import("./user.api");

    const result = await updateOwnStatus({
      text: "Text only",
      emojiName: "",
      emojiCode: "1f9ea",
      reactionType: "unicode_emoji",
      away: false,
    });

    expect(result).toEqual({
      ok: true,
      status: {
        text: "Text only",
        away: false,
      },
    });
    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "active", emoji: null, text: "Text only" },
    );
    expect(readUserStatusAwayPreference(USER_UUID, "inst-1")).toBe(false);
  });

  it("clears status text and emoji with explicit nulls", async () => {
    getCurrentInstanceMock.mockReturnValue({ id: "inst-1", iamAccessToken: "access-token" });
    resolveIamAccessTokenMock.mockReturnValue("access-token");
    resolveUserUuidFromAccessTokenMock.mockReturnValue(USER_UUID);
    mockPostJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: USER_UUID,
        username: "alice",
        status: "active",
        status_emoji: null,
        status_text: null,
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        last_ping_at: "2026-06-24T10:21:00Z",
      },
    });
    const { updateOwnStatus } = await import("./user.api");

    const result = await updateOwnStatus({ text: "", emojiName: "", away: false });

    expect(result).toEqual({ ok: true, status: null });
    expect(mockPostJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/presence/invoke`,
      { status: "active", emoji: null, text: null },
    );
    expect(readUserStatusAwayPreference(USER_UUID, "inst-1")).toBe(false);
  });
});
