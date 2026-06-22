import { describe, expect, it } from "vitest";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
import { selectSidebarChatsLoading } from "./folder-sync.selectors";

const ALL_FOLDER = {
  id: "00000000-0000-0000-0000-000000000000",
  label: "All chats",
  backgroundColor: 0,
  systemType: "all" as const,
};

const CREATED_FOLDER = {
  id: "folder-created-1",
  label: "Team",
  backgroundColor: 0,
  systemType: "created" as const,
};

const EMPTY_FOLDER_ITEMS_MAP: ReadonlyMap<string, FolderItemForClient[]> = new Map();

describe("folder-sync selectors", () => {
  it("mirrors loading flag for server folders", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: ALL_FOLDER.id,
        loading: true,
        folders: [ALL_FOLDER],
        folderItemsByFolderId: new Map([[ALL_FOLDER.id, []]]),
      }),
    ).toBe(true);
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: ALL_FOLDER.id,
        loading: false,
        folders: [ALL_FOLDER],
        folderItemsByFolderId: new Map([[ALL_FOLDER.id, []]]),
      }),
    ).toBe(false);
  });

  it("returns true while a selected server folder has no items cache row yet", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: ALL_FOLDER.id,
        loading: false,
        folders: [ALL_FOLDER, CREATED_FOLDER],
        folderItemsByFolderId: EMPTY_FOLDER_ITEMS_MAP,
      }),
    ).toBe(true);
  });

  it("returns false for unknown selected id", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: "missing",
        loading: false,
        folders: [ALL_FOLDER],
        folderItemsByFolderId: EMPTY_FOLDER_ITEMS_MAP,
      }),
    ).toBe(false);
  });
});
