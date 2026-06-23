import { describe, expect, it } from "vitest";
import { orderedIndexedFoldersForRail, type IndexedFolderEntry } from "./folder-rail.lib";

function entry(
  id: string,
  index: number,
  systemType: IndexedFolderEntry["folder"]["systemType"],
): IndexedFolderEntry {
  return {
    folder: { id, label: id, backgroundColor: 1, systemType },
    index,
  };
}

describe("orderedIndexedFoldersForRail", () => {
  it("returns empty for empty input", () => {
    expect(orderedIndexedFoldersForRail([])).toEqual([]);
  });

  it("keeps server folder order when all-folder is not first", () => {
    const indexed: IndexedFolderEntry[] = [
      entry("custom", 0, "created"),
      entry("all-api", 1, "all"),
      entry("b", 2, "created"),
    ];
    expect(orderedIndexedFoldersForRail(indexed).map((e) => e.folder.id)).toEqual([
      "custom",
      "all-api",
      "b",
    ]);
    expect(orderedIndexedFoldersForRail(indexed).map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it("keeps first slot without systemType as server-provided created folder", () => {
    const indexed: IndexedFolderEntry[] = [
      { folder: { id: "legacy-all", label: "All", backgroundColor: 1 }, index: 0 },
      entry("b", 1, "created"),
    ];
    expect(orderedIndexedFoldersForRail(indexed).map((e) => e.folder.id)).toEqual([
      "legacy-all",
      "b",
    ]);
  });

  it("falls back to first entry when no all match", () => {
    const indexed: IndexedFolderEntry[] = [entry("only", 0, "created")];
    expect(orderedIndexedFoldersForRail(indexed).map((e) => e.folder.id)).toEqual(["only"]);
  });
});
