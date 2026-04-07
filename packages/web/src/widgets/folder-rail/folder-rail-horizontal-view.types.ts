import type { FolderRailFolder } from "./folder-rail.types";
import type { IndexedFolderEntry } from "./folder-rail.lib";

/** Пропсы только для horizontal-представления; бизнес-логика остается в контейнере `FolderRail`. */
export interface FolderRailHorizontalViewProps {
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
