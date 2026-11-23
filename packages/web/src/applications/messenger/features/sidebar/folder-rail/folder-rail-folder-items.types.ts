import type { FolderRailFolder } from "./folder-rail.types";

/** Shared props for horizontal/vertical folder items. */
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

/** Args for shared folder item interaction hook. */
export interface UseFolderItemActionsArgs {
  folder: FolderRailFolder;
  onSelectFolder: (id: string) => void;
  onToggleLayout: () => void;
  onRequestRename: (folder: FolderRailFolder) => void;
  onRequestDelete: (folder: FolderRailFolder) => void;
}
