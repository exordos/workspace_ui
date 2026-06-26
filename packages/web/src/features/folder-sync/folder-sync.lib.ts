import type { FolderItemForClient } from "~/shared/api/workspace-client";
import { toChatIdSet } from "./folder-sync-sidebar-chats.lib";

export interface FolderSyncSystemLabels {
  allChats: string;
  personal: string;
  channels: string;
}

interface FolderLike {
  id: string;
  systemType?: "created" | "all" | "personal" | "channels";
}

interface FolderItemsLoadResult {
  ok: boolean;
  items: FolderItemForClient[];
}

interface FolderSnapshotLike {
  folders: readonly { uuid?: string; system_type?: string | null }[];
  itemsByFolderId: ReadonlyMap<string, FolderItemsLoadResult>;
}

function hasFolderId(folders: readonly FolderLike[], folderId: string): boolean {
  return folders.some((folder) => folder.id === folderId);
}

/** Maps sidebar/rail folder id to the Workspace API folder uuid used by folder-item filters. */
export function resolveFolderItemsRequestUuid(folderId: string): string | null {
  const trimmed = folderId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

/**
 * Maps sidebar folder scope (rail id) to Workspace API folder uuid for pin/unpin and folder items.
 */
export function resolvePinScopeFolderUuid(scopeFolderId: string): string | null {
  const resolved = resolveFolderItemsRequestUuid(scopeFolderId);
  if (resolved != null) {
    return resolved;
  }
  return null;
}

/** Backend uuid for the Workspace folder with `system_type === "all"`. */
export function resolveAllFolderApiUuid(
  folders: readonly { uuid?: string; system_type?: string | null }[],
): string | null {
  for (const folder of folders) {
    if (folder.system_type !== "all") {
      continue;
    }
    const uuid = folder.uuid?.trim();
    if (uuid != null && uuid.length > 0) {
      return uuid;
    }
  }
  return null;
}

export function resolveSelectedFolderId(
  folders: readonly FolderLike[],
  selectedFolderId: string,
): string | null {
  // Selected folder gone — fall back to the first available folder.
  if (folders.length === 0) {
    return null;
  }
  if (hasFolderId(folders, selectedFolderId)) {
    return selectedFolderId;
  }
  return folders[0]?.id ?? null;
}

export function shouldLoadFolderItemsForSelection(
  folders: readonly FolderLike[],
  selectedFolderId: string,
): boolean {
  if (folders.length === 0) return false;
  return hasFolderId(folders, selectedFolderId);
}

/** True until folder items for the selected server folder are present in the local cache map. */
export function sidebarFolderItemsMembershipPending(
  folders: readonly FolderLike[],
  selectedFolderId: string,
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>,
): boolean {
  if (!shouldLoadFolderItemsForSelection(folders, selectedFolderId)) {
    return false;
  }
  return !folderItemsByFolderId.has(selectedFolderId);
}

export function mergeFolderItemsSnapshot(
  previous: ReadonlyMap<string, FolderItemForClient[]>,
  snapshot: FolderSnapshotLike,
): Map<string, FolderItemForClient[]> {
  // Keep live folders only; on per-folder error retain stale items.
  const next = new Map<string, FolderItemForClient[]>();
  const liveFolderIds = new Set(
    snapshot.folders
      .map((folder) => folder.uuid)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  );

  for (const folderId of liveFolderIds) {
    const result = snapshot.itemsByFolderId.get(folderId);
    if (result?.ok) {
      next.set(folderId, result.items);
      continue;
    }
    const stale = previous.get(folderId);
    if (stale) {
      next.set(folderId, stale);
    }
  }

  return next;
}

export function describeFolderChatIdsForLog(
  value: ReadonlySet<string> | Set<string> | null,
): "null" | "empty" | `size:${number}` {
  if (value === null) {
    return "null";
  }
  if (value.size === 0) {
    return "empty";
  }
  return `size:${value.size}`;
}

export function resolveSelectedFolderChatIdsOnSelect(options: {
  shouldLoadSelectedFolderItems: boolean;
  cachedItemsForSelectedFolder: readonly FolderItemForClient[] | undefined;
}): Set<string> | null {
  if (!options.shouldLoadSelectedFolderItems) {
    return null;
  }
  if (options.cachedItemsForSelectedFolder != null) {
    return toChatIdSet(options.cachedItemsForSelectedFolder);
  }
  // Cache miss: show empty folder immediately so chats from "all" do not leak through.
  return new Set<string>();
}
