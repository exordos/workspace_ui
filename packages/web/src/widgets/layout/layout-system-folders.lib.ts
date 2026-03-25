import type { WorkspaceFolderForRail } from "~/shared/api/workspace-client";

export interface LayoutSystemFolderLabels {
  allChats: string;
  personal: string;
  channels: string;
}

export const SYSTEM_ALL_FOLDER_ID = "system:all";
export const SYSTEM_PERSONAL_FOLDER_ID = "system:personal";
export const SYSTEM_CHANNELS_FOLDER_ID = "system:channels";

function createSyntheticAllFolder(labels: LayoutSystemFolderLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_ALL_FOLDER_ID,
    label: labels.allChats,
    backgroundColor: 0,
    systemType: "all",
  };
}

function createPersonalFolder(labels: LayoutSystemFolderLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_PERSONAL_FOLDER_ID,
    label: labels.personal,
    backgroundColor: 0,
    systemType: "personal",
  };
}

function createChannelsFolder(labels: LayoutSystemFolderLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_CHANNELS_FOLDER_ID,
    label: labels.channels,
    backgroundColor: 0,
    systemType: "channels",
  };
}

function isPersonalOrChannelsSystemFolder(folder: WorkspaceFolderForRail): boolean {
  return (
    folder.id === SYSTEM_PERSONAL_FOLDER_ID ||
    folder.id === SYSTEM_CHANNELS_FOLDER_ID ||
    folder.systemType === "personal" ||
    folder.systemType === "channels"
  );
}

export function withDefaultSystemFolders(
  folders: readonly WorkspaceFolderForRail[],
  labels: LayoutSystemFolderLabels,
  showSystemFolders = false,
): WorkspaceFolderForRail[] {
  const baseFolders = folders.filter((folder) => !isPersonalOrChannelsSystemFolder(folder));
  const preferredAllFolder =
    baseFolders.find(
      (folder) => folder.systemType === "all" && folder.id !== SYSTEM_ALL_FOLDER_ID,
    ) ?? baseFolders.find((folder) => folder.systemType === "all");

  const normalizedAllFolder =
    preferredAllFolder != null && preferredAllFolder.id !== SYSTEM_ALL_FOLDER_ID
      ? preferredAllFolder
      : createSyntheticAllFolder(labels);

  const normalizedBaseFolders =
    preferredAllFolder == null
      ? [normalizedAllFolder, ...baseFolders]
      : baseFolders
          .filter((folder) => folder.systemType !== "all" || folder === preferredAllFolder)
          .map((folder) => (folder === preferredAllFolder ? normalizedAllFolder : folder));

  const includePersonalAndChannels =
    showSystemFolders && baseFolders.some((folder) => folder.id !== SYSTEM_ALL_FOLDER_ID);
  if (!includePersonalAndChannels) {
    return normalizedBaseFolders;
  }

  const allFolderIndex = normalizedBaseFolders.findIndex((folder) => folder.systemType === "all");
  const insertIndex = allFolderIndex + 1;

  return [
    ...normalizedBaseFolders.slice(0, insertIndex),
    createPersonalFolder(labels),
    createChannelsFolder(labels),
    ...normalizedBaseFolders.slice(insertIndex),
  ];
}
