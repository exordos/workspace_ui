import type { FolderRailFolder } from "./folder-rail.types";
import type { IndexedFolderEntry } from "./folder-rail.lib";

/** Пропсы vertical-представления; state/CRUD остаются в контейнере `FolderRail`. */
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
