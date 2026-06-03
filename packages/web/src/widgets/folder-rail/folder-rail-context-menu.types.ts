import type { FolderRailLayout } from "./folder-rail.types";

/** Folder context menu content shared by both layout modes. */
export interface FolderContextMenuContentProps {
  /** Current folder is system: disable rename/delete for that item. */
  isSystemFolder: boolean;
  /** Current rail layout (toggle label copy). */
  layout: FolderRailLayout;
  /** Global show/hide system folders in rail (not the same as isSystemFolder). */
  showSystemFolders: boolean;
  onRename: () => void;
  onToggleLayout: () => void;
  onToggleShowSystemFolders: () => void;
  onDelete: () => void;
}
