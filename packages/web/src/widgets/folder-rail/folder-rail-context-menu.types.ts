import type { FolderRailLayout } from "./folder-rail.types";

/** Унифицированный контент меню папки для двух layout-режимов. */
export interface FolderContextMenuContentProps {
  /** Флаг именно текущей папки в открытом меню: для системных item отключаем rename/delete. */
  isSystemFolder: boolean;
  /** Нужен, чтобы показать корректный текст переключения layout. */
  layout: FolderRailLayout;
  /** Глобальная настройка показа системных папок в rail (Show/Hide).
   * Не дублирует `isSystemFolder`: это другой уровень состояния (весь список, а не текущий item).*/
  showSystemFolders: boolean;
  onRename: () => void;
  onToggleLayout: () => void;
  onToggleShowSystemFolders: () => void;
  onDelete: () => void;
}
