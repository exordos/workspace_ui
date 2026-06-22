import { buildFolderItemVisualState } from "./folder-rail-visual.lib";
import type { FolderRailFolder } from "./folder-rail.types";
import type { CSSProperties, KeyboardEvent } from "react";

/** Global shortcut to open the folder quick-list. */
export const FOLDER_QUICK_LIST_SHORTCUT = "mod+shift+f";

/** Folder plus index — preserves order in derived computations. */
export interface IndexedFolderEntry {
  folder: FolderRailFolder;
  index: number;
}

/** Rail display order is owned by the server. */
export function orderedIndexedFoldersForRail(
  indexedFolders: readonly IndexedFolderEntry[],
): IndexedFolderEntry[] {
  return [...indexedFolders];
}

/** Context menu keyboard trigger: ContextMenu key or Shift+F10. */
export function isContextMenuKeyboardTrigger(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

/** Normalize folder system type from server metadata only. */
export function resolveFolderSystemType(
  folder: FolderRailFolder,
  _index: number,
): NonNullable<FolderRailFolder["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return "created";
}

/** Derived folder visuals — thin UI components consume ready-made colors/classes. */
export interface FolderItemVisualState {
  /** System folder (all/personal/channels) — affects rename/delete and color scheme. */
  isSystemFolder: boolean;
  /** Folder color as CSS hex from numeric value. */
  folderColor: string;
  /** Icon name for folder type/state. */
  iconName: "folders" | "profile" | "channels" | "folder_open" | "folder";
  /** Tailwind icon color class. */
  iconTextColor: string;
  /** Tailwind label color class. */
  labelTextColor: string;
  /** Inline icon styles (user folders only). */
  iconColorStyle: CSSProperties | undefined;
  /** Inline label styles (user folders, active/hover). */
  labelColorStyle: CSSProperties | undefined;
  /** Folder button surface highlight (user folders). */
  folderSurfaceStyle: CSSProperties | undefined;
  /** Label uses custom folder color. */
  labelUsesCustomColor: boolean;
  /** Label uses system-folder accent color. */
  labelUsesAccent: boolean;
}

/** Shared visual state for horizontal and vertical folder items. */
export function getFolderItemVisualState({
  folder,
  index,
  isSelected,
  isHovered,
}: {
  folder: FolderRailFolder;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
}): FolderItemVisualState {
  return buildFolderItemVisualState({ folder, index, isSelected, isHovered });
}
