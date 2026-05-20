import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import {
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "./folder-sync-constants.lib";

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

function isPersonalOrChannelsSystemFolder(folder: WorkspaceFolderForRail): boolean {
  // Эти папки могут синтетически добавляться в UI и не должны дублироваться.
  return (
    folder.id === SYSTEM_PERSONAL_FOLDER_ID ||
    folder.id === SYSTEM_CHANNELS_FOLDER_ID ||
    folder.systemType === "personal" ||
    folder.systemType === "channels"
  );
}

function createSyntheticAllFolder(labels: FolderSyncSystemLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_ALL_FOLDER_ID,
    label: labels.allChats,
    backgroundColor: 0,
    systemType: "all",
  };
}

function createPersonalFolder(labels: FolderSyncSystemLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_PERSONAL_FOLDER_ID,
    label: labels.personal,
    backgroundColor: 0,
    systemType: "personal",
  };
}

function createChannelsFolder(labels: FolderSyncSystemLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_CHANNELS_FOLDER_ID,
    label: labels.channels,
    backgroundColor: 0,
    systemType: "channels",
  };
}

function hasFolderId(folders: readonly FolderLike[], folderId: string): boolean {
  return folders.some((folder) => folder.id === folderId);
}

function resolveFolderSystemType(
  folders: readonly FolderLike[],
  folder: FolderLike,
): NonNullable<FolderLike["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return folders[0]?.id === folder.id ? "all" : "created";
}

function resolveSelectedFolderSystemType(
  folders: readonly FolderLike[],
  selectedFolderId: string,
): NonNullable<FolderLike["systemType"]> | null {
  // Тип важен, чтобы понять нужен ли сетевой load items для выбранной папки.
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  if (!selectedFolder) {
    return null;
  }
  return resolveFolderSystemType(folders, selectedFolder);
}

export function withDefaultSystemFolders(
  folders: readonly WorkspaceFolderForRail[],
  labels: FolderSyncSystemLabels,
  showSystemFolders = false,
): WorkspaceFolderForRail[] {
  // Нормализуем "all" и при необходимости вставляем personal/channels сразу после all.
  // Виртуальный id `system:all` всегда — папка «Все чаты» из API не подменяет rail (badge переносим).
  const baseFolders = folders.filter((folder) => !isPersonalOrChannelsSystemFolder(folder));
  const preferredAllFolder =
    baseFolders.find(
      (folder) => folder.systemType === "all" && folder.id !== SYSTEM_ALL_FOLDER_ID,
    ) ?? baseFolders.find((folder) => folder.systemType === "all");

  const syntheticAll = createSyntheticAllFolder(labels);
  const normalizedAllFolder: WorkspaceFolderForRail =
    preferredAllFolder?.badge !== undefined
      ? { ...syntheticAll, badge: preferredAllFolder.badge }
      : syntheticAll;

  const foldersWithoutApiAll = baseFolders.filter((folder) => folder.systemType !== "all");
  const normalizedBaseFolders = [normalizedAllFolder, ...foldersWithoutApiAll];

  const includePersonalAndChannels =
    showSystemFolders && baseFolders.some((folder) => folder.id !== SYSTEM_ALL_FOLDER_ID);
  if (!includePersonalAndChannels) {
    return normalizedBaseFolders;
  }

  const allFolderIndex = normalizedBaseFolders.findIndex((folder) => folder.systemType === "all");
  const insertIndex = allFolderIndex + 1;
  return [
    ...normalizedBaseFolders.slice(0, insertIndex),
    createPersonalFolder(labels),
    createChannelsFolder(labels),
    ...normalizedBaseFolders.slice(insertIndex),
  ];
}

/**
 * Maps sidebar/rail folder id to Workspace API folder uuid for `GET /folders/{uuid}/items/`.
 * Synthetic `system:all` and legacy `all` resolve to `allFolderApiUuid`; personal/channels have no items endpoint.
 */
export function resolveFolderItemsRequestUuid(
  folderId: string,
  allFolderApiUuid: string | null,
): string | null {
  const trimmed = folderId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed === SYSTEM_PERSONAL_FOLDER_ID || trimmed === SYSTEM_CHANNELS_FOLDER_ID) {
    return null;
  }

  if (trimmed === SYSTEM_ALL_FOLDER_ID || trimmed === "all") {
    const apiUuid = allFolderApiUuid?.trim();
    return apiUuid != null && apiUuid.length > 0 ? apiUuid : null;
  }

  return trimmed;
}

/**
 * Maps sidebar folder scope (rail id) to Workspace API folder uuid for pin/unpin and folder items.
 * Falls back to legacy rail id `all` when API uuid is not hydrated yet.
 */
export function resolvePinScopeFolderUuid(
  scopeFolderId: string,
  allFolderApiUuid: string | null = null,
): string | null {
  const resolved = resolveFolderItemsRequestUuid(scopeFolderId, allFolderApiUuid);
  if (resolved != null) {
    return resolved;
  }
  return scopeFolderId.trim() === "all" ? (allFolderApiUuid ?? "all") : null;
}

/** Backend uuid for the Workspace folder with `system_type === "all"` (not the synthetic `system:all` rail id). */
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
  // Если выбранная папка исчезла — безопасно откатываемся на первую доступную.
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
  // items загружаем только для created-папок; системные строятся без folder items.
  if (folders.length === 0) return false;
  if (!hasFolderId(folders, selectedFolderId)) return false;
  const selectedFolderType = resolveSelectedFolderSystemType(folders, selectedFolderId);
  return selectedFolderType === "created";
}

/** True until folder items for the selected created folder are present in the local cache map (in-flight selectFolder / first hydrate). */
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
  // Оставляем только живые папки; при ошибке конкретной папки сохраняем stale-данные.
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

  aliasAllFolderItemsCacheKeys(next, resolveAllFolderApiUuid(snapshot.folders));

  return next;
}

/** Mirrors API «all» folder items under rail id `system:all` and legacy `all` for pin/cache lookups. */
export function aliasAllFolderItemsCacheKeys(
  itemsByFolderId: Map<string, FolderItemForClient[]>,
  allFolderApiUuid: string | null,
): void {
  const apiUuid = allFolderApiUuid?.trim();
  if (apiUuid == null || apiUuid.length === 0) {
    return;
  }
  const items = itemsByFolderId.get(apiUuid);
  if (items == null) {
    return;
  }
  itemsByFolderId.set(SYSTEM_ALL_FOLDER_ID, items);
  itemsByFolderId.set("all", items);
}
