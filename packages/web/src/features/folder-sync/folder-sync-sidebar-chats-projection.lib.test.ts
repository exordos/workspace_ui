import { describe, expect, it } from "vitest";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
import {
  buildCustomFolderSidebarChats,
  buildFallbackDmChatsFromFolderItems,
  collectKnownMatchedChatKeys,
} from "./folder-sync-sidebar-chats-projection.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000005";

function folderItem(
  chatId: string,
  orderIndex: number,
  overrides: Partial<FolderItemForClient> = {},
): FolderItemForClient {
  return {
    uuid: `item-${chatId}-${orderIndex}`,
    chatId,
    folderUuid: "folder-1",
    orderIndex,
    pinnedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("folder-sync-sidebar-chats-projection", () => {
  it("collectKnownMatchedChatKeys tracks stream ids and dm keys", () => {
    const keys = collectKnownMatchedChatKeys(
      [
        {
          type: "stream",
          streamUuid: STREAM_UUID,
          name: "general",
          lastMessage: "",
          time: "",
          topics: [],
        },
        {
          type: "dm",
          id: 20,
          name: "Bob",
          slug: "20-bob",
          userIds: [10, 20],
          lastMessage: "",
          time: "",
        },
      ],
      10,
    );

    expect(keys.knownMatchedStreamIds.has(STREAM_UUID)).toBe(true);
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

  it("applies folder item unread_count to matched private stream rows", () => {
    const privateStreamUuid = "11111111-1111-4111-8111-111111111111";
    const folderId = "folder-1";
    const result = buildCustomFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set([`stream:${privateStreamUuid}:general`]),
      folderItemsByFolderId: new Map([
        [
          folderId,
          [
            folderItem(`stream:${privateStreamUuid}:general`, 0, {
              streamUuid: privateStreamUuid,
              chatType: "private",
              unreadCount: 4,
            }),
          ],
        ],
      ]),
      chatsSortedByLastMessage: [
        {
          type: "stream",
          streamUuid: privateStreamUuid,
          private: true,
          name: "Alice Smith",
          lastMessage: "hello",
          time: "1m",
          topics: [{ subject: "general", badge: 4 }],
        },
      ],
      streamsMap: new Map([
        [
          privateStreamUuid,
          {
            streamUuid: privateStreamUuid,
            private: true,
            name: "Alice Smith",
            lastMessage: "hello",
            time: "1m",
            ts: 10,
            unreadCount: 4,
            topics: new Map(),
          },
        ],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "stream",
      name: "Alice Smith",
      badge: 4,
      streamUuid: privateStreamUuid,
    });
    expect(result[0]?.type === "stream" ? result[0].topics?.[0]?.badge : undefined).toBe(4);
  });

  it("builds private stream fallback with folder item unread count", () => {
    const privateStreamUuid = "22222222-2222-4222-8222-222222222222";
    const folderId = "folder-1";
    const result = buildCustomFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set([`stream:${privateStreamUuid}:general`]),
      folderItemsByFolderId: new Map([
        [
          folderId,
          [
            folderItem(`stream:${privateStreamUuid}:general`, 0, {
              streamUuid: privateStreamUuid,
              chatType: "private",
              unreadCount: 3,
            }),
          ],
        ],
      ]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map([
        [
          privateStreamUuid,
          {
            streamUuid: privateStreamUuid,
            private: true,
            name: "Alice Smith",
            lastMessage: "new message",
            time: "now",
            ts: 12,
            unreadCount: 0,
            topics: new Map(),
          },
        ],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: 10,
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: "stream",
        name: "Alice Smith",
        streamUuid: privateStreamUuid,
        badge: 3,
      }),
    ]);
  });

  it("buildCustomFolderSidebarChats merges matched chats with fallbacks in order", () => {
    const folderId = "folder-1";
    const result = buildCustomFolderSidebarChats({
      selectedFolderId: folderId,
      folderChatIds: new Set([`stream:${STREAM_UUID}:general`, "dm:10,20"]),
      folderItemsByFolderId: new Map([
        [
          folderId,
          [
            folderItem(`stream:${STREAM_UUID}:general`, 0),
            folderItem("dm:10,20", 1),
            folderItem("dm:30", 2),
          ],
        ],
      ]),
      chatsSortedByLastMessage: [
        {
          type: "stream",
          streamUuid: STREAM_UUID,
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
    expect(result.some((chat) => chat.type === "stream" && chat.streamUuid === STREAM_UUID)).toBe(
      true,
    );
    expect(result.some((chat) => chat.type === "dm" && chat.name === "Carol")).toBe(true);
  });
});
