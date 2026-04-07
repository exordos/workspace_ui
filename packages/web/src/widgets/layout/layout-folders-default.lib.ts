/**
 * Injects default personal/channels system folders into the workspace folder rail list.
 */
import { t } from "~/i18n/i18n";
import type { WorkspaceFolderForRail } from "~/shared/api/workspace-client";

export const SYSTEM_PERSONAL_FOLDER_ID = "system:personal";
export const SYSTEM_CHANNELS_FOLDER_ID = "system:channels";

export function withDefaultSystemFolders(folders: WorkspaceFolderForRail[]): WorkspaceFolderForRail[] {
  if (folders.length === 0) {
    return folders;
  }

  const baseFolders = folders.filter(
    (folder) =>
      folder.id !== SYSTEM_PERSONAL_FOLDER_ID &&
      folder.id !== SYSTEM_CHANNELS_FOLDER_ID &&
      folder.systemType !== "personal" &&
      folder.systemType !== "channels",
  );

  const allFolderIndex = baseFolders.findIndex((folder) => folder.systemType === "all");
  const insertAfterIndex = allFolderIndex >= 0 ? allFolderIndex : 0;
  const insertIndex = insertAfterIndex + 1;

  const personalFolder: WorkspaceFolderForRail = {
    id: SYSTEM_PERSONAL_FOLDER_ID,
    label: t("folder.personal"),
    backgroundColor: 0,
    systemType: "personal",
  };
  const channelsFolder: WorkspaceFolderForRail = {
    id: SYSTEM_CHANNELS_FOLDER_ID,
    label: t("folder.channels"),
    backgroundColor: 0,
    systemType: "channels",
  };

  return [
    ...baseFolders.slice(0, insertIndex),
    personalFolder,
    channelsFolder,
    ...baseFolders.slice(insertIndex),
  ];
}
