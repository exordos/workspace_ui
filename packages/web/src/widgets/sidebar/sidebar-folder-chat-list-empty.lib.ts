import {
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "~/features/folder-sync/folder-sync-constants.lib";
import { t } from "~/i18n/i18n";
import type { IconName } from "~/shared/ui/icon";
import { isSidebarSystemFolderScope } from "./sidebar.lib";

export interface SidebarFolderEmptyStatePresentation {
  title: string;
  hint: string;
  icon: IconName;
}

export function resolveSidebarFolderEmptyStatePresentation(
  selectedFolderId: string | null | undefined,
): SidebarFolderEmptyStatePresentation {
  const folderKey = selectedFolderId ?? "";
  if (!isSidebarSystemFolderScope(folderKey)) {
    return {
      title: t("folder.emptyFolder"),
      hint: t("folder.emptyFolderHint"),
      icon: "folder",
    };
  }
  if (folderKey === SYSTEM_PERSONAL_FOLDER_ID) {
    return {
      title: t("sidebar.emptyPersonalChats"),
      hint: t("sidebar.emptyPersonalChatsHint"),
      icon: "mail_outline",
    };
  }
  if (folderKey === SYSTEM_CHANNELS_FOLDER_ID) {
    return {
      title: t("sidebar.emptyChannelList"),
      hint: t("sidebar.emptyChannelListHint"),
      icon: "channels",
    };
  }
  return {
    title: t("sidebar.emptyAllChats"),
    hint: t("sidebar.emptyAllChatsHint"),
    icon: "grid",
  };
}
