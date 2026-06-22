import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost, refreshMessengerApiBase } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  refreshMessengerApiBase: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  messengerApi: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  refreshMessengerApiBase,
}));

function expectNoMessengerRequests(): void {
  expect(refreshMessengerApiBase).not.toHaveBeenCalled();
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
}

describe("backend-only user api facade", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    refreshMessengerApiBase.mockReset();
  });

  it("does not call a presence endpoint", async () => {
    const { reportPresence } = await import("./user.api");

    await reportPresence("active");
    await reportPresence("active", true);

    expectNoMessengerRequests();
  });

  it("does not fetch user status endpoints", async () => {
    const { fetchOwnStatus, fetchUserStatus } = await import("./user.api");

    await expect(fetchUserStatus(101)).resolves.toBeNull();
    await expect(fetchOwnStatus()).resolves.toBeNull();

    expectNoMessengerRequests();
  });

  it("normalizes submitted status locally without a mutation request", async () => {
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
    expectNoMessengerRequests();
  });

  it("drops stale emoji metadata when the submitted emoji name is empty", async () => {
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
    expectNoMessengerRequests();
  });

  it("returns null for a fully cleared local status", async () => {
    const { updateOwnStatus } = await import("./user.api");

    const result = await updateOwnStatus({ text: "", emojiName: "", away: false });

    expect(result).toEqual({ ok: true, status: null });
    expectNoMessengerRequests();
  });

  it("leaves status hydration as a backend-only no-op", async () => {
    const { ensureUserStatusLoaded, requestUserStatus } = await import("./user.api");

    await requestUserStatus(7, { reason: "right_panel", priority: "high", force: true });
    await ensureUserStatusLoaded(7, { reason: "dm_header", priority: "low" });

    expectNoMessengerRequests();
  });
});
