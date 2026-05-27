import { describe, expect, it } from "vitest";
import { resolveFolderItemUuid } from "./folder-sync-chat-id.lib";
import { SYSTEM_ALL_FOLDER_ID } from "./folder-sync-constants.lib";
import { hasMatchingChatId, toChatIdSet } from "./folder-sync-sidebar-chats.lib";
import {
  aliasAllFolderItemsCacheKeys,
  mergeFolderItemsSnapshot,
  resolveFolderItemsRequestUuid,
  resolveFolderUuidsForPollingItemsRefresh,
  resolvePinScopeFolderUuid,
  resolveSelectedFolderId,
  shouldLoadFolderItemsForSelection,
  sidebarFolderItemsMembershipPending,
  withDefaultSystemFolders,
} from "./folder-sync.lib";

const BASE_ITEM = {
  uuid: "item-1",
  folderUuid: "folder-1",
  orderIndex: 0,
  pinnedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} as const;

const LABELS = { allChats: "All", personal: "Personal", channels: "Channels" };

describe("resolvePinScopeFolderUuid", () => {
  const apiAllUuid = "550e8400-e29b-41d4-a716-446655440000";

  it("maps virtual system:all to API all-folder uuid", () => {
    expect(resolvePinScopeFolderUuid(SYSTEM_ALL_FOLDER_ID, apiAllUuid)).toBe(apiAllUuid);
  });
});

describe("resolveFolderItemsRequestUuid", () => {
  const apiAllUuid = "550e8400-e29b-41d4-a716-446655440000";

  it("maps virtual system:all to API all-folder uuid", () => {
    expect(resolveFolderItemsRequestUuid(SYSTEM_ALL_FOLDER_ID, apiAllUuid)).toBe(apiAllUuid);
  });

  it("maps legacy all id to API all-folder uuid", () => {
    expect(resolveFolderItemsRequestUuid("all", apiAllUuid)).toBe(apiAllUuid);
  });

  it("returns null for system:all when API uuid is not known yet", () => {
    expect(resolveFolderItemsRequestUuid(SYSTEM_ALL_FOLDER_ID, null)).toBeNull();
  });

  it("passes through created folder uuid unchanged", () => {
    expect(resolveFolderItemsRequestUuid("folder-created-1", apiAllUuid)).toBe("folder-created-1");
  });
});

describe("resolveFolderUuidsForPollingItemsRefresh", () => {
  const railFolders = [
    { id: SYSTEM_ALL_FOLDER_ID, systemType: "all" as const },
    { id: "folder-a", systemType: "created" as const },
    { id: "folder-b", systemType: "created" as const },
  ];

  it("includes selected created folder, stale folders, and folders missing from cache", () => {
    const uuids = resolveFolderUuidsForPollingItemsRefresh({
      foldersFromApi: [
        { uuid: "api-all", system_type: "all" },
        { uuid: "folder-a", system_type: "created" },
        { uuid: "folder-b", system_type: "created" },
      ],
      folderItemsByFolderId: new Map([["folder-a", []]]),
      staleFolderIds: new Set(["folder-c"]),
      selectedFolderId: "folder-b",
      foldersForRail: railFolders,
      allFolderApiUuid: "api-all",
    });

    expect(uuids).toContain("folder-b");
    expect(uuids).toContain("folder-c");
    expect(uuids).not.toContain("folder-a");
    expect(uuids).not.toContain("api-all");
  });

  it("skips system folders for selection", () => {
    const uuids = resolveFolderUuidsForPollingItemsRefresh({
      foldersFromApi: [{ uuid: "api-all", system_type: "all" }],
      folderItemsByFolderId: new Map(),
      staleFolderIds: new Set(),
      selectedFolderId: SYSTEM_ALL_FOLDER_ID,
      foldersForRail: [{ id: SYSTEM_ALL_FOLDER_ID, systemType: "all" }],
      allFolderApiUuid: "api-all",
    });

    expect(uuids).not.toContain("api-all");
  });
});

describe("mergeFolderItemsSnapshot", () => {
  it("aliases all-folder items under system:all rail id", () => {
    const apiAllUuid = "api-all-uuid";
    const items = [{ ...BASE_ITEM, uuid: "item-1", chatId: "dm:1", folderUuid: apiAllUuid }];
    const next = mergeFolderItemsSnapshot(new Map(), {
      folders: [{ uuid: apiAllUuid, system_type: "all" }],
      itemsByFolderId: new Map([[apiAllUuid, { ok: true, items }]]),
    });

    expect(next.get(apiAllUuid)).toEqual(items);
    expect(next.get(SYSTEM_ALL_FOLDER_ID)).toEqual(items);
    expect(next.get("all")).toEqual(items);
  });
});

describe("aliasAllFolderItemsCacheKeys", () => {
  it("mirrors items to system:all and legacy all keys", () => {
    const apiAllUuid = "api-all-uuid";
    const items = [{ ...BASE_ITEM, uuid: "item-1", chatId: "dm:1", folderUuid: apiAllUuid }];
    const map = new Map([[apiAllUuid, items]]);
    aliasAllFolderItemsCacheKeys(map, apiAllUuid);
    expect(map.get(SYSTEM_ALL_FOLDER_ID)).toEqual(items);
    expect(map.get("all")).toEqual(items);
  });
});

