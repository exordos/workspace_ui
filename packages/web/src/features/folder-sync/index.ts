// Публичный контракт среза folder-sync: только то, что можно импортировать извне.
export { useFolderSyncStore } from "./folder-sync.model";
export type { FolderRefreshReason } from "./folder-sync.model";
export { selectSidebarChatsLoading } from "./folder-sync.selectors";
export {
  hasMatchingChatId,
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  type FolderSyncSystemLabels,
} from "./folder-sync.lib";
