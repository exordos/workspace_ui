/**
 * Публичная модель папки для виджета FolderRail.
 * Используется как внешний контракт компонента и в интеграциях layout/sidebar.
 */
export interface FolderRailFolder {
  /** Стабильный идентификатор папки (приходит из API и используется как React key). */
  id: string;
  /** Отображаемое имя папки в rail и в quick-list. */
  label: string;
  /** Цвет папки в числовом формате (0xRRGGBB), который конвертируется в CSS-цвет. */
  backgroundColor: number;
  /** Необязательный счетчик непрочитанного/активности для бейджа. */
  badge?: number;
  /**
   * Тип системной папки.
   * Если поле отсутствует, тип может быть выведен по позиции (первый элемент считается "all").
   */
  systemType?: "created" | "all" | "personal" | "channels";
}

/**
 * Режим отображения rail.
 * `vertical` и `horizontal` имеют разные UX-сценарии и разную внутреннюю реализацию.
 */
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
  onOrderPinning?: (id: string) => void;
  /** External layout toggle; if not provided, settings store is used. */
  onToggleLayout?: () => void;
  /** Signal that folders list changed (create/rename/delete). Use `created` / `deletedFolderId` to skip full refresh. */
  onFoldersChanged?: (detail?: FolderRailFoldersChangedDetail) => void;
  /** Current rail layout mode. */
  layout?: FolderRailLayout;
}
