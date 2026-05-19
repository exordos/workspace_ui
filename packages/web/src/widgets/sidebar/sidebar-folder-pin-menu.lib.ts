import { useCallback, useMemo } from "react";
import { resolvePinScopeFolderUuid } from "~/features/folder-sync/folder-sync.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { resolveFolderItemUuidForMenu, runFolderPinToggle } from "~/features/pin-chat/pin-chat.lib";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";

function isVirtualSystemFolderId(folderId: string | undefined): boolean {
  return folderId === "system:personal" || folderId === "system:channels";
}

/** Pin scope + handlers shared by stream/DM sidebar context menus. */
export function useSidebarFolderPinMenu(folderId: string | undefined, chatId: string) {
  const allFolderApiUuid = useFolderSyncStore((s) => s.allFolderApiUuid);
  const pinApiFolderUuid = useMemo(
    () => (folderId != null ? resolvePinScopeFolderUuid(folderId, allFolderApiUuid) : null),
    [allFolderApiUuid, folderId],
  );
  const isPinnedInFolder = usePinStore((s) =>
    pinApiFolderUuid != null ? s.isPinned(pinApiFolderUuid, chatId) : false,
  );
  const isPinned = pinApiFolderUuid != null && isPinnedInFolder;
  const showFolderPinAction =
    folderId != null &&
    folderId.length > 0 &&
    !isVirtualSystemFolderId(folderId) &&
    pinApiFolderUuid != null;

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
