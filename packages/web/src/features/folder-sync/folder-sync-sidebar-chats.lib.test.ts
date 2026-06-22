import { describe, expect, it } from "vitest";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { buildSelectedFolderSidebarChats } from "./folder-sync-sidebar-chats.lib";

const FOLDER_ID = "00000000-0000-0000-0000-000000000000";
const STREAM_UUID = "6738f91a-4fd1-416e-807f-cb4ae00ec1d3";
const OTHER_STREAM_UUID = "815890be-9819-46b1-9291-880602e62b96";

function folderItem(streamUuid: string, orderIndex: number): FolderItemForClient {
  return {
    uuid: `item-${streamUuid}-${orderIndex}`,
    chatId: `stream:${streamUuid}:general`,
    folderUuid: FOLDER_ID,
    streamUuid,
    chatType: "stream",
    unreadCount: 0,
    orderIndex,
    pinnedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function streamChat(streamUuid: string, name: string): Extract<SidebarChat, { type: "stream" }> {
  return {
    type: "stream",
    streamUuid,
    name,
    topics: [],
    lastMessage: "",
    time: "",
  };
}

function streamEntry(params: {
  streamUuid: string;
  name: string;
  isArchived?: boolean;
}): StreamEntryInternal {
  return {
    streamUuid: params.streamUuid,
    name: params.name,
    isArchived: params.isArchived,
    lastMessage: "",
    time: "",
    ts: 0,
    topics: new Map(),
  };
}

describe("buildSelectedFolderSidebarChats", () => {
  it("projects selected folder from server folder item stream uuids", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: FOLDER_ID,
      folderChatIds: new Set([`stream:${STREAM_UUID}:general`]),
      folderItemsByFolderId: new Map([[FOLDER_ID, [folderItem(STREAM_UUID, 0)]]]),
      chatsSortedByLastMessage: [
        streamChat(STREAM_UUID, "Alice Smith"),
        streamChat(OTHER_STREAM_UUID, "Other"),
      ],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map(),
      currentUserId: null,
    });

    expect(result).toEqual([streamChat(STREAM_UUID, "Alice Smith")]);
  });

  it("does not derive a folder list when server items are missing", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: FOLDER_ID,
      folderChatIds: null,
      folderItemsByFolderId: new Map(),
      chatsSortedByLastMessage: [streamChat(STREAM_UUID, "Alice Smith")],
      streamsMap: new Map(),
      usersMapForChatInfo: new Map(),
      currentUserId: null,
    });

    expect(result).toEqual([]);
  });

  it("builds fallback stream rows from server folder item order", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: FOLDER_ID,
      folderChatIds: new Set([
        `stream:${STREAM_UUID}:general`,
        `stream:${OTHER_STREAM_UUID}:general`,
      ]),
      folderItemsByFolderId: new Map([
        [FOLDER_ID, [folderItem(OTHER_STREAM_UUID, 1), folderItem(STREAM_UUID, 0)]],
      ]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map([
        [STREAM_UUID, streamEntry({ streamUuid: STREAM_UUID, name: "First" })],
        [OTHER_STREAM_UUID, streamEntry({ streamUuid: OTHER_STREAM_UUID, name: "Second" })],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: null,
    });

    expect(
      result.map((chat) => (chat.type === "stream" ? `${chat.streamUuid}:${chat.name}` : "")),
    ).toEqual([`${STREAM_UUID}:First`, `${OTHER_STREAM_UUID}:Second`]);
  });

  it("does not add archived stream fallback rows", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: FOLDER_ID,
      folderChatIds: new Set([`stream:${STREAM_UUID}:general`]),
      folderItemsByFolderId: new Map([[FOLDER_ID, [folderItem(STREAM_UUID, 0)]]]),
      chatsSortedByLastMessage: [],
      streamsMap: new Map([
        [STREAM_UUID, streamEntry({ streamUuid: STREAM_UUID, name: "Archived", isArchived: true })],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: null,
    });

    expect(result).toEqual([]);
  });

  it("keeps muted fallback streams below unmuted matched chats", () => {
    const result = buildSelectedFolderSidebarChats({
      selectedFolderId: FOLDER_ID,
      folderChatIds: new Set([
        `stream:${STREAM_UUID}:general`,
        `stream:${OTHER_STREAM_UUID}:general`,
      ]),
      folderItemsByFolderId: new Map([
        [FOLDER_ID, [folderItem(OTHER_STREAM_UUID, 0), folderItem(STREAM_UUID, 1)]],
      ]),
      chatsSortedByLastMessage: [streamChat(STREAM_UUID, "Unmuted")],
      streamsMap: new Map([
        [OTHER_STREAM_UUID, streamEntry({ streamUuid: OTHER_STREAM_UUID, name: "Muted" })],
      ]),
      usersMapForChatInfo: new Map(),
      currentUserId: null,
      isStreamMuted: (streamUuid) => streamUuid === OTHER_STREAM_UUID,
    });

    expect(result.map((chat) => (chat.type === "stream" ? chat.streamUuid : ""))).toEqual([
      STREAM_UUID,
      OTHER_STREAM_UUID,
    ]);
  });
});
