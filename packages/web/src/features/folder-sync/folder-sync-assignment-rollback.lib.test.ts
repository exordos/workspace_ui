import { describe, expect, it } from "vitest";
import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import {
  sliceAfterFolderAssignmentRollback,
  sliceAfterOptimisticFolderAssignment,
} from "./folder-sync-assignment-rollback.lib";

const folderUuid = "folder-1";

function item(chatId: string, orderIndex = 0): FolderItemForClient {
  return {
    uuid: `item-${chatId}`,
    chatId,
    folderUuid,
    orderIndex,
    pinnedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

const baseState = {
  folderItemsByFolderId: new Map<string, FolderItemForClient[]>([[folderUuid, [item("stream:5")]]]),
  staleFolderIds: new Set<string>(),
  selectedFolderId: folderUuid,
  folders: [
    { id: folderUuid, label: "Work", backgroundColor: 1, systemType: "created" },
  ] as WorkspaceFolderForRail[],
};

describe("folder-sync-assignment-rollback", () => {
  it("restores previous folder items on rollback", () => {
    const previousItems = [item("stream:5"), item("dm:10,20", 1)];
    const patch = sliceAfterFolderAssignmentRollback(
      baseState,
      {
        folderUuid,
        hadFolderCache: true,
        previousItems,
        wasStaleBefore: false,
      },
      false,
    );

    expect(patch.folderItemsByFolderId?.get(folderUuid)).toEqual(previousItems);
    expect(patch.selectedFolderChatIds?.has("stream:5")).toBe(true);
    expect(patch.selectedFolderChatIds?.has("dm:10,20")).toBe(true);
  });

  it("applies optimistic assignment and updates selected chat ids", () => {
    const patch = sliceAfterOptimisticFolderAssignment(baseState, {
      folderUuid,
      chatId: "dm:10,30",
      itemUuid: null,
      isRemove: false,
      removeFolderAssignmentItem: (items, chatId, itemUuid) =>
        items.filter((entry) => entry.uuid !== itemUuid && entry.chatId !== chatId),
      upsertOptimisticFolderItem: (items, uuid, chatId) => [
        ...items,
        { ...item(chatId, items.length), folderUuid: uuid },
      ],
      markFolderAsStale: (staleIds, uuid) => new Set([...staleIds, uuid]),
    });

    expect(patch.folderItemsByFolderId?.get(folderUuid)?.map((entry) => entry.chatId)).toEqual([
      "stream:5",
      "dm:10,30",
    ]);
    expect(patch.selectedFolderChatIds?.has("stream:5")).toBe(true);
    expect(patch.selectedFolderChatIds?.has("dm:10,30")).toBe(true);
  });
});
