import { describe, expect, it } from "vitest";
import { createUser } from "~/test/factories";
import {
  buildDmChatInfoData,
  buildStreamChatInfoData,
  hasChatInfoContext,
  type ChatInfoResolvedUser,
} from "./chat-info.lib";

function resolvedUser(
  legacyUserId: number,
  user: ChatInfoResolvedUser["user"],
): ChatInfoResolvedUser {
  return { legacyUserId, user };
}

describe("hasChatInfoContext", () => {
  it("returns true for an active dm context", () => {
    expect(
      hasChatInfoContext({
        kind: "dm",
        instanceId: "inst-1",
        dmName: "Alice",
        participantIds: [42],
      }),
    ).toBe(true);
  });

  it("returns true for an active group dm context without partner id", () => {
    expect(
      hasChatInfoContext({
        kind: "dm",
        instanceId: "inst-1",
        dmName: "Team",
        participantIds: [42, 51],
      }),
    ).toBe(true);
  });

  it("returns true for an active stream context", () => {
    expect(
      hasChatInfoContext({
        kind: "stream",
        instanceId: "inst-1",
        streamId: 42,
        streamName: "engineering",
        isMuted: false,
        topics: [],
      }),
    ).toBe(true);
  });

  it("returns false when there is no active chat context", () => {
    expect(
      hasChatInfoContext({
        kind: "none",
        instanceId: null,
      }),
    ).toBe(false);
  });
});

describe("buildDmChatInfoData", () => {
  it("builds online counts from dm partner presence", () => {
    const partner = createUser({
      user_id: 7,
      displayName: "Alice",
      status: "active",
    });

    const data = buildDmChatInfoData("Alice", [resolvedUser(7, partner)]);

    expect(data.memberCount).toBe(1);
    expect(data.onlineCount).toBe(1);
    expect(data.members[0]?.fullName).toBe("Alice");
  });

  it("keeps total count for group dm even when some member details are not loaded yet", () => {
    const data = buildDmChatInfoData(
      "Team DM",
      [resolvedUser(7, createUser({ user_id: 7, displayName: "Alice" }))],
      3,
    );

    expect(data.memberCount).toBe(3);
    expect(data.onlineCount).toBe(0);
    expect(data.members).toHaveLength(1);
  });

  it("does not duplicate dm members when participant records repeat", () => {
    const alice = createUser({ user_id: 7, displayName: "Alice", status: "active" });
    const bob = createUser({ user_id: 8, displayName: "Bob" });

    const data = buildDmChatInfoData("Team DM", [
      resolvedUser(7, alice),
      resolvedUser(7, alice),
      resolvedUser(8, bob),
    ]);

    expect(data.memberCount).toBe(2);
    expect(data.onlineCount).toBe(1);
    expect(data.members.map((member) => member.userId)).toEqual([7, 8]);
  });

  it("maps name email and avatar from Workspace users", () => {
    const user = createUser({
      user_id: 7,
      displayName: "Alice Workspace",
      email: "alice@example.test",
      avatar_url: "https://example.test/alice.png",
    });

    const data = buildDmChatInfoData("Alice", [resolvedUser(7, user)]);

    expect(data.members[0]).toMatchObject({
      userId: 7,
      fullName: "Alice Workspace",
      email: "alice@example.test",
      avatarUrl: "https://example.test/alice.png",
      isOnline: false,
    });
    expect(data.members[0]?.profileData).toBeUndefined();
  });
});

describe("buildStreamChatInfoData", () => {
  it("uses member id list for total count and loaded users for online count", () => {
    const users = [
      resolvedUser(1, createUser({ user_id: 1, displayName: "Bob", status: "active" })),
      resolvedUser(2, createUser({ user_id: 2, displayName: "Carol", status: "idle" })),
    ];

    const data = buildStreamChatInfoData("engineering", [1, 2, 3], users, true);

    expect(data.memberCount).toBe(3);
    expect(data.onlineCount).toBe(1);
    expect(data.isMuted).toBe(true);
    expect(data.members).toHaveLength(2);
  });

  it("counts unique stream member ids and does not duplicate loaded members", () => {
    const bob = createUser({ user_id: 1, displayName: "Bob", status: "active" });
    const carol = createUser({ user_id: 2, displayName: "Carol" });
    const users = [resolvedUser(1, bob), resolvedUser(1, bob), resolvedUser(2, carol)];

    const data = buildStreamChatInfoData("engineering", [1, 1, 2, 3], users, false);

    expect(data.memberCount).toBe(3);
    expect(data.onlineCount).toBe(1);
    expect(data.members.map((member) => member.userId)).toEqual([1, 2]);
  });

  it("keeps stream description and topics metadata when provided", () => {
    const users = [resolvedUser(1, createUser({ user_id: 1, displayName: "Bob" }))];

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
