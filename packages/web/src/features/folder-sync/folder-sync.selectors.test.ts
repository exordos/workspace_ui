import { describe, expect, it } from "vitest";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
import { SYSTEM_CHANNELS_FOLDER_ID, SYSTEM_PERSONAL_FOLDER_ID } from "./folder-sync-constants.lib";
import { selectSidebarChatsLoading } from "./folder-sync.selectors";

const CREATED_FOLDER = {
  id: "folder-created-1",
  label: "Team",
  backgroundColor: 0,
  systemType: "created" as const,
};

const EMPTY_FOLDER_ITEMS_MAP: ReadonlyMap<string, FolderItemForClient[]> = new Map();

describe("folder-sync selectors", () => {
  it("always returns false for personal/channels system folders", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: SYSTEM_PERSONAL_FOLDER_ID,
        loading: true,
        folders: [],
        folderItemsByFolderId: EMPTY_FOLDER_ITEMS_MAP,
      }),
    ).toBe(false);
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: SYSTEM_CHANNELS_FOLDER_ID,
        loading: true,
        folders: [],
        folderItemsByFolderId: EMPTY_FOLDER_ITEMS_MAP,
      }),
    ).toBe(false);
  });

  it("mirrors loading flag for created folders", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: "folder-created-1",
        loading: true,
        folders: [CREATED_FOLDER],
        folderItemsByFolderId: new Map([["folder-created-1", []]]),
      }),
    ).toBe(true);
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: "folder-created-1",
        loading: false,
        folders: [CREATED_FOLDER],
        folderItemsByFolderId: new Map([["folder-created-1", []]]),
      }),
    ).toBe(false);
  });

  it("returns true while created folder items are not yet in the cache map", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: "folder-created-1",
        loading: false,
        folders: [CREATED_FOLDER],
        folderItemsByFolderId: EMPTY_FOLDER_ITEMS_MAP,
      }),
    ).toBe(true);
  });
});
