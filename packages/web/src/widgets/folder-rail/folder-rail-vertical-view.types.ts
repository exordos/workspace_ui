import type { IndexedFolderEntry } from "./folder-rail.lib";
import type { FolderRailFolder } from "./folder-rail.types";

/** Vertical view props; state/CRUD stays in `FolderRail`. */
export interface FolderRailVerticalViewProps {
  indexedFolders: IndexedFolderEntry[];
  selectedFolderId: string;
  showSystemFolders: boolean;
  onSelectFolder: (id: string) => void;
  onToggleLayout: () => void;
  onToggleShowSystemFolders: () => void;
  onRequestRename: (folder: FolderRailFolder) => void;
  onRequestDelete: (folder: FolderRailFolder) => void;
  onOpenCreateDialog: () => void;
}
