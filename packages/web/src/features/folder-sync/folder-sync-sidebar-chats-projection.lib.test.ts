import { describe, expect, it } from "vitest";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
import {
  buildCustomFolderSidebarChats,
  buildFallbackDmChatsFromFolderItems,
  collectKnownMatchedChatKeys,
} from "./folder-sync-sidebar-chats-projection.lib";

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

describe("folder-sync-sidebar-chats-projection", () => {
  it("collectKnownMatchedChatKeys tracks stream ids and dm keys", () => {
    const keys = collectKnownMatchedChatKeys(
      [
        { type: "stream", stream_id: 5, name: "general", lastMessage: "", time: "", topics: [] },
        {
          type: "dm",
          id: 20,
          name: "Bob",
          slug: "20-bob",
          isGroup: false,
          userIds: [10, 20],
          lastMessage: "",
          time: "",
        },
      ],
      10,
    );

    expect(keys.knownMatchedStreamIds.has(5)).toBe(true);
    expect(keys.knownMatchedDmKeys.has("dm:10,20")).toBe(true);
  });

  it("buildFallbackDmChatsFromFolderItems creates DM rows for unknown folder items", () => {
    const fallbacks = buildFallbackDmChatsFromFolderItems(
      [folderItem("dm:30", 0)],
      new Set<string>(),
      10,
      new Map([[30, { full_name: "Carol" }]]),
    );

    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]?.type).toBe("dm");
    expect(fallbacks[0]?.name).toBe("Carol");
  });

  it("buildCustomFolderSidebarChats merges matched chats with fallbacks in order", () => {
    const folderId = "folder-1";
    const result = buildCustomFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set(["stream:5", "dm:10,20"]),
      folderItemsByFolderId: new Map([
        [folderId, [folderItem("stream:5", 0), folderItem("dm:10,20", 1), folderItem("dm:30", 2)]],
      ]),
      chatsSortedByLastMessage: [
        {
          type: "stream",
          stream_id: 5,
          name: "general",
          lastMessage: "hi",
          time: "1m",
          topics: [],
        },
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map([[30, { full_name: "Carol" }]]),
      currentUserId: 10,
    });

    expect(result).toHaveLength(3);
    expect(result.some((chat) => chat.type === "stream" && chat.stream_id === 5)).toBe(true);
    expect(result.some((chat) => chat.type === "dm" && chat.name === "Carol")).toBe(true);
  });
});
