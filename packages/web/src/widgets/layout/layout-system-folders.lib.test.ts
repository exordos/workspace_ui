import { describe, expect, it } from "vitest";
import {
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
  withDefaultSystemFolders,
} from "./layout-system-folders.lib";

const labels = {
  allChats: "All chats",
  personal: "Personal",
  channels: "Channels",
} as const;

describe("layout-system-folders", () => {
  it("keeps backend all-folder and does not create synthetic duplicate", () => {
    const input = [
      { id: "all-from-api", label: "All (API)", backgroundColor: 12, systemType: "all" as const },
      { id: "folder-1", label: "Custom", backgroundColor: 1, systemType: "created" as const },
    ] as const;

    const normalized = withDefaultSystemFolders(input, labels);
    const allFolders = normalized.filter((folder) => folder.systemType === "all");

    expect(allFolders).toHaveLength(1);
    expect(allFolders[0]?.id).toBe("all-from-api");
    expect(normalized.some((folder) => folder.id === SYSTEM_ALL_FOLDER_ID)).toBe(false);
  });

  it("adds synthetic all-folder as first item when all-folder is missing", () => {
    const input = [
      { id: "folder-1", label: "Custom 1", backgroundColor: 1, systemType: "created" as const },
      { id: "folder-2", label: "Custom 2", backgroundColor: 2, systemType: "created" as const },
    ] as const;

    const normalized = withDefaultSystemFolders(input, labels);

    expect(normalized.map((folder) => folder.id)).toEqual([
      SYSTEM_ALL_FOLDER_ID,
      SYSTEM_PERSONAL_FOLDER_ID,
      SYSTEM_CHANNELS_FOLDER_ID,
      "folder-1",
      "folder-2",
    ]);
    expect(normalized[0]).toMatchObject({
      id: SYSTEM_ALL_FOLDER_ID,
      label: "All chats",
      backgroundColor: 0,
      systemType: "all",
    });
  });

  it("returns only synthetic all-folder for empty input", () => {
    const normalized = withDefaultSystemFolders([], labels);

    expect(normalized).toEqual([
      {
        id: SYSTEM_ALL_FOLDER_ID,
        label: "All chats",
        backgroundColor: 0,
        systemType: "all",
      },
    ]);
  });

  it("preserves custom folders order", () => {
    const input = [
      { id: "folder-a", label: "A", backgroundColor: 1, systemType: "created" as const },
      { id: "all-from-api", label: "All", backgroundColor: 2, systemType: "all" as const },
      { id: "folder-b", label: "B", backgroundColor: 3, systemType: "created" as const },
      { id: "folder-c", label: "C", backgroundColor: 4, systemType: "created" as const },
    ] as const;

    const normalized = withDefaultSystemFolders(input, labels);

    expect(normalized.map((folder) => folder.id)).toEqual([
      "folder-a",
      "all-from-api",
      SYSTEM_PERSONAL_FOLDER_ID,
      SYSTEM_CHANNELS_FOLDER_ID,
      "folder-b",
      "folder-c",
    ]);
  });

  it("does not duplicate personal/channels folders on repeated normalization", () => {
    const once = withDefaultSystemFolders(
      [{ id: "folder-1", label: "Custom", backgroundColor: 1, systemType: "created" }],
      labels,
    );
    const twice = withDefaultSystemFolders(once, labels);

    expect(twice.filter((folder) => folder.systemType === "personal")).toHaveLength(1);
    expect(twice.filter((folder) => folder.systemType === "channels")).toHaveLength(1);
    expect(twice.filter((folder) => folder.systemType === "all")).toHaveLength(1);
    expect(twice.map((folder) => folder.id)).toEqual(once.map((folder) => folder.id));
  });
});
