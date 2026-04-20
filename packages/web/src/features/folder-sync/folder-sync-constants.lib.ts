export const SYSTEM_ALL_FOLDER_ID = "system:all";
export const SYSTEM_PERSONAL_FOLDER_ID = "system:personal";
export const SYSTEM_CHANNELS_FOLDER_ID = "system:channels";

export function isSystemRailFolderId(folderId: string): boolean {
  return (
    folderId === SYSTEM_ALL_FOLDER_ID ||
    folderId === SYSTEM_PERSONAL_FOLDER_ID ||
    folderId === SYSTEM_CHANNELS_FOLDER_ID
  );
}
