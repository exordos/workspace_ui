import React, { useMemo } from "react";
import { canManageMailFolder } from "~/entities/mail/mail-folder-guard.lib";
import { t } from "~/i18n/i18n";
import { DropdownMenu, type DropdownMenuItem } from "~/shared/ui/dropdown-menu";
import type { MailFolderContextMenuProps } from "./mail-folder-actions.types";

export const MailFolderContextMenu: React.FC<MailFolderContextMenuProps> = ({
  folder,
  delimiter,
  open,
  onOpenChange,
  onAction,
  trigger,
}) => {
  const manageable = canManageMailFolder(folder.path, delimiter);

  const items = useMemo<readonly DropdownMenuItem[]>(() => {
    const menu: DropdownMenuItem[] = [];
    if (manageable) {
      menu.push(
        {
          type: "action",
          label: t("mail.folderActions.rename"),
          icon: "pen",
          onSelect: () => onAction("rename"),
        },
        {
          type: "action",
          label: t("mail.folderActions.move"),
          icon: "folder",
          onSelect: () => onAction("move"),
        },
        { type: "separator" },
      );
    }
    menu.push(
      {
        type: "action",
        label: t("mail.folderActions.markAllRead"),
        icon: "check",
        onSelect: () => onAction("markAllRead"),
      },
      {
        type: "action",
        label: t("mail.folderActions.clear"),
        icon: "delete",
        danger: true,
        onSelect: () => onAction("clear"),
      },
    );
    if (manageable) {
      menu.push(
        { type: "separator" },
        {
          type: "action",
          label: t("mail.folderActions.delete"),
          icon: "delete",
          danger: true,
          onSelect: () => onAction("delete"),
        },
      );
    }
    return menu;
  }, [manageable, onAction]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      trigger={trigger}
      contentVariant="narrow"
    />
  );
};
