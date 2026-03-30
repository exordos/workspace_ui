import type { KeyboardEvent } from "react";

import type { FolderRailFolder } from "./folder-rail.types";

export const MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary outline-none data-[highlighted]:bg-accent/20 data-[disabled]:cursor-default data-[disabled]:opacity-40";

export const DELETE_MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-notice-base outline-none data-[highlighted]:bg-notice-base/10 data-[highlighted]:text-notice-base data-[disabled]:cursor-default data-[disabled]:opacity-40";

export const FOLDER_QUICK_LIST_THRESHOLD = 10;

export const FOLDER_QUICK_LIST_SHORTCUT = "mod+shift+f";

export function isContextMenuKeyboardTrigger(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

export function resolveFolderSystemType(
  folder: FolderRailFolder,
  index: number,
): NonNullable<FolderRailFolder["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return index === 0 ? "all" : "created";
}
