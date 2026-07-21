import {
  folderColorValueToCssHex,
  folderColorValueToCssRgba,
} from "~/features/manage-folders/folder-colors";
import { resolveFolderSystemType } from "./folder-rail.lib";
import type { FolderItemVisualState } from "./folder-rail.lib";
import type { FolderRailFolder } from "./folder-rail.types";

const SYSTEM_FOLDER_ICON_NAMES = {
  all: "folders",
  personal: "profile",
  channels: "channels",
} as const satisfies Record<string, FolderItemVisualState["iconName"]>;

function resolveFolderIconName(
  systemType: ReturnType<typeof resolveFolderSystemType>,
  isSelected: boolean,
): FolderItemVisualState["iconName"] {
  if (systemType === "all") return SYSTEM_FOLDER_ICON_NAMES.all;
  if (systemType === "personal") return SYSTEM_FOLDER_ICON_NAMES.personal;
  if (systemType === "channels") return SYSTEM_FOLDER_ICON_NAMES.channels;
  return isSelected ? "folder_open" : "folder";
}

function resolveFolderIconTextColor(isCustomFolder: boolean, isSelected: boolean): string {
  if (isCustomFolder) return "text-current";
  return isSelected ? "text-text-primary" : "text-text-muted";
}

function resolveFolderLabelTextColor(
  labelUsesCustomColor: boolean,
  labelUsesAccent: boolean,
  isSelected: boolean,
): string {
  if (labelUsesCustomColor) return "text-current";
  if (labelUsesAccent) {
    return isSelected ? "text-text-primary" : "text-accent";
  }
  return isSelected ? "text-text-primary" : "text-text-muted";
}

/**
 * Neutral surface for system folders on hover only.
 * Selected folders (system and custom) stay outline-free — active icon/label/scale carry the state.
 */
function resolveSystemFolderSurfaceClassName(
  isHovered: boolean,
  isSelected: boolean,
): string | undefined {
  if (isSelected || !isHovered) return undefined;
  return "bg-sidebar-hover border-border-subtle";
}

export function buildFolderItemVisualState({
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
  const systemType = resolveFolderSystemType(folder, index);
  const isSystemFolder = systemType !== "created";
  const isCustomFolder = !isSystemFolder;
  const isInteractive = isSelected || isHovered;
  const folderColor = folderColorValueToCssHex(folder.backgroundColor);
  const labelUsesCustomColor = isCustomFolder && isInteractive;
  const labelUsesAccent = isSystemFolder && isInteractive;

  const iconColorStyle = isCustomFolder ? { color: folderColor } : undefined;
  const labelColorStyle = labelUsesCustomColor ? { color: folderColor } : undefined;
  // Custom folders: colored surface on hover only (same selected exception as system).
  const folderSurfaceStyle =
    isCustomFolder && isHovered && !isSelected
      ? {
          backgroundColor: folderColorValueToCssRgba(folder.backgroundColor, 0.1),
          borderColor: folderColorValueToCssRgba(folder.backgroundColor, 0.22),
        }
      : undefined;
  const folderSurfaceClassName = isSystemFolder
    ? resolveSystemFolderSurfaceClassName(isHovered, isSelected)
    : undefined;

  return {
    isSystemFolder,
    folderColor,
    iconName: resolveFolderIconName(systemType, isSelected),
    iconTextColor: resolveFolderIconTextColor(isCustomFolder, isSelected),
    labelTextColor: resolveFolderLabelTextColor(labelUsesCustomColor, labelUsesAccent, isSelected),
    iconColorStyle,
    labelColorStyle,
    folderSurfaceStyle,
    folderSurfaceClassName,
    labelUsesCustomColor,
    labelUsesAccent,
  };
}
