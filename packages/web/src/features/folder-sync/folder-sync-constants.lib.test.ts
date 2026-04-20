import { describe, expect, it } from "vitest";
import {
  isSystemRailFolderId,
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "./folder-sync-constants.lib";

describe("isSystemRailFolderId", () => {
  it("returns true for built-in system folder ids", () => {
    expect(isSystemRailFolderId(SYSTEM_ALL_FOLDER_ID)).toBe(true);
    expect(isSystemRailFolderId(SYSTEM_PERSONAL_FOLDER_ID)).toBe(true);
    expect(isSystemRailFolderId(SYSTEM_CHANNELS_FOLDER_ID)).toBe(true);
  });

  it("returns false for created folders and unrelated strings", () => {
    expect(isSystemRailFolderId("folder-uuid")).toBe(false);
    expect(isSystemRailFolderId("all")).toBe(false);
  });
});
