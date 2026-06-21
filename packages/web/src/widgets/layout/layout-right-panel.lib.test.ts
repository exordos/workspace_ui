import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildRightPanelUserInfo,
  formatRightPanelLastSeen,
  formatRightPanelLocalTime,
} from "./layout-right-panel.lib";

describe("formatRightPanelLocalTime", () => {
  it("formats local time for a valid timezone", () => {
    const result = formatRightPanelLocalTime("UTC", new Date("2026-03-15T10:45:00Z"));
    expect(result).toBe("10:45");
  });

  it("returns undefined for missing timezone", () => {
    expect(formatRightPanelLocalTime(undefined, new Date("2026-03-15T10:45:00Z"))).toBeUndefined();
  });

  it("returns undefined for invalid timezone", () => {
    expect(
      formatRightPanelLocalTime("Mars/Olympus_Mons", new Date("2026-03-15T10:45:00Z")),
    ).toBeUndefined();
  });
});

describe("formatRightPanelLastSeen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats online and away labels from presence payload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));
    const now = Math.floor(Date.now() / 1000);

    expect(formatRightPanelLastSeen({ timestamp: now, status: "active" })).toBe("online");
    expect(formatRightPanelLastSeen({ timestamp: now, status: "idle" })).toBe("away");
  });

  it("returns undefined for missing presence", () => {
    expect(formatRightPanelLastSeen(undefined)).toBeUndefined();
  });
});

describe("buildRightPanelUserInfo", () => {
  it("prefers live users store avatar over detailed profile avatar", () => {
    const userInfo = buildRightPanelUserInfo({
      userFromStore: {
        user_id: 42,
        full_name: "Alice Doe",
        avatar_url: "/avatar/live.png",
      },
      detailedProfile: {
        userId: 42,
        fullName: "Alice Doe",
        avatarUrl: "/avatar/stale.png",
      },
      dmChat: undefined,
      rightDrawerTargetUserId: 42,
      userStatusLabel: undefined,
      currentInstanceRealm: "https://chat.example.com",
      media: undefined,
    });

    expect(userInfo?.avatarUrl).toBe("/avatar/live.png");
  });

  it("falls back to detailed profile avatar when users store avatar is empty", () => {
    const userInfo = buildRightPanelUserInfo({
      userFromStore: {
        user_id: 42,
        full_name: "Alice Doe",
        avatar_url: null,
      },
      detailedProfile: {
        userId: 42,
        fullName: "Alice Doe",
        avatarUrl: "/avatar/profile.png",
      },
      dmChat: undefined,
      rightDrawerTargetUserId: 42,
      userStatusLabel: undefined,
      currentInstanceRealm: "https://chat.example.com",
      media: undefined,
    });

    expect(userInfo?.avatarUrl).toBe("/avatar/profile.png");
  });
});
