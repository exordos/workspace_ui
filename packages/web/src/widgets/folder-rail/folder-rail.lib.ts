import { buildFolderItemVisualState } from "./folder-rail-visual.lib";
import type { FolderRailFolder } from "./folder-rail.types";
import type { CSSProperties, KeyboardEvent } from "react";

/** Глобальный shortcut открытия quick-list папок. */
export const FOLDER_QUICK_LIST_SHORTCUT = "mod+shift+f";

/** Связка "папка + ее индекс", чтобы не терять порядок при вычислениях. */
export interface IndexedFolderEntry {
  folder: FolderRailFolder;
  index: number;
}

/**
 * Порядок отображения rail: папка «Все» (или legacy-первый слот) всегда первая,
 * остальные — в исходном относительном порядке. Совпадает с vertical rail и
 * применяется в horizontal, чтобы оба режима совпадали.
 */
export function orderedIndexedFoldersForRail(
  indexedFolders: readonly IndexedFolderEntry[],
): IndexedFolderEntry[] {
  if (indexedFolders.length === 0) {
    return [];
  }
  const allFolderEntry =
    indexedFolders.find(
      ({ folder, index }) =>
        folder.systemType === "all" || (folder.systemType == null && index === 0),
    ) ??
    indexedFolders[0] ??
    null;
  if (allFolderEntry == null) {
    return [...indexedFolders];
  }
  const rest = indexedFolders.filter(({ folder }) => folder.id !== allFolderEntry.folder.id);
  return [allFolderEntry, ...rest];
}

/**
 * Единая проверка клавиш вызова контекстного меню:
 * - отдельная клавиша ContextMenu;
 * - Shift+F10 как стандартный fallback для accessibility.
 */
export function isContextMenuKeyboardTrigger(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

/**
 * Нормализует тип папки.
 * Нужен для обратной совместимости, когда API не прислал `systemType`:
 * первый элемент считаем системной папкой "all".
 */
export function resolveFolderSystemType(
  folder: FolderRailFolder,
  index: number,
): NonNullable<FolderRailFolder["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return index === 0 ? "all" : "created";
}

/**
 * Производное визуальное состояние папки.
 * Содержит уже готовые цвета/классы, чтобы UI-компоненты были "тонкими"
 * и не дублировали ветвления по типу папки, hover и selected.
 */
export interface FolderItemVisualState {
  /** true для `all/personal/channels`; влияет на доступность rename/delete и цветовую схему. */
  isSystemFolder: boolean;
  /** HEX-цвет папки, рассчитанный из числового значения. */
  folderColor: string;
  /** Имя иконки, которую нужно отрисовать в зависимости от типа/состояния папки. */
  iconName: "folders" | "profile" | "channels" | "folder_open" | "folder";
  /** Tailwind-класс цвета иконки. */
  iconTextColor: string;
  /** Tailwind-класс цвета подписи папки. */
  labelTextColor: string;
  /** Inline-стили иконки (используются только для пользовательских папок). */
  iconColorStyle: CSSProperties | undefined;
  /** Inline-стили подписи (используются для пользовательских папок в активном/hover-состоянии). */
  labelColorStyle: CSSProperties | undefined;
  /** Подсветка поверхности кнопки папки (мягкий фон + border) для пользовательских папок. */
  folderSurfaceStyle: CSSProperties | undefined;
  /** Флаг, что подпись должна окрашиваться в пользовательский цвет. */
  labelUsesCustomColor: boolean;
  /** Флаг, что подпись должна использовать accent-цвет системных папок. */
  labelUsesAccent: boolean;
}

/**
 * Центральный вычислитель визуального состояния FolderItem.
 * Благодаря этому и horizontal, и vertical item используют одинаковые правила цвета/иконки.
 */
export function getFolderItemVisualState({
  folder,
  index,
  isSelected,
  isHovered,
}: {
  folder: FolderRailFolder;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
}): FolderItemVisualState {
  return buildFolderItemVisualState({ folder, index, isSelected, isHovered });
}
