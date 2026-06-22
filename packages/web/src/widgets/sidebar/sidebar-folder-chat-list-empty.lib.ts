import { t } from "~/i18n/i18n";
import type { IconName } from "~/shared/ui/icon";

export interface SidebarFolderEmptyStatePresentation {
  title: string;
  hint: string;
  icon: IconName;
}

export function resolveSidebarFolderEmptyStatePresentation(
  _selectedFolderId: string | null | undefined,
): SidebarFolderEmptyStatePresentation {
  return {
    title: t("folder.emptyFolder"),
    hint: t("folder.emptyFolderHint"),
    icon: "folder",
  };
}
