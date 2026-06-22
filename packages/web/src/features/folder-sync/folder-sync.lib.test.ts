import { describe, expect, it } from "vitest";
import { resolveFolderItemUuid } from "./folder-sync-chat-id.lib";
import { hasMatchingChatId, toChatIdSet } from "./folder-sync-sidebar-chats.lib";
import {
  mergeFolderItemsSnapshot,
  resolveFolderItemsRequestUuid,
  resolvePinScopeFolderUuid,
  resolveSelectedFolderId,
  shouldLoadFolderItemsForSelection,
  sidebarFolderItemsMembershipPending,
} from "./folder-sync.lib";

const ALL_FOLDER_UUID = "00000000-0000-0000-0000-000000000000";
const PERSONAL_FOLDER_UUID = "00000000-0000-0000-0000-000000000001";
const STREAM_UUID = "6738f91a-4fd1-416e-807f-cb4ae00ec1d3";

const BASE_ITEM = {
  uuid: "item-1",
  chatId: `stream:${STREAM_UUID}:general`,
  folderUuid: ALL_FOLDER_UUID,
  streamUuid: STREAM_UUID,
  chatType: "private" as const,
  unreadCount: 5,
  orderIndex: 0,
  pinnedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("resolvePinScopeFolderUuid", () => {
  it("uses the server folder uuid directly", () => {
    expect(resolvePinScopeFolderUuid(ALL_FOLDER_UUID)).toBe(ALL_FOLDER_UUID);
  });
});

describe("resolveFolderItemsRequestUuid", () => {
  it("passes server folder uuid unchanged", () => {
    expect(resolveFolderItemsRequestUuid(PERSONAL_FOLDER_UUID)).toBe(PERSONAL_FOLDER_UUID);
  });

  it("returns null for an empty folder id", () => {
    expect(resolveFolderItemsRequestUuid(" ")).toBeNull();
  });
});

describe("mergeFolderItemsSnapshot", () => {
  it("keeps server folder ids only and does not alias all-folder items", () => {
    const items = [{ ...BASE_ITEM, folderUuid: ALL_FOLDER_UUID }];
    const next = mergeFolderItemsSnapshot(new Map(), {
      folders: [{ uuid: ALL_FOLDER_UUID, system_type: "all" }],
      itemsByFolderId: new Map([[ALL_FOLDER_UUID, { ok: true, items }]]),
    });

    expect(next.get(ALL_FOLDER_UUID)).toEqual(items);
    expect(next).toHaveLength(1);
  });
});

describe("folder-sync chat id matching", () => {
  it("matches server stream uuid folder item ids against sidebar stream ids", () => {
    const chatIdSet = toChatIdSet([{ ...BASE_ITEM }]);
    expect(hasMatchingChatId(chatIdSet, `stream:${STREAM_UUID}:general`)).toBe(true);
  });

  it("resolveFolderItemUuid matches stream uuid aliases", () => {
    const items = [{ uuid: "item-11", chatId: `stream:${STREAM_UUID}:general` }];
    expect(resolveFolderItemUuid(items, `stream:${STREAM_UUID}`)).toBe("item-11");
  });
});

describe("sidebarFolderItemsMembershipPending", () => {
  const folders = [
    { id: ALL_FOLDER_UUID, systemType: "all" as const },
    { id: "folder-1", systemType: "created" as const },
  ];

  it("returns true for a server system folder while its items are not cached", () => {
    expect(sidebarFolderItemsMembershipPending(folders, ALL_FOLDER_UUID, new Map())).toBe(true);
  });

  it("returns false once the cache map contains the server folder key", () => {
    expect(
      sidebarFolderItemsMembershipPending(
        folders,
        ALL_FOLDER_UUID,
        new Map([[ALL_FOLDER_UUID, []]]),
      ),
    ).toBe(false);
  });

  it("returns false for unknown selected id", () => {
    expect(sidebarFolderItemsMembershipPending(folders, "missing", new Map())).toBe(false);
  });
});

describe("resolveSelectedFolderId", () => {
  const folders = [
    { id: ALL_FOLDER_UUID, systemType: "all" as const },
    { id: PERSONAL_FOLDER_UUID, systemType: "personal" as const },
  ];

  it("falls back to the first server folder when selected id is unknown", () => {
    expect(resolveSelectedFolderId(folders, "missing")).toBe(ALL_FOLDER_UUID);
  });

  it("keeps existing selection when folder id exists", () => {
    expect(resolveSelectedFolderId(folders, PERSONAL_FOLDER_UUID)).toBe(PERSONAL_FOLDER_UUID);
  });
});

describe("shouldLoadFolderItemsForSelection", () => {
  const folders = [
    { id: ALL_FOLDER_UUID, systemType: "all" as const },
    { id: PERSONAL_FOLDER_UUID, systemType: "personal" as const },
    { id: "folder-1", systemType: "created" as const },
  ];

  it("loads folder items for server system folders", () => {
    expect(shouldLoadFolderItemsForSelection(folders, ALL_FOLDER_UUID)).toBe(true);
    expect(shouldLoadFolderItemsForSelection(folders, PERSONAL_FOLDER_UUID)).toBe(true);
  });

  it("loads folder items for user-created folders", () => {
    expect(shouldLoadFolderItemsForSelection(folders, "folder-1")).toBe(true);
  });

  it("does not load folder items for unknown selected id", () => {
    expect(shouldLoadFolderItemsForSelection(folders, "missing")).toBe(false);
  });
});
