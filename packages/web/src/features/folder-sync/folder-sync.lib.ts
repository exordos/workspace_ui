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
  folders: readonly { uuid?: string }[];
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
    preferredAllFolder != null && preferredAllFolder.badge !== undefined
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

  return next;
}
