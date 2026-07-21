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

/**
 * Rail display order: "All" (or legacy first slot) first, rest in relative order.
 * Shared by vertical and horizontal rail modes.
 */
export function orderedIndexedFoldersForRail(
  indexedFolders: readonly IndexedFolderEntry[],
): IndexedFolderEntry[] {
  if (indexedFolders.length === 0) {
    return [];
  }
  const allFolderEntry =
    indexedFolders.find(
      ({ folder, index }) =>
        folder.systemType === "all" || (folder.systemType == null && index === 0),
    ) ??
    indexedFolders[0] ??
    null;
  if (allFolderEntry == null) {
    return [...indexedFolders];
  }
  const rest = indexedFolders.filter(({ folder }) => folder.id !== allFolderEntry.folder.id);
  return [allFolderEntry, ...rest];
}

/** Context menu keyboard trigger: ContextMenu key or Shift+F10. */
export function isContextMenuKeyboardTrigger(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

/**
 * Normalize folder system type.
 * When API omits systemType, treat index 0 as "all" for backward compatibility.
 */
export function resolveFolderSystemType(
  folder: FolderRailFolder,
  index: number,
): NonNullable<FolderRailFolder["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return index === 0 ? "all" : "created";
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
  /** Folder button surface highlight (custom folders — colored inline styles). */
  folderSurfaceStyle: CSSProperties | undefined;
  /**
   * Folder button surface highlight (system folders — semantic Tailwind classes).
   * Same hover/selected affordance as custom folders, but without folder color.
   */
  folderSurfaceClassName: string | undefined;
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
