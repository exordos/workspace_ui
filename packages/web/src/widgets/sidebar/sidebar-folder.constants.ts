export const SIDEBAR_SYSTEM_ALL_FOLDER_ID = "system:all";
export const SIDEBAR_SYSTEM_PERSONAL_FOLDER_ID = "system:personal";
export const SIDEBAR_SYSTEM_CHANNELS_FOLDER_ID = "system:channels";

export function isSidebarSystemFolderId(folderId: string): boolean {
  return (
    folderId === SIDEBAR_SYSTEM_ALL_FOLDER_ID ||
    folderId === SIDEBAR_SYSTEM_PERSONAL_FOLDER_ID ||
    folderId === SIDEBAR_SYSTEM_CHANNELS_FOLDER_ID
  );
}
