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
