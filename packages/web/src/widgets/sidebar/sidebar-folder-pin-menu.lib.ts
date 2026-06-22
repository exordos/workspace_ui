import { useCallback, useMemo } from "react";
import { resolvePinScopeFolderUuid } from "~/features/folder-sync/folder-sync.lib";
import { resolveFolderItemUuidForMenu, runFolderPinToggle } from "~/features/pin-chat/pin-chat.lib";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";

/** Pin scope + handlers shared by stream/DM sidebar context menus. */
export function useSidebarFolderPinMenu(folderId: string | undefined, chatId: string) {
  const pinApiFolderUuid = useMemo(
    () => (folderId != null ? resolvePinScopeFolderUuid(folderId) : null),
    [folderId],
  );
  const isPinnedInFolder = usePinStore((s) =>
    pinApiFolderUuid != null ? s.isPinned(pinApiFolderUuid, chatId) : false,
  );
  const isPinned = pinApiFolderUuid != null && isPinnedInFolder;
  const showFolderPinAction = folderId != null && folderId.length > 0 && pinApiFolderUuid != null;

  const runPin = useCallback(() => {
    if (pinApiFolderUuid == null) return;
    void runFolderPinToggle({
      apiFolderUuid: pinApiFolderUuid,
      scopeFolderId: folderId,
      chatId,
      isPinned: false,
    });
  }, [chatId, folderId, pinApiFolderUuid]);

  const runUnpin = useCallback(() => {
    if (pinApiFolderUuid == null) return;
    const folderItemUuid = resolveFolderItemUuidForMenu({
      apiFolderUuid: pinApiFolderUuid,
      scopeFolderId: folderId,
      chatId,
      preferPinnedItem: true,
    });
    void runFolderPinToggle({
      apiFolderUuid: pinApiFolderUuid,
      scopeFolderId: folderId,
      chatId,
      isPinned: true,
      folderItemUuid,
    });
  }, [chatId, folderId, pinApiFolderUuid]);

  return {
    pinApiFolderUuid,
    isPinned,
    showFolderPinAction,
    runPin,
    runUnpin,
  };
}
