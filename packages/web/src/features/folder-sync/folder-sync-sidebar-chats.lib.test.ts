import { describe, expect, it } from "vitest";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
import { SYSTEM_PERSONAL_FOLDER_ID } from "./folder-sync-constants.lib";
import { buildSelectedFolderSidebarChats } from "./folder-sync-sidebar-chats.lib";

function folderItem(chatId: string, orderIndex: number): FolderItemForClient {
  return {
    uuid: `item-${chatId}-${orderIndex}`,
    chatId,
    folderUuid: "folder-1",
    orderIndex,
    pinnedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("buildSelectedFolderSidebarChats", () => {
  it("filters self DM and group DM in personal system folder", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: SYSTEM_PERSONAL_FOLDER_ID,
      folderChatIds: null,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [
        {
          type: "dm",
          id: 10,
          name: "Me",
          slug: "10-me",
          isGroup: false,
          lastMessage: "",
          time: "",
        },
        {
          type: "dm",
          id: 20,
          name: "Bob",
          slug: "20-bob",
          isGroup: false,
          lastMessage: "",
          time: "",
        },
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
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map(),
      currentUserId: 10,
    });

    expect(result).toHaveLength(1);
    expect(
      result.some((chat) => chat.type === "dm" && chat.id === 10 && chat.isGroup !== true),
    ).toBe(false);
    expect(result.some((chat) => chat.type === "dm" && chat.id === 20)).toBe(true);
    expect(result.some((chat) => chat.type === "dm" && chat.isGroup === true)).toBe(false);
  });

  it("filters self DM from fallback folder item dm:{currentUserId}", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["dm:10"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("dm:10", 0)]]]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map([[10, { full_name: "Me" }]]),
      currentUserId: 10,
    });

    expect(result).toEqual([]);
  });

  it("does not filter regular 1:1 DM with another user", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: SYSTEM_PERSONAL_FOLDER_ID,
      folderChatIds: null,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [
        {
          type: "dm",
          id: 42,
          name: "Alice",
          slug: "42-alice",
          isGroup: false,
          lastMessage: "",
          time: "",
        },
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map(),
      currentUserId: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "dm", id: 42 });
  });

  it("removes only self DM and preserves order of remaining chats", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: "system:all",
      folderChatIds: null,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [
        {
          type: "stream",
          stream_id: 1,
          name: "engineering",
          topics: [],
          lastMessage: "",
          time: "",
        },
        {
          type: "dm",
          id: 10,
          name: "Me",
          slug: "10-me",
          isGroup: false,
          lastMessage: "",
          time: "",
        },
        {
          type: "dm",
          id: 20,
          name: "Bob",
          slug: "20-bob",
          isGroup: false,
          lastMessage: "",
          time: "",
        },
        {
          type: "stream",
          stream_id: 2,
          name: "design",
          topics: [],
          lastMessage: "",
          time: "",
        },
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map(),
      currentUserId: 10,
    });

    expect(
      result.map((chat) => (chat.type === "dm" ? `dm:${chat.id}` : `stream:${chat.stream_id}`)),
    ).toEqual(["stream:1", "dm:20", "stream:2"]);
  });

  it("treats workspace dm: with two user ids as 1:1 personal (not group)", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["dm:10,20"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("dm:10,20", 0)]]]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map([
        [10, { full_name: "Alice" }],
        [20, { full_name: "Bob" }],
      ]),
      currentUserId: 10,
    });
    const dm = result.find((c) => c.type === "dm");
    expect(dm).toBeDefined();
    expect(dm).toMatchObject({
      type: "dm",
      isGroup: false,
      id: 20,
      name: "Bob",
    });
    expect(dm?.type === "dm" ? dm.userIds : null).toEqual([10, 20]);
  });

  it("matches cached 1:1 DM rows with current-user userIds to private folder peer id", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["dm:20"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("dm:20", 0)]]]),
      chatsSortedByLastMessage: [
        {
          type: "dm",
          id: 20,
          name: "Bob",
          slug: "20-bob",
          isGroup: false,
          userIds: [10, 20],
          lastMessage: "cached preview",
          time: "10:00",
          ts: 5000,
          avatar_url: "https://example.test/avatar.png",
        },
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map([[20, { full_name: "Bob" }]]),
      currentUserId: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "dm",
      id: 20,
      lastMessage: "cached preview",
      time: "10:00",
      avatar_url: "https://example.test/avatar.png",
    });
  });

  it("matches cached 1:1 DM rows by slug when userIds are missing", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["dm:20"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("dm:20", 0)]]]),
      chatsSortedByLastMessage: [
        {
          type: "dm",
          id: 20,
          name: "Bob",
          slug: "10-me,20-bob",
          isGroup: false,
          lastMessage: "cached preview",
          time: "10:00",
          ts: 5000,
          avatar_url: "https://example.test/avatar.png",
        },
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map([[20, { full_name: "Bob" }]]),
      currentUserId: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "dm",
      id: 20,
      lastMessage: "cached preview",
      time: "10:00",
      avatar_url: "https://example.test/avatar.png",
    });
  });

  it("filters group DM built from folder chatId with three or more users", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["dm:10,20,30"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("dm:10,20,30", 0)]]]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map([
        [10, { full_name: "A" }],
        [20, { full_name: "B" }],
        [30, { full_name: "C" }],
      ]),
      currentUserId: 10,
    });
    expect(result.filter((chat) => chat.type === "dm")).toHaveLength(0);
  });

  it("treats bare numeric folder chat ids as streams", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["42"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("42", 0)]]]),
      chatsSortedByLastMessage: [
        {
          type: "stream",
          stream_id: 42,
          name: "general",
          topics: [],
          lastMessage: "",
          time: "",
        },
        {
          type: "dm",
          id: 42,
          name: "Bob",
          slug: "42-bob",
          isGroup: false,
          lastMessage: "",
          time: "",
        },
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map([[42, { full_name: "Bob" }]]),
      currentUserId: 7,
    });

    expect(result.filter((chat) => chat.type === "dm")).toHaveLength(0);
    expect(result.filter((chat) => chat.type === "stream")).toHaveLength(1);
  });

  it("keeps legacy numeric stream when there is no matching DM candidate", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["77"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("77", 0)]]]),
      chatsSortedByLastMessage: [
        {
          type: "stream",
          stream_id: 77,
          name: "engineering",
          topics: [],
          lastMessage: "",
          time: "",
        },
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map(),
      currentUserId: 7,
    });

    expect(result.filter((chat) => chat.type === "stream")).toHaveLength(1);
    expect(result.filter((chat) => chat.type === "dm")).toHaveLength(0);
  });

  it("does not add archived stream from fallback folder items", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["stream:77"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("stream:77", 0)]]]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map([
        [
          77,
          {
            stream_id: 77,
            name: "engineering",
            isArchived: true,
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: 7,
    });

    expect(result.filter((chat) => chat.type === "stream")).toHaveLength(0);
  });

  it("does not add unknown-archived stream from fallback folder items in strict mode", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["stream:77"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("stream:77", 0)]]]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map([
        [
          77,
          {
            stream_id: 77,
            name: "engineering",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: 7,
      hideUnknownArchivedStreams: true,
    });

    expect(result.filter((chat) => chat.type === "stream")).toHaveLength(0);
  });

  it("keeps unknown-archived fallback stream when strict mode is disabled", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["stream:77"]),
      folderItemsByFolderId: new Map([[folderId, [folderItem("stream:77", 0)]]]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map([
        [
          77,
          {
            stream_id: 77,
            name: "engineering",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: 7,
      hideUnknownArchivedStreams: false,
    });

    expect(result.filter((chat) => chat.type === "stream")).toHaveLength(1);
  });

  it("keeps fallback muted streams below unmuted chats", () => {
    const folderId = "folder-1";
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["stream:77", "stream:42"]),
      folderItemsByFolderId: new Map([
        [folderId, [folderItem("stream:77", 0), folderItem("stream:42", 1)]],
      ]),
      chatsSortedByLastMessage: [
        {
          type: "stream",
          stream_id: 42,
          name: "engineering",
          topics: [],
          lastMessage: "recent",
          time: "10:00",
        },
      ],
      streamsMap: new Map([
        [
          77,
          {
            stream_id: 77,
            name: "muted",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: 7,
      isStreamMuted: (streamId) => streamId === 77,
    });

    expect(
      result.map((chat) => (chat.type === "stream" ? `stream:${chat.stream_id}` : `dm:${chat.id}`)),
    ).toEqual(["stream:42", "stream:77"]);
  });
});
