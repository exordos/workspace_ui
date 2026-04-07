import type { LayoutFolderLike } from "./layout-folder-selection.types";

function hasFolderId(folders: readonly LayoutFolderLike[], folderId: string): boolean {
  return folders.some((folder) => folder.id === folderId);
}

function resolveFolderSystemType(
  folders: readonly LayoutFolderLike[],
  folder: LayoutFolderLike,
): NonNullable<LayoutFolderLike["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return folders[0]?.id === folder.id ? "all" : "created";
}

function resolveSelectedFolderSystemType(
  folders: readonly LayoutFolderLike[],
  selectedFolderId: string,
): NonNullable<LayoutFolderLike["systemType"]> | null {
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  if (!selectedFolder) {
    return null;
  }
  return resolveFolderSystemType(folders, selectedFolder);
}

export function resolveSelectedFolderId(
  folders: readonly LayoutFolderLike[],
  selectedFolderId: string,
): string | null {
  if (folders.length === 0) {
    return null;
  }
  if (hasFolderId(folders, selectedFolderId)) {
    return selectedFolderId;
  }
  return folders[0]?.id ?? null;
}

export function shouldLoadFolderItemsForSelection(
  folders: readonly LayoutFolderLike[],
  selectedFolderId: string,
): boolean {
  if (folders.length === 0) {
    return false;
  }
  if (!hasFolderId(folders, selectedFolderId)) {
    return false;
  }
  const selectedFolderType = resolveSelectedFolderSystemType(folders, selectedFolderId);
  return selectedFolderType === "created";
}
