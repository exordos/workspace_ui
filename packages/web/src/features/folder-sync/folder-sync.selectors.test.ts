import { describe, expect, it } from "vitest";
import {
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "./folder-sync-constants.lib";
import { selectSidebarChatsLoading } from "./folder-sync.selectors";

describe("folder-sync selectors", () => {
  it("always returns false for personal/channels system folders", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: SYSTEM_PERSONAL_FOLDER_ID,
        loading: true,
      }),
    ).toBe(false);
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: SYSTEM_CHANNELS_FOLDER_ID,
        loading: true,
      }),
    ).toBe(false);
  });

  it("mirrors loading flag for created folders", () => {
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: "folder-created-1",
        loading: true,
      }),
    ).toBe(true);
    expect(
      selectSidebarChatsLoading({
        selectedFolderId: "folder-created-1",
        loading: false,
      }),
    ).toBe(false);
  });
});