describe("withDefaultSystemFolders", () => {
  it("keeps virtual «all chats» id when API returns system all folder with its own uuid", () => {
    const apiAllUuid = "550e8400-e29b-41d4-a716-446655440000";
    const result = withDefaultSystemFolders(
      [
        {
          id: apiAllUuid,
          label: "All from API",
          backgroundColor: 2,
          systemType: "all",
          badge: 3,
        },
        {
          id: "other-created",
          label: "Team",
          backgroundColor: 0,
          systemType: "created",
        },
      ],
      LABELS,
      false,
    );

    expect(result[0]?.id).toBe(SYSTEM_ALL_FOLDER_ID);
    expect(result[0]?.label).toBe(LABELS.allChats);
    expect(result[0]?.badge).toBe(3);
    expect(result.some((f) => f.id === apiAllUuid)).toBe(false);
    expect(result.find((f) => f.id === "other-created")).toBeDefined();
  });
});

describe("folder-sync chat id matching", () => {
  it("matches dm ids regardless of participant order", () => {
    const chatIdSet = toChatIdSet([{ ...BASE_ITEM, chatId: "dm:21,7" }]);
    expect(hasMatchingChatId(chatIdSet, "dm:7,21")).toBe(true);
  });

  it("matches numeric folder ids against canonical stream id", () => {
    const chatIdSet = toChatIdSet([{ ...BASE_ITEM, chatId: "11" }]);
    expect(hasMatchingChatId(chatIdSet, "stream:11:general")).toBe(true);
  });

  it("resolveFolderItemUuid matches numeric API chat_id to stream sidebar id", () => {
    const items = [{ uuid: "item-11", chatId: "11" }];
    expect(resolveFolderItemUuid(items, "stream:11:general")).toBe("item-11");
  });
});

describe("sidebarFolderItemsMembershipPending", () => {
  const createdFolder = { id: "folder-1", systemType: "created" as const };

  it("returns false for system «all» selection", () => {
    expect(
      sidebarFolderItemsMembershipPending(
        [{ id: SYSTEM_ALL_FOLDER_ID, systemType: "all" }],
        SYSTEM_ALL_FOLDER_ID,
        new Map(),
      ),
    ).toBe(false);
  });

  it("returns true when created folder has no items row in the cache map yet", () => {
    expect(sidebarFolderItemsMembershipPending([createdFolder], "folder-1", new Map())).toBe(true);
  });

  it("returns false once the cache map contains the folder key (even with zero items)", () => {
    expect(
      sidebarFolderItemsMembershipPending([createdFolder], "folder-1", new Map([["folder-1", []]])),
    ).toBe(false);
  });
});

const folders = [
  { id: "all", systemType: "all" as const },
  { id: "system:personal", systemType: "personal" as const },
  { id: "system:channels", systemType: "channels" as const },
  { id: "folder-1", systemType: "created" as const },
  { id: "folder-2", systemType: "created" as const },
] as const;
const unsortedFoldersWithSystemAll = [
  { id: "folder-1", systemType: "created" as const },
  { id: "all", systemType: "all" as const },
] as const;
const onlyAllFolder = [{ id: "system:all", systemType: "all" as const }] as const;

describe("resolveSelectedFolderId", () => {
  it("falls back to the first folder when selected id is unknown", () => {
    expect(resolveSelectedFolderId(folders, "1")).toBe("all");
  });

  it("keeps existing selection when folder id exists", () => {
    expect(resolveSelectedFolderId(folders, "folder-1")).toBe("folder-1");
  });

  it("falls back to all-folder when it is the only available folder", () => {
    expect(resolveSelectedFolderId(onlyAllFolder, "unknown")).toBe("system:all");
  });
});

describe("shouldLoadFolderItemsForSelection", () => {
  it("does not load folder items for unknown selected id", () => {
    expect(shouldLoadFolderItemsForSelection(folders, "1")).toBe(false);
  });

  it("does not load folder items for all-folder selection", () => {
    expect(shouldLoadFolderItemsForSelection(folders, "all")).toBe(false);
  });

  it("does not load folder items for personal system-folder selection", () => {
    expect(shouldLoadFolderItemsForSelection(folders, "system:personal")).toBe(false);
  });

  it("does not load folder items for channels system-folder selection", () => {
    expect(shouldLoadFolderItemsForSelection(folders, "system:channels")).toBe(false);
  });

  it("loads folder items for valid custom folders", () => {
    expect(shouldLoadFolderItemsForSelection(folders, "folder-2")).toBe(true);
  });

  it("loads folder items for created folder even when all-folder is not first", () => {
    expect(shouldLoadFolderItemsForSelection(unsortedFoldersWithSystemAll, "folder-1")).toBe(true);
  });

  it("does not load folder items when only all-folder exists", () => {
    expect(shouldLoadFolderItemsForSelection(onlyAllFolder, "system:all")).toBe(false);
  });
});
