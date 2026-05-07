import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildRightPanelCommonGroups,
  buildRightPanelUserInfo,
  formatRightPanelLastSeen,
  formatRightPanelLocalTime,
} from "./layout-right-panel.lib";

describe("buildRightPanelCommonGroups", () => {
  it("returns only group dms containing partner user", () => {
    const groups = buildRightPanelCommonGroups(
      [
        {
          type: "dm",
          id: 1,
          name: "One-on-one",
          slug: "42",
          isGroup: false,
          userIds: [42],
          ts: 100,
        },
        {
          type: "dm",
          id: 2,
          name: "Design Team",
          slug: "7,42,99",
          isGroup: true,
          userIds: [7, 42, 99],
          lastMessage: "Let's ship",
          badge: 3,
          ts: 200,
        },
        {
          type: "dm",
          id: 3,
          name: "Infra",
          slug: "7,11,12",
          isGroup: true,
          userIds: [7, 11, 12],
          ts: 300,
        },
      ],
      42,
      "42",
    );

    expect(groups).toEqual([
      {
        name: "Design Team",
        lastMessage: "Let's ship",
        unread: 3,
        slug: "7,42,99",
      },
    ]);
  });

  it("sorts by recent timestamp and excludes current dm slug", () => {
    const groups = buildRightPanelCommonGroups(
      [
        {
          type: "dm",
          id: 10,
          name: "A",
          slug: "7,42,1",
          isGroup: true,
          userIds: [7, 42, 1],
          ts: 10,
        },
        {
          type: "dm",
          id: 11,
          name: "B",
          slug: "7,42,2",
          isGroup: true,
          userIds: [7, 42, 2],
          ts: 30,
        },
        {
          type: "dm",
          id: 12,
          name: "C",
          slug: "7,42,3",
          isGroup: true,
          userIds: [7, 42, 3],
          ts: 20,
        },
      ],
      42,
      "7,42,2",
      2,
    );

    expect(groups.map((g) => g.name)).toEqual(["C", "A"]);
  });
});

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
      currentInstanceRealm: "https://zulip.example.com",
      media: undefined,
      commonGroups: undefined,
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
      currentInstanceRealm: "https://zulip.example.com",
      media: undefined,
      commonGroups: undefined,
    });

    expect(userInfo?.avatarUrl).toBe("/avatar/profile.png");
  });
});
