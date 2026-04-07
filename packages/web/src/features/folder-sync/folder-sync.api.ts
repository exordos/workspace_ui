import {
  getFolderItems,
  getFolders,
  type FolderItemForClient,
} from "~/shared/api/workspace-client";

type WorkspaceFolder = Awaited<ReturnType<typeof getFolders>>[number];

function isFolderWithUuid(f: WorkspaceFolder): f is WorkspaceFolder & { uuid: string } {
  return typeof f.uuid === "string" && f.uuid.trim().length > 0;
}

async function loadFolderItemsResultsMap(
  folders: WorkspaceFolder[],
  priorityFolderUuid?: string | null,
): Promise<Map<string, FolderItemsLoadResult>> {
  const withUuid = folders.filter(isFolderWithUuid);
  const next = new Map<string, FolderItemsLoadResult>();
  const priority = priorityFolderUuid?.trim();
  const priorityFolder =
    priority != null && priority.length > 0
      ? withUuid.find((f) => f.uuid === priority)
      : undefined;
  const others = priorityFolder
    ? withUuid.filter((f) => f.uuid !== priorityFolder.uuid)
    : withUuid;

  if (priorityFolder) {
    try {
      const items = await getFolderItems(priorityFolder.uuid);
      next.set(priorityFolder.uuid, { ok: true, items });
    } catch {
      next.set(priorityFolder.uuid, { ok: false, items: [] });
    }
  }

  const restEntries = await Promise.all(
    others.map(async (folder) => {
      try {
        const items = await getFolderItems(folder.uuid);
        return [folder.uuid, { ok: true, items } as FolderItemsLoadResult] as const;
      } catch {
        return [folder.uuid, { ok: false, items: [] } as FolderItemsLoadResult] as const;
      }
    }),
  );
  for (const [id, result] of restEntries) {
    next.set(id, result);
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

export interface LoadFolderSyncSnapshotOptions {
  force?: boolean;
  /** Fetched before the parallel batch so the active folder hydrates first. */
  priorityFolderUuid?: string | null;
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
    const itemsByFolderId = await loadFolderItemsResultsMap(
      folders,
      options?.priorityFolderUuid,
    );

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

export async function loadFolderItemsForSelection(
  folderId: string,
): Promise<FolderItemForClient[]> {
  // Отдельный запрос для выбранной папки (используется в select/fallback).
  return getFolderItems(folderId);
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
