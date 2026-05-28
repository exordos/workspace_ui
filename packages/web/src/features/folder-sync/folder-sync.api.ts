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
  // true — items папки загружены успешно, false — сохраняем ошибку как best-effort.
  ok: boolean;
  items: FolderItemForClient[];
}

export interface FolderSyncSnapshot {
  // Срез папок и items, собранный одним refresh-циклом.
  folders: WorkspaceFolder[];
  itemsByFolderId: Map<string, FolderItemsLoadResult>;
  loadedAt: number;
}

// In-flight кэш нужен, чтобы параллельные вызовы refresh не дублировали сетевой батч.
const inFlightSnapshotsByInstance = new Map<string, Promise<FolderSyncSnapshot>>();
// Последний успешный snapshot для текущего instanceId.
const latestSnapshotByInstance = new Map<string, FolderSyncSnapshot>();

function cloneSnapshot(snapshot: FolderSyncSnapshot): FolderSyncSnapshot {
  // Отдаем копию, чтобы внешние потребители не мутировали внутренний кэш.
  return {
    folders: [...snapshot.folders],
    itemsByFolderId: new Map(snapshot.itemsByFolderId),
    loadedAt: snapshot.loadedAt,
  };
}

export type FolderSyncItemsLoadScope = "all" | "selective";

export interface LoadFolderSyncSnapshotOptions {
  force?: boolean;
  /** Fetched before the parallel batch so the active folder hydrates first. */
  priorityFolderUuid?: string | null;
  /**
   * `all` — request items for every folder with uuid (bootstrap, mutation, reconnect).
   * `selective` — only uuids from `resolveSelectiveFolderUuids` (background polling).
   */
  itemsLoadScope?: FolderSyncItemsLoadScope;
  /** Called after `getFolders()` when `itemsLoadScope` is `selective`. */
  resolveSelectiveFolderUuids?: (folders: WorkspaceFolder[]) => string[];
  /** After `getFolders()`, before item requests complete — for early rail update. */
  onFoldersLoaded?: (folders: WorkspaceFolder[]) => void | Promise<void>;
}

export async function loadFolderSyncSnapshot(
  instanceId: string,
  options?: LoadFolderSyncSnapshotOptions,
): Promise<FolderSyncSnapshot> {
  // Дедупликация параллельных refresh по инстансу, чтобы не плодить одинаковые батчи.
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
    // Храним последний успешный snapshot для повторного использования внутри orchestrator.
    latestSnapshotByInstance.set(instanceId, snapshot);
    return snapshot;
  })();

  inFlightSnapshotsByInstance.set(instanceId, request);
  void request.finally(() => {
    // Чистим in-flight только если там все еще тот же промис.
    if (inFlightSnapshotsByInstance.get(instanceId) === request) {
      inFlightSnapshotsByInstance.delete(instanceId);
    }
  });

  return request;
}

export function readLatestFolderSyncSnapshot(instanceId: string): FolderSyncSnapshot | null {
  const snapshot = latestSnapshotByInstance.get(instanceId);
  return snapshot ? cloneSnapshot(snapshot) : null;
}

export function resetFolderSyncApiCacheForTests(): void {
  // Тестовая утилита: гарантирует чистое состояние между кейсами.
  inFlightSnapshotsByInstance.clear();
  latestSnapshotByInstance.clear();
}
