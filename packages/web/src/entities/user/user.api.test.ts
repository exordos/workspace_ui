import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "./user.model";

const { mockGet, mockPost, getCurrentInstance, refreshZulipApiBase } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  getCurrentInstance: vi.fn(),
  refreshZulipApiBase: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  zulipApi: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  getCurrentInstance,
  refreshZulipApiBase,
}));

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("user presence api", () => {
  beforeEach(() => {
    useUsersStore.getState().clear();
    mockGet.mockReset();
    mockPost.mockReset();
    getCurrentInstance.mockReset();
    refreshZulipApiBase.mockReset();
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
      data: {
        status_text: "WFH",
        status_emoji: "house",
        away: true,
        status_emoji_display_info: [
          {
            emoji_name: "house",
            emoji_code: "1f3e0",
            reaction_type: "unicode_emoji",
          },
        ],
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
    mockGet.mockResolvedValue({ data: { status_text: "", status_emoji: "", away: false } });

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
      data: {
        status_text: "Heads down",
        status_emoji: "speech_balloon",
        away: false,
      },
    });

    await ensureUserStatusLoaded(7);
    await ensureUserStatusLoaded(7);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(useUsersStore.getState().getUser(7)?.status?.text).toBe("Heads down");
    expect(useUsersStore.getState().getUser(7)?.statusFetchedAt).toEqual(expect.any(Number));
  });
});
