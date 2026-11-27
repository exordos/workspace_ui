/** Public folder model for FolderRail (layout/sidebar contract). */
export interface FolderRailFolder {
  /** Stable folder id from API (React key). */
  id: string;
  /** Label shown in rail and quick-list. */
  label: string;
  /** Folder color as 0xRRGGBB, converted to CSS. */
  backgroundColor: number;
  /** Optional unread/activity badge count. */
  badge?: number;
  /** System folder type; if omitted, inferred from position (first = "all"). */
  systemType?: "created" | "all" | "personal" | "channels";
}

/** Rail layout mode (vertical and horizontal differ in UX/implementation). */
export type FolderRailLayout = "vertical" | "horizontal";

/** Passed with `onFoldersChanged` after POST /folders so the shell can patch rail without a full snapshot. */
export interface FolderRailCreatedFolderPayload {
  id: string;
  title: string;
  backgroundColor: number;
}

/** Optional detail for `onFoldersChanged` (incremental updates without full folder snapshot). */
export interface FolderRailFoldersChangedDetail {
  created?: FolderRailCreatedFolderPayload;
  deletedFolderId?: string;
}

/** Public props for `FolderRail` (stable contract for layout/sidebar). */
export interface FolderRailProps {
  /** Full list of folders in display order. */
  folders: FolderRailFolder[];
  /** Id of currently selected folder. */
  selectedFolderId: string;
  /** Folder selection handler. */
  onSelectFolder: (id: string) => void;
  /** Legacy prop kept for backward compatibility. */
  /** External layout toggle; if not provided, settings store is used. */
  onToggleLayout?: () => void;
  /** Signal that folders list changed (create/rename/delete). Use `created` / `deletedFolderId` to skip full refresh. */
  onFoldersChanged?: (detail?: FolderRailFoldersChangedDetail) => void;
  /** Current rail layout mode. */
  layout?: FolderRailLayout;
}
