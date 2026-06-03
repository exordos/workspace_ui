import type { IndexedFolderEntry } from "./folder-rail.lib";

/** Quick list for switching among many folders. */
export interface FolderQuickListProps {
  folders: IndexedFolderEntry[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
}
