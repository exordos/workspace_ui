import type { FolderRailFolder } from "./folder-rail.types";

/** Общий контракт для horizontal/vertical item. */
export interface FolderItemProps {
  folder: FolderRailFolder;
  index: number;
  isSelected: boolean;
  showSystemFolders: boolean;
  onSelectFolder: (id: string) => void;
  onToggleLayout: () => void;
  onToggleShowSystemFolders: () => void;
  onRequestRename: (folder: FolderRailFolder) => void;
  onRequestDelete: (folder: FolderRailFolder) => void;
}

/** Аргументы общего хука интеракций папки. */
export interface UseFolderItemActionsArgs {
  folder: FolderRailFolder;
  onSelectFolder: (id: string) => void;
  onToggleLayout: () => void;
  onRequestRename: (folder: FolderRailFolder) => void;
  onRequestDelete: (folder: FolderRailFolder) => void;
}
