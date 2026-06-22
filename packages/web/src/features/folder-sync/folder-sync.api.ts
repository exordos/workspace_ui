import {
  getFolders,
  mapWorkspaceFolderItems,
  type FolderItemForClient,
} from "~/shared/api/workspace-client";

type WorkspaceFolder = Awaited<ReturnType<typeof getFolders>>[number];

function isFolderWithUuid(f: WorkspaceFolder): f is WorkspaceFolder & { uuid: string } {
  return typeof f.uuid === "string" && f.uuid.trim().length > 0;
}

function buildFolderItemsResultsMap(
  folders: WorkspaceFolder[],
): Map<string, FolderItemsLoadResult> {
  const next = new Map<string, FolderItemsLoadResult>();
  for (const folder of folders) {
    if (!isFolderWithUuid(folder)) {
      continue;
    }
    next.set(folder.uuid, { ok: true, items: mapWorkspaceFolderItems(folder) });
  }
  return next;
}

export interface FolderItemsLoadResult {
  // true when folder items loaded successfully; false keeps the error as best-effort.
  ok: boolean;
  items: FolderItemForClient[];
}

export interface FolderSyncSnapshot {
  // Folders and embedded folder_items from one server snapshot.
  folders: WorkspaceFolder[];
  itemsByFolderId: Map<string, FolderItemsLoadResult>;
  loadedAt: number;
}

// Dedupe parallel refresh calls per instance so identical batches are not duplicated.
const inFlightSnapshotsByInstance = new Map<string, Promise<FolderSyncSnapshot>>();

export interface LoadFolderSyncSnapshotOptions {
  force?: boolean;
  /** After `getFolders()`, before applying the full snapshot. */
  onFoldersLoaded?: (folders: WorkspaceFolder[]) => void | Promise<void>;
}

export async function loadFolderSyncSnapshot(
  instanceId: string,
  options?: LoadFolderSyncSnapshotOptions,
): Promise<FolderSyncSnapshot> {
  // Dedupe parallel refresh per instance.
  if (!options?.force) {
    const inFlight = inFlightSnapshotsByInstance.get(instanceId);
    if (inFlight) {
      return inFlight;
    }
  }

  const request = (async () => {
    const folders = await getFolders();
    await options?.onFoldersLoaded?.(folders);
    const itemsByFolderId = buildFolderItemsResultsMap(folders);

    const snapshot: FolderSyncSnapshot = {
      folders,
      itemsByFolderId,
      loadedAt: Date.now(),
    };
    return snapshot;
  })();

  inFlightSnapshotsByInstance.set(instanceId, request);
  void request.finally(() => {
    // Clear in-flight entry only if it still references this promise.
    if (inFlightSnapshotsByInstance.get(instanceId) === request) {
      inFlightSnapshotsByInstance.delete(instanceId);
    }
  });

  return request;
}

export function resetFolderSyncApiCacheForTests(): void {
  // Test helper: reset state between cases.
  inFlightSnapshotsByInstance.clear();
}
