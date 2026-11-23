import { resolveFolderSystemType } from "./folder-rail.lib";
import type { FolderItemVisualState } from "./folder-rail.lib";
import type { FolderRailFolder } from "./folder-rail.types";

export function resolveQuickListFolderIconName(
  systemType: ReturnType<typeof resolveFolderSystemType>,
): FolderItemVisualState["iconName"] {
  if (systemType === "all") {
    return "folders";
  }
  if (systemType === "personal") {
    return "profile";
  }
  if (systemType === "channels") {
    return "channels";
  }
  return "folder";
}

export function resolveQuickListItemClassName(isActive: boolean, isSelected: boolean): string {
  if (isActive) {
    return "bg-accent/20";
  }
  if (isSelected) {
    return "bg-accent/10";
  }
  return "hover:bg-sidebar-hover";
}

export function resolveQuickListSystemType(
  folder: FolderRailFolder,
  index: number,
): ReturnType<typeof resolveFolderSystemType> {
  return resolveFolderSystemType(folder, index);
}
