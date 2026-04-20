import { useEffect } from "react";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import type { FolderItemForClient } from "~/shared/api/workspace-client";

/** Mirrors folder API items into the pin store for ordering UI. */
export function useLayoutPinFolderItemsSync(
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>,
): void {
  useEffect(() => {
    const rows: {
      folderUuid: string;
      folderItemUuid: string;
      chatId: string;
      orderIndex: number;
      pinnedAt: string | null;
    }[] = [];
    for (const [folderUuid, items] of folderItemsByFolderId) {
      for (const item of items) {
        rows.push({
          folderUuid,
          folderItemUuid: item.uuid,
          chatId: item.chatId,
          orderIndex: item.orderIndex,
          pinnedAt: item.pinnedAt,
        });
      }
    }
    usePinStore.getState().setFromServer(rows);
  }, [folderItemsByFolderId]);
}
