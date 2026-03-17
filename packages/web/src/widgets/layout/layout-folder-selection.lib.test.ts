import { describe, expect, it } from "vitest";
import {
  resolveSelectedFolderId,
  shouldLoadFolderItemsForSelection,
} from "./layout-folder-selection.lib";

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

describe("layout-folder-selection", () => {
  describe("resolveSelectedFolderId", () => {
    it("falls back to the first folder when selected id is unknown", () => {
      expect(resolveSelectedFolderId(folders, "1")).toBe("all");
    });

    it("keeps existing selection when folder id exists", () => {
      expect(resolveSelectedFolderId(folders, "folder-1")).toBe("folder-1");
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
      expect(shouldLoadFolderItemsForSelection(unsortedFoldersWithSystemAll, "folder-1")).toBe(
        true,
      );
    });
  });
});
