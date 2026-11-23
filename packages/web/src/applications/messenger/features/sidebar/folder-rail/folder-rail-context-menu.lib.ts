import { t } from "~/i18n/i18n";
import type { DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import type { FolderContextMenuContentProps } from "./folder-rail-context-menu.types";

export function buildFolderContextMenuItems({
  isSystemFolder,
  layout,
  showSystemFolders,
  onRename,
  onToggleLayout,
  onToggleShowSystemFolders,
  onDelete,
}: FolderContextMenuContentProps): DropdownMenuItem[] {
  const toggleLayoutLabel =
    layout === "horizontal" ? t("folder.displayVertical") : t("folder.displayHorizontal");
  const toggleSystemFoldersLabel = showSystemFolders
    ? t("folder.hideSystemFolders")
    : t("folder.showSystemFolders");

  return [
    {
      type: "action",
      key: "rename",
      icon: "folder",
      label: t("folder.rename"),
      onSelect: onRename,
      disabled: isSystemFolder,
    },
    {
      type: "action",
      key: "toggle-layout",
      icon: "folders",
      label: toggleLayoutLabel,
      onSelect: onToggleLayout,
    },
    {
      type: "action",
      key: "toggle-system-folders",
      icon: "folder",
      label: toggleSystemFoldersLabel,
      onSelect: onToggleShowSystemFolders,
    },
    {
      type: "action",
      key: "delete",
      icon: "close",
      label: t("folder.delete"),
      onSelect: onDelete,
      disabled: isSystemFolder,
      danger: true,
    },
  ];
}
