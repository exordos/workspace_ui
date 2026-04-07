import { describe, expect, it } from "vitest";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
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

  it("still builds a true group DM when three or more user ids are in chatId", () => {
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
    const dm = result.find((c) => c.type === "dm");
    expect(dm).toBeDefined();
    expect(dm).toMatchObject({ type: "dm", isGroup: true });
  });
});
