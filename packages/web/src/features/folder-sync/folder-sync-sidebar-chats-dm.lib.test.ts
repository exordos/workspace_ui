import { describe, expect, it } from "vitest";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { filterHiddenDmChats } from "./folder-sync-sidebar-chats-dm.lib";

describe("filterHiddenDmChats", () => {
  const currentUserId = 10;

  it("keeps group DM with isGroup true", () => {
    const chats: SidebarChat[] = [
      {
        type: "dm",
        id: 999,
        name: "Design Squad",
        slug: "10-me,30-alice",
        isGroup: true,
        userIds: [10, 30],
        lastMessage: "",
        time: "",
      },
    ];

    const result = filterHiddenDmChats(chats, currentUserId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "dm", isGroup: true, name: "Design Squad" });
  });

  it("filters self DM when id matches currentUserId", () => {
    const chats: SidebarChat[] = [
      {
        type: "dm",
        id: 10,
        name: "Me",
        slug: "10-me",
        isGroup: false,
        lastMessage: "",
        time: "",
      },
    ];

    const result = filterHiddenDmChats(chats, currentUserId);

    expect(result).toHaveLength(0);
  });

  it("keeps regular 1:1 DM with another user", () => {
    const chats: SidebarChat[] = [
      {
        type: "dm",
        id: 20,
        name: "Bob",
        slug: "20-bob",
        isGroup: false,
        lastMessage: "",
        time: "",
      },
    ];

    const result = filterHiddenDmChats(chats, currentUserId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "dm", id: 20 });
  });

  it("dedupes group DMs that share participants under different keys", () => {
    const chats: SidebarChat[] = [
      {
        type: "dm",
        id: 999,
        name: "Design Squad",
        slug: "20-bob,30-carol",
        isGroup: true,
        userIds: [20, 30],
        lastMessage: "older",
        time: "",
        ts: 1000,
      },
      {
        type: "dm",
        id: 1000,
        name: "Design Squad",
        slug: "10-me,20-bob,30-carol",
        isGroup: true,
        userIds: [10, 20, 30],
        lastMessage: "newer",
        time: "",
        ts: 5000,
      },
    ];

    const result = filterHiddenDmChats(chats, currentUserId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "dm",
      isGroup: true,
      lastMessage: "newer",
      userIds: [10, 20, 30],
    });
  });

  it("does not filter stream chats", () => {
    const chats: SidebarChat[] = [
      {
        type: "stream",
        stream_id: 1,
        name: "engineering",
        topics: [],
        lastMessage: "",
        time: "",
      },
    ];

    const result = filterHiddenDmChats(chats, currentUserId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "stream", stream_id: 1 });
  });
});
