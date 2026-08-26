import type { MessengerFolder } from "./messenger.types";

export const MESSENGER_ALL_CHATS_FOLDER_UUID = "00000000-0000-0000-0000-000000000000";
export const MESSENGER_PERSONAL_FOLDER_UUID = "00000000-0000-0000-0000-000000000001";
export const MESSENGER_CHANNELS_FOLDER_UUID = "00000000-0000-0000-0000-000000000002";

export function resolveMessengerFolderSystemType(
  folderUuid: string,
  reportedSystemType: MessengerFolder["systemType"],
): MessengerFolder["systemType"] {
  if (folderUuid === MESSENGER_ALL_CHATS_FOLDER_UUID) return "all";
  if (folderUuid === MESSENGER_PERSONAL_FOLDER_UUID) return "personal";
  if (folderUuid === MESSENGER_CHANNELS_FOLDER_UUID) return "channels";

  // Only the fixed All UUID represents the global folder.
  return reportedSystemType === "all" ? null : reportedSystemType;
}

export function normalizeMessengerFolderSystemType(folder: MessengerFolder): MessengerFolder {
  const systemType = resolveMessengerFolderSystemType(folder.uuid, folder.systemType);
  return systemType === folder.systemType ? folder : { ...folder, systemType };
}
