import type { IndexedFolderEntry } from "./folder-rail.lib";

/** Quick-list для быстрого переключения между большим числом папок. */
export interface FolderQuickListProps {
  folders: IndexedFolderEntry[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
}
