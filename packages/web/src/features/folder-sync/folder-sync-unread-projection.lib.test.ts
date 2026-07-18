import { describe, expect, it } from "vitest";
import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import { projectStreamUnreadIntoFolders } from "./folder-sync-unread-projection.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000099";
const OTHER_STREAM_UUID = "00000000-0000-4000-8000-000000000100";

function folder(
  id: string,
  badge: number | undefined,
  systemType: WorkspaceFolderForRail["systemType"] = "created",
): WorkspaceFolderForRail {
  return { id, label: id, backgroundColor: 0, badge, systemType };
}

function item(folderUuid: string, streamUuid: string, unreadCount: number): FolderItemForClient {
  return {
    uuid: `${folderUuid}:${streamUuid}`,
    chatId: `stream:${streamUuid}:general`,
    folderUuid,
    streamUuid,
    unreadCount,
    orderIndex: 0,
    pinnedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("projectStreamUnreadIntoFolders", () => {
  it("updates all cached stream items and locally recalculates system and custom badges", () => {
    const folders = [folder("all", 3, "all"), folder("custom", 1), folder("unrelated", 2)];
    const folderItemsByFolderId = new Map<string, FolderItemForClient[]>([
      ["all", [item("all", STREAM_UUID, 1), item("all", OTHER_STREAM_UUID, 2)]],
      ["custom", [item("custom", STREAM_UUID, 1)]],
      ["unrelated", [item("unrelated", OTHER_STREAM_UUID, 2)]],
    ]);

    const patch = projectStreamUnreadIntoFolders(
      folders,
      folderItemsByFolderId,
      STREAM_UUID.toUpperCase(),
      5,
    );

    expect(patch).not.toBeNull();
    expect(patch?.folderItemsByFolderId.get("all")?.map((entry) => entry.unreadCount)).toEqual([
      5, 2,
    ]);
    expect(patch?.folderItemsByFolderId.get("custom")?.[0]?.unreadCount).toBe(5);
    expect(patch?.folders.map((entry) => [entry.id, entry.badge])).toEqual([
      ["all", 7],
      ["custom", 5],
      ["unrelated", 2],
    ]);
    expect(patch?.folderItemsByFolderId.get("unrelated")).toBe(
      folderItemsByFolderId.get("unrelated"),
    );
    expect(folderItemsByFolderId.get("all")?.[0]?.unreadCount).toBe(1);
  });

  it("projects one authoritative stream count into 300 unique cached folders", () => {
    const folders = Array.from({ length: 300 }, (_value, index) => folder(`custom-${index}`, 1));
    const folderItemsByFolderId = new Map(
      folders.map((entry) => [entry.id, [item(entry.id, STREAM_UUID, 1)]]),
    );

    const patch = projectStreamUnreadIntoFolders(folders, folderItemsByFolderId, STREAM_UUID, 9);

    expect(patch?.folders).toHaveLength(300);
    expect(patch?.folders.every((entry) => entry.badge === 9)).toBe(true);
    expect(
      Array.from(patch?.folderItemsByFolderId.values() ?? []).every(
        (items) => items[0]?.unreadCount === 9,
      ),
    ).toBe(true);
  });

  it("is idempotent for a repeated absolute unread snapshot", () => {
    const folders = [folder("custom", 4)];
    const folderItemsByFolderId = new Map([["custom", [item("custom", STREAM_UUID, 4)]]]);

    expect(
      projectStreamUnreadIntoFolders(folders, folderItemsByFolderId, STREAM_UUID, 4),
    ).toBeNull();
  });
});
