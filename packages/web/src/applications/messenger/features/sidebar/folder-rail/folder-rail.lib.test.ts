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

  it("pins all-folder first when it is not first in source order", () => {
    const indexed: IndexedFolderEntry[] = [
      entry("custom", 0, "created"),
      entry("all-api", 1, "all"),
      entry("b", 2, "created"),
    ];
    expect(orderedIndexedFoldersForRail(indexed).map((e) => e.folder.id)).toEqual([
      "all-api",
      "custom",
      "b",
    ]);
    expect(orderedIndexedFoldersForRail(indexed).map((e) => e.index)).toEqual([1, 0, 2]);
  });

  it("treats first slot without systemType as all (legacy)", () => {
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
