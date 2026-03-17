interface FolderLike {
  id: string;
  systemType?: "created" | "all" | "personal" | "channels";
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
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  if (!selectedFolder) {
    return null;
  }
  return resolveFolderSystemType(folders, selectedFolder);
}

export function resolveSelectedFolderId(
  folders: readonly FolderLike[],
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
  folders: readonly FolderLike[],
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
