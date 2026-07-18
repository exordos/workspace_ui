import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import { parseFolderItemStreamId } from "./folder-sync-chat-id.lib";

export interface FolderUnreadProjectionPatch {
  folders: WorkspaceFolderForRail[];
  folderItemsByFolderId: Map<string, FolderItemForClient[]>;
}

function normalizeStreamUuid(value: string): string {
  return value.trim().toLowerCase();
}

function itemStreamUuid(item: FolderItemForClient): string | null {
  const direct = item.streamUuid == null ? "" : normalizeStreamUuid(item.streamUuid);
  return direct.length > 0 ? direct : parseFolderItemStreamId(item.chatId);
}

function toSafeUnreadCount(value: number): number | null {
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function folderUnreadCount(items: readonly FolderItemForClient[]): number {
  return items.reduce((total, item) => total + (item.unreadCount ?? 0), 0);
}

function withFolderBadge(
  folder: WorkspaceFolderForRail,
  unreadCount: number,
): WorkspaceFolderForRail {
  const badge = unreadCount > 0 ? unreadCount : undefined;
  if (folder.badge === badge) {
    return folder;
  }
  return { ...folder, badge };
}

/** Projects one absolute stream unread snapshot into cached folder items and rail aggregates. */
export function projectStreamUnreadIntoFolders(
  folders: readonly WorkspaceFolderForRail[],
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>,
  streamUuid: string,
  unreadCount: number,
): FolderUnreadProjectionPatch | null {
  const normalizedStreamUuid = normalizeStreamUuid(streamUuid);
  const normalizedUnreadCount = toSafeUnreadCount(unreadCount);
  if (normalizedStreamUuid.length === 0 || normalizedUnreadCount == null) {
    return null;
  }

  const affectedFolderIds = new Set<string>();
  const nextFolderItemsByFolderId = new Map(folderItemsByFolderId);
  for (const [folderId, items] of folderItemsByFolderId) {
    let nextItems: FolderItemForClient[] | null = null;
    for (const [index, item] of items.entries()) {
      if (
        itemStreamUuid(item) !== normalizedStreamUuid ||
        item.unreadCount === normalizedUnreadCount
      ) {
        continue;
      }
      nextItems ??= [...items];
      nextItems[index] = { ...item, unreadCount: normalizedUnreadCount };
    }
    if (nextItems == null) continue;
    nextFolderItemsByFolderId.set(folderId, nextItems);
    affectedFolderIds.add(folderId);
  }
  if (affectedFolderIds.size === 0) {
    return null;
  }

  const nextFolders = folders.map((folder) => {
    if (!affectedFolderIds.has(folder.id)) {
      return folder;
    }
    return withFolderBadge(
      folder,
      folderUnreadCount(nextFolderItemsByFolderId.get(folder.id) ?? []),
    );
  });
  return { folders: nextFolders, folderItemsByFolderId: nextFolderItemsByFolderId };
}
