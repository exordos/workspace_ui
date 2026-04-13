// Контракты assignment-домена для folder-sync.
// Файл задает типы и константы для загрузки/переключения назначения чатов в папки.

// Специальный UUID-заполнитель для оптимистичного состояния checkbox/assignment.
export const OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID = "__folder_assignment_pending__";

// Строка назначения чата для меню папок: какая папка и есть ли item UUID.
export interface FolderAssignmentRow {
  folderUuid: string;
  label: string;
  itemUuid: string | null;
}

// Входные параметры операции переключения назначения чата в папку.
export interface ToggleAssignmentInput {
  chatId: string;
  folderUuid: string;
  itemUuid: string | null;
}

// Результат переключения назначения: успех, финальный item UUID и факт rollback.
export interface ToggleAssignmentResult {
  ok: boolean;
  folderUuid: string;
  nextItemUuid: string | null;
  removed: boolean;
  rolledBack: boolean;
}
