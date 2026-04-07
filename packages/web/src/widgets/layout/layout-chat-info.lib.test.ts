import { describe, expect, it } from "vitest";
import { createUser } from "~/test/factories";
import {
  buildDmChatInfoData,
  buildStreamChatInfoData,
  hasChatInfoContext,
} from "./layout-chat-info.lib";

describe("hasChatInfoContext", () => {
  it("returns true for an active dm context", () => {
    expect(
      hasChatInfoContext({
        hasDmChat: true,
      }),
    ).toBe(true);
  });

  it("returns true for an active group dm context without partner id", () => {
    expect(
      hasChatInfoContext({
        hasDmChat: true,
      }),
    ).toBe(true);
  });

  it("returns true for an active stream context", () => {
    expect(
      hasChatInfoContext({
        hasDmChat: false,
        streamId: 42,
      }),
    ).toBe(true);
  });

  it("returns false when there is no active chat context", () => {
    expect(
      hasChatInfoContext({
        hasDmChat: false,
      }),
    ).toBe(false);
  });
});

describe("buildDmChatInfoData", () => {
  it("builds online counts from dm partner presence", () => {
    const partner = createUser({
      user_id: 7,
      full_name: "Alice",
      presence: { status: "active", timestamp: 1_711_111_111 },
    });

    const data = buildDmChatInfoData("Alice", [partner]);

    expect(data.memberCount).toBe(1);
    expect(data.onlineCount).toBe(1);
    expect(data.members[0]?.fullName).toBe("Alice");
  });

  it("keeps total count for group dm even when member details are not loaded yet", () => {
    const data = buildDmChatInfoData("Team DM", [], 3);

    expect(data.memberCount).toBe(3);
    expect(data.onlineCount).toBe(0);
    expect(data.members).toEqual([]);
  });
});

describe("buildStreamChatInfoData", () => {
  it("uses member id list for total count and loaded users for online count", () => {
    const users = [
      createUser({
        user_id: 1,
        full_name: "Bob",
        presence: { status: "active", timestamp: 1_711_111_111 },
      }),
      createUser({
        user_id: 2,
        full_name: "Carol",
        presence: { status: "idle", timestamp: 1_711_111_112 },
      }),
    ];

    const data = buildStreamChatInfoData("engineering", [1, 2, 3], users, true);

    expect(data.memberCount).toBe(3);
    expect(data.onlineCount).toBe(1);
    expect(data.isMuted).toBe(true);
    expect(data.members).toHaveLength(2);
  });

  it("keeps stream description and topics metadata when provided", () => {
    const users = [
      createUser({
        user_id: 1,
        full_name: "Bob",
      }),
    ];

    const data = buildStreamChatInfoData("engineering", [1], users, false, {
      description: "Engineering discussions",
      topics: [
        { name: "release", unreadCount: 2 },
        { name: "infra", unreadCount: 0 },
      ],
    });

    expect(data.description).toBe("Engineering discussions");
    expect(data.topics).toEqual([
      { name: "release", unreadCount: 2 },
      { name: "infra", unreadCount: 0 },
    ]);
  });
});
