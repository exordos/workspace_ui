import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "../user.model";

const {
  mockGet,
  mockPost,
  getCurrentInstance,
  refreshZulipApiBase,
  refreshWorkspaceApiBase,
  mockGetUserStatusCacheRow,
  mockPutUserStatusCacheRow,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  getCurrentInstance: vi.fn(),
  refreshZulipApiBase: vi.fn(),
  refreshWorkspaceApiBase: vi.fn(),
  mockGetUserStatusCacheRow: vi.fn(),
  mockPutUserStatusCacheRow: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  zulipApi: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  getCurrentInstance,
  refreshZulipApiBase,
  refreshWorkspaceApiBase,
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("~/shared/lib/user-status-cache-db", () => ({
  getUserStatusCacheRow: (...args: unknown[]) => mockGetUserStatusCacheRow(...args),
  putUserStatusCacheRow: (...args: unknown[]) => mockPutUserStatusCacheRow(...args),
}));

describe("user presence api", () => {
  beforeEach(() => {
    useUsersStore.getState().clear();
    mockGet.mockReset();
    mockPost.mockReset();
    getCurrentInstance.mockReset();
    refreshZulipApiBase.mockReset();
    mockGetUserStatusCacheRow.mockReset();
    mockGetUserStatusCacheRow.mockResolvedValue(null);
    mockPutUserStatusCacheRow.mockReset();
    mockPutUserStatusCacheRow.mockResolvedValue(undefined);
    getCurrentInstance.mockReturnValue({
      id: "instance-1",
      realm: "https://zulip.example.com",
      email: "user@example.com",
      apiKey: "api-key",
    });
  });

  it("skips presence report when there is no active instance", async () => {
    const { reportPresence } = await import("./user.api");
    getCurrentInstance.mockReturnValue(null);

    await reportPresence("active");

    expect(mockPost).not.toHaveBeenCalled();
    expect(refreshZulipApiBase).not.toHaveBeenCalled();
  });

  it("reports active presence by default", async () => {
    const { reportPresence } = await import("./user.api");
    mockPost.mockResolvedValue({ ok: true });

    await reportPresence("active");

    expect(refreshZulipApiBase).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/users/me/presence", {
      status: "active",
      client: "workspace-web",
    });
  });

  it("uses ping_only payload when pingOnly is true", async () => {
    const { reportPresence } = await import("./user.api");
    mockPost.mockResolvedValue({ ok: true });

    await reportPresence("active", true);

    expect(refreshZulipApiBase).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/users/me/presence", {
      status: "idle",
      client: "workspace-web",
      ping_only: "true",
    });
  });

  it("fetches and normalizes user status payload", async () => {
    const { fetchUserStatus } = await import("./user.api");
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        status: {
          status_text: "WFH",
          emoji_name: "house",
          emoji_code: "1f3e0",
          reaction_type: "unicode_emoji",
          away: true,
        },
      },
    });

    const result = await fetchUserStatus(101);

    expect(mockGet).toHaveBeenCalledWith("/users/101/status");
    expect(result).toEqual({
      text: "WFH",
      emojiName: "house",
      emojiCode: "1f3e0",
      reactionType: "unicode_emoji",
      away: true,
    });
  });

  it("returns null when status payload is empty", async () => {
    const { fetchUserStatus } = await import("./user.api");
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", status: { status_text: "", emoji_name: "", away: false } },
    });

    const result = await fetchUserStatus(101);

    expect(result).toBeNull();
  });

  it("returns null when status payload shape is unexpected", async () => {
    const { fetchUserStatus } = await import("./user.api");
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
      },
    });

    const result = await fetchUserStatus(101);

    expect(result).toBeNull();
  });

  it("updates own status with emoji and away flag", async () => {
    const { updateOwnStatus } = await import("./user.api");
    mockPost.mockResolvedValue({
      data: {
        status_text: "Lunch",
        status_emoji: "plate_with_cutlery",
        away: false,
        status_emoji_display_info: {
          emoji_name: "plate_with_cutlery",
          emoji_code: "1f37d-fe0f",
          reaction_type: "unicode_emoji",
        },
      },
    });

    const result = await updateOwnStatus({
      text: " Lunch ",
      emojiName: "plate_with_cutlery",
      away: false,
    });

    expect(mockPost).toHaveBeenCalledWith("/users/me/status", {
      status_text: "Lunch",
      status_emoji: "plate_with_cutlery",
      emoji_name: "plate_with_cutlery",
      away: "false",
    });
    expect(result).toEqual({
      text: "Lunch",
      emojiName: "plate_with_cutlery",
      emojiCode: "1f37d-fe0f",
      reactionType: "unicode_emoji",
      away: false,
    });
  });

  it("returns null for fully cleared own status payload", async () => {
    const { updateOwnStatus } = await import("./user.api");
    mockPost.mockResolvedValue({ data: { status_text: "", status_emoji: "", away: false } });

    const result = await updateOwnStatus({ text: "", emojiName: "", away: false });

    expect(result).toBeNull();
  });

  it("loads status into store and reuses cache window", async () => {
    const { ensureUserStatusLoaded } = await import("./user.api");
    useUsersStore.getState().mergeUser({ user_id: 7, full_name: "Alice" });
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        status: {
          status_text: "Heads down",
          emoji_name: "speech_balloon",
          away: false,
        },
      },
    });

    await ensureUserStatusLoaded(7);
    await ensureUserStatusLoaded(7);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(useUsersStore.getState().getUser(7)?.status?.text).toBe("Heads down");
    expect(useUsersStore.getState().getUser(7)?.statusFetchedAt).toEqual(expect.any(Number));
  });

  it("applies negative-cache backoff for invalid users (400)", async () => {
    const { requestUserStatus } = await import("./user.api");
    useUsersStore.getState().mergeUser({ user_id: 77, full_name: "Unknown user" });
    mockGet.mockResolvedValue({
      ok: false,
      status: 400,
      data: { result: "error", code: "BAD_REQUEST", msg: "No such user" },
    });

    await requestUserStatus(77);
    await requestUserStatus(77);

    expect(mockGet).toHaveBeenCalledTimes(1);
    const user = useUsersStore.getState().getUser(77);
    expect(user?.statusFetchState).toBe("invalid_user");
    expect(user?.statusErrorKind).toBe("invalid_user");
    expect(user?.statusNextRetryAt).toBeTypeOf("number");
  });

  it("refetches after default success TTL (5 min) for non-DM reason", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
    const { requestUserStatus } = await import("./user.api");
    useUsersStore.getState().mergeUser({ user_id: 60, full_name: "TTL" });
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", status: { status_text: "v1", away: false } },
    });

    await requestUserStatus(60, { reason: "compat" });
    expect(mockGet).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    await requestUserStatus(60, { reason: "compat" });
    expect(mockGet).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("does not refetch within 5 min for compat reason", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
    const { requestUserStatus } = await import("./user.api");
    useUsersStore.getState().mergeUser({ user_id: 61, full_name: "TTL2" });
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", status: { status_text: "v1", away: false } },
    });

    await requestUserStatus(61, { reason: "compat" });
    vi.advanceTimersByTime(90_000);
    await requestUserStatus(61, { reason: "compat" });
    expect(mockGet).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("refetches for dm_header when last fetch is older than 1 min", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
    const { requestUserStatus } = await import("./user.api");
    useUsersStore.getState().mergeUser({ user_id: 62, full_name: "DM" });
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", status: { status_text: "v1", away: false } },
    });

    await requestUserStatus(62, { reason: "compat" });
    expect(mockGet).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(90_000);
    await requestUserStatus(62, { reason: "dm_header" });
    expect(mockGet).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("hydrates from IndexedDB and skips network when row is within compat TTL", async () => {
    const t0 = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    mockGetUserStatusCacheRow.mockResolvedValue({
      id: "instance-1:8",
      instanceId: "instance-1",
      userId: 8,
      status: { text: "Cached", away: false },
      fetchedAt: t0 - 2 * 60_000,
    });
    const { requestUserStatus } = await import("./user.api");
    useUsersStore.getState().mergeUser({ user_id: 8, full_name: "Bob" });

    await requestUserStatus(8, { reason: "compat" });

    expect(mockGet).not.toHaveBeenCalled();
    expect(useUsersStore.getState().getUser(8)?.status?.text).toBe("Cached");
    vi.useRealTimers();
  });

  it("after IndexedDB hydrate, dm_header refetches when row is older than 1 min", async () => {
    const t0 = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    mockGetUserStatusCacheRow.mockResolvedValue({
      id: "instance-1:9",
      instanceId: "instance-1",
      userId: 9,
      status: { text: "Cached", away: false },
      fetchedAt: t0 - 2 * 60_000,
    });
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success", status: { status_text: "Fresh", away: false } },
    });
    const { requestUserStatus } = await import("./user.api");
    useUsersStore.getState().mergeUser({ user_id: 9, full_name: "Ann" });

    await requestUserStatus(9, { reason: "dm_header" });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(useUsersStore.getState().getUser(9)?.status?.text).toBe("Fresh");
    vi.useRealTimers();
  });
});
