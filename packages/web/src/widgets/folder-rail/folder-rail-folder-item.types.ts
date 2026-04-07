import type { FolderRailFolder, FolderRailLayout } from "./folder-rail.types";

export interface FolderRailFolderItemProps {
  folder: FolderRailFolder;
  index: number;
  layout: FolderRailLayout;
  isSelected: boolean;
  onSelectFolder: (id: string) => void;
  onToggleLayout: () => void;
  onRequestRename: (folder: FolderRailFolder) => void;
  onRequestDelete: (folder: FolderRailFolder) => void;
}
