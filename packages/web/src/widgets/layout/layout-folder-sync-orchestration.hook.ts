/**
 * Folder-sync side effects used by Layout: pin mirror, sidebar projection,
 * bootstrap, derived system-folder labels, and polling.
 */
import { useEffect, useRef } from "react";
import type { FolderSyncSystemLabels } from "~/features/folder-sync/folder-sync.lib";
import { describeFolderChatIdsForLog } from "~/features/folder-sync/folder-sync.lib";
import type { FolderRefreshReason } from "~/features/folder-sync/folder-sync.model";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { t } from "~/i18n/i18n";
import type { FolderItemForClient } from "~/shared/api/workspace-client";
import { FOLDER_SYNC_POLL_INTERVAL_MS } from "~/shared/config/constants";
import { createLogger } from "~/shared/lib/logger";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { startFolderPolling } from "./layout-folder-polling.lib";
import { shouldBootstrapFolderSyncForLayout } from "./layout-folder-sync-bootstrap.lib";
import { useLayoutPinFolderItemsSync } from "./layout-pin-folder-items-sync.hook";

const layoutFolderSyncLog = createLogger("layout:folderSync");

function getFolderSyncLabelsFromI18n(): FolderSyncSystemLabels {
  return {
    allChats: t("folder.allChats"),
    personal: t("folder.personal"),
    channels: t("folder.channels"),
  };
}

export interface UseLayoutFolderSyncOrchestrationParams {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "degraded" | "blocked";
  showSystemFolders: boolean;
  language: string;
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
  chatsSortedByLastMessage: SidebarChat[];
  streamsMap: Map<string, StreamEntryInternal>;
  dmsMapSize: number;
  usersMapForChatInfo: Map<string, { full_name?: string; email?: string }>;
  currentUserId: UserId | null;
  selectedFolderId: string;
  selectedFolderChatIds: ReadonlySet<string> | null;
  bootstrapFolderSync: (options: {
    instanceId: string;
    showSystemFolders: boolean;
    labels: FolderSyncSystemLabels;
  }) => Promise<void>;
  syncFolderSyncSidebarProjection: (input: {
    chatsSortedByLastMessage: SidebarChat[];
    streamsMap: Map<string, StreamEntryInternal>;
    usersMapForChatInfo: Map<string, { full_name?: string; email?: string }>;
    currentUserId: UserId | null;
    hideUnknownArchivedStreams: boolean;
    isStreamMuted?: (streamId: string) => boolean;
  }) => void;
  hideUnknownArchivedStreams: boolean;
  isStreamMuted?: (streamId: string) => boolean;
  syncFolderSyncDerived: (showSystemFolders: boolean, labels: FolderSyncSystemLabels) => void;
  refreshFolderSync: (reason: FolderRefreshReason) => Promise<void>;
  online: boolean;
}

export function useLayoutFolderSyncOrchestration(
  params: UseLayoutFolderSyncOrchestrationParams,
): void {
  const {
    currentInstanceId,
    currentUserStatus,
    showSystemFolders,
    language,
    folderItemsByFolderId,
    chatsSortedByLastMessage,
    streamsMap,
    dmsMapSize,
    usersMapForChatInfo,
    currentUserId,
    hideUnknownArchivedStreams,
    isStreamMuted,
    selectedFolderId,
    selectedFolderChatIds,
    bootstrapFolderSync,
    syncFolderSyncSidebarProjection,
    syncFolderSyncDerived,
    refreshFolderSync,
    online,
  } = params;

  const folderSyncConfigRef = useRef({
    showSystemFolders,
    labels: getFolderSyncLabelsFromI18n(),
  });
  const bootstrapRequestedInstanceRef = useRef<string | null>(null);

  useEffect(() => {
    folderSyncConfigRef.current = {
      showSystemFolders,
      labels: getFolderSyncLabelsFromI18n(),
    };
  }, [showSystemFolders, language]);

  useLayoutPinFolderItemsSync(folderItemsByFolderId);

  useEffect(() => {
    layoutFolderSyncLog.debug("sidebarProjectionEffect", {
      chatsSortedLength: chatsSortedByLastMessage.length,
      streamsMapSize: streamsMap.size,
      dmsMapSize,
      selectedFolderId,
      selectedFolderChatIds: describeFolderChatIdsForLog(selectedFolderChatIds),
    });
    syncFolderSyncSidebarProjection({
      chatsSortedByLastMessage,
      streamsMap,
      usersMapForChatInfo,
      currentUserId,
      hideUnknownArchivedStreams,
      isStreamMuted,
    });
  }, [
    chatsSortedByLastMessage,
    currentUserId,
    hideUnknownArchivedStreams,
    isStreamMuted,
    folderItemsByFolderId,
    dmsMapSize,
    selectedFolderChatIds,
    selectedFolderId,
    streamsMap,
    syncFolderSyncSidebarProjection,
    usersMapForChatInfo,
  ]);

  useEffect(() => {
    if (currentInstanceId == null) {
      bootstrapRequestedInstanceRef.current = null;
      return;
    }
    if (bootstrapRequestedInstanceRef.current === currentInstanceId) {
      return;
    }
    if (
      !shouldBootstrapFolderSyncForLayout({
        folderSyncInstanceId: useFolderSyncStore.getState().instanceId,
        currentInstanceId,
        currentUserStatus,
      })
    ) {
      return;
    }
    const { showSystemFolders: showSys, labels } = folderSyncConfigRef.current;
    bootstrapRequestedInstanceRef.current = currentInstanceId;
    void bootstrapFolderSync({
      instanceId: currentInstanceId,
      showSystemFolders: showSys,
      labels,
    }).then(
      () => {
        if (bootstrapRequestedInstanceRef.current === currentInstanceId) {
          bootstrapRequestedInstanceRef.current = null;
        }
      },
      () => {
        if (bootstrapRequestedInstanceRef.current === currentInstanceId) {
          bootstrapRequestedInstanceRef.current = null;
        }
        layoutFolderSyncLog.warn("bootstrapEffect:failed", { currentInstanceId });
      },
    );
  }, [currentInstanceId, currentUserStatus, bootstrapFolderSync]);

  useEffect(() => {
    syncFolderSyncDerived(showSystemFolders, getFolderSyncLabelsFromI18n());
  }, [language, showSystemFolders, syncFolderSyncDerived]);

  useEffect(() => {
    return startFolderPolling({
      enabled:
        currentInstanceId != null &&
        (currentUserStatus === "ready" || currentUserStatus === "degraded") &&
        online,
      pollIntervalMs: FOLDER_SYNC_POLL_INTERVAL_MS,
      refreshFolders: () => refreshFolderSync("polling"),
      runImmediately: false,
    });
  }, [currentInstanceId, currentUserStatus, online, refreshFolderSync]);
}
