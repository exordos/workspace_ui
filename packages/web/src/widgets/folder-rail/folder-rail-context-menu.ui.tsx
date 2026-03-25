import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React from "react";
import { t } from "~/i18n";
import { Icon } from "~/shared/ui";
import type { FolderRailLayout } from "./folder-rail.types";

const MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none data-[highlighted]:bg-accent/20 data-[disabled]:cursor-default data-[disabled]:opacity-40";
const DELETE_MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-notice-base outline-none data-[highlighted]:bg-notice-base/10 data-[highlighted]:text-notice-base data-[disabled]:cursor-default data-[disabled]:opacity-40";

/** Унифицированный контент меню папки для двух layout-режимов. */
interface FolderContextMenuContentProps {
  /** Для системных папок отключаем destructive-операции (rename/delete). */
  isSystemFolder: boolean;
  /** Нужен, чтобы показать корректный текст переключения layout. */
  layout: FolderRailLayout;
  onRename: () => void;
  onToggleLayout: () => void;
  onDelete: () => void;
}

export const FolderContextMenuContent: React.FC<FolderContextMenuContentProps> = React.memo(
  function FolderContextMenuContent({
    isSystemFolder,
    layout,
    onRename,
    onToggleLayout,
    onDelete,
  }) {
    // Текст пункта всегда предлагает противоположный текущему режим.
    const toggleLayoutLabel =
      layout === "horizontal" ? t("folder.displayVertical") : t("folder.displayHorizontal");

    return (
      <DropdownMenu.Content
        className="z-dropdown min-w-[160px] rounded-lg border border-border-subtle bg-bg-elevated py-1 shadow-lg"
        sideOffset={4}
        align="start"
      >
        <DropdownMenu.Item
          className={MENU_ITEM_CLASS}
          onSelect={onRename}
          disabled={isSystemFolder}
        >
          <Icon name="folder" size={14} />
          {t("folder.rename")}
        </DropdownMenu.Item>
        <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={onToggleLayout}>
          <Icon name="folders" size={14} />
          {toggleLayoutLabel}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className={DELETE_MENU_ITEM_CLASS}
          onSelect={onDelete}
          disabled={isSystemFolder}
        >
          <Icon name="close" size={14} className="text-current" />
          {t("folder.delete")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    );
  },
);
