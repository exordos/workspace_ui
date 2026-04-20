import { describe, expect, it } from "vitest";
import {
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "~/features/folder-sync/folder-sync-constants.lib";
import { isSidebarSystemFolderScope } from "./sidebar.lib";

describe("isSidebarSystemFolderScope", () => {
  it("includes system rail ids and legacy «all»", () => {
    expect(isSidebarSystemFolderScope(SYSTEM_ALL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SYSTEM_PERSONAL_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope(SYSTEM_CHANNELS_FOLDER_ID)).toBe(true);
    expect(isSidebarSystemFolderScope("all")).toBe(true);
  });

  it("returns false for created folders", () => {
    expect(isSidebarSystemFolderScope("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});
