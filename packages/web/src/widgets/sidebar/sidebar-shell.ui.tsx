import React, { useCallback, useMemo } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  selectMessengerSidebarActivityCounts,
  selectMessengerSidebarFolders,
  selectMessengerSidebarStreams,
  type MessengerSidebarStreamsState,
} from "~/entities/messenger/messenger-sidebar.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerSidebarStreamItem } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { FolderRail } from "~/widgets/folder-rail/folder-rail.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { WorkspaceSidebar } from "./sidebar-workspace.ui";

const EMPTY_WORKSPACE_STREAMS: MessengerSidebarStreamItem[] = [];

interface SidebarShellProps {
  sidebarStyle?: React.CSSProperties;
  sidebarResizeControl?: React.ReactNode;
  pathname?: string;
}

export const SidebarShell: React.FC<SidebarShellProps> = ({
  sidebarStyle,
  sidebarResizeControl,
  pathname = "",
}) => {
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const setSelectedFolderId = useSidebarConfigStore((s) => s.setSelectedFolderId);
  const workspaceRoute = useMemo(() => parseWorkspaceMessengerRoute(pathname), [pathname]);
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const workspaceRuntimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const currentUserUuid = workspaceRuntimeContext?.userUuid ?? null;
  const sidebarWorkspaceIdentity = useMemo(() => {
    if (workspaceRoute != null) {
      return { organizationId: workspaceRoute.orgId, projectId: workspaceRoute.projectId };
    }
    if (workspaceRuntimeContext != null) {
      return {
        organizationId: workspaceRuntimeContext.organizationId,
        projectId: workspaceRuntimeContext.projectId,
      };
    }
    return null;
  }, [workspaceRoute, workspaceRuntimeContext]);
  const workspaceFolders = useMessengerStore(selectMessengerSidebarFolders);
  const workspaceActivityCounts = useMessengerStore(selectMessengerSidebarActivityCounts);
  const workspaceStreamIds = useMessengerStore((state) => state.streamIds);
  const workspaceStreamsById = useMessengerStore((state) => state.streamsById);
  const workspaceTopicIds = useMessengerStore((state) => state.topicIds);
  const workspaceTopicsById = useMessengerStore((state) => state.topicsById);
  const workspaceFoldersById = useMessengerStore((state) => state.foldersById);
  const workspaceConversationsById = useMessengerStore((state) => state.conversationsById);
  const workspaceMessagesById = useWorkspaceMessageStore((state) => state.messagesById);
  const workspaceUsersById = useUsersStore((state) => state.usersById);
  const workspaceSidebarState = useMemo<MessengerSidebarStreamsState>(
    () => ({
      streamIds: workspaceStreamIds,
      streamsById: workspaceStreamsById,
      topicIds: workspaceTopicIds,
      topicsById: workspaceTopicsById,
      foldersById: workspaceFoldersById,
      conversationsById: workspaceConversationsById,
    }),
    [
      workspaceConversationsById,
      workspaceFoldersById,
      workspaceStreamIds,
      workspaceStreamsById,
      workspaceTopicIds,
      workspaceTopicsById,
    ],
  );
  const workspaceSelectedFolderId = useSidebarConfigStore((s) => s.selectedFolderId);
  const workspaceEffectiveFolder = workspaceFolders.some(
    (folder) => folder.folderUuid === workspaceSelectedFolderId,
  )
    ? (workspaceFolders.find((folder) => folder.folderUuid === workspaceSelectedFolderId) ?? null)
    : (workspaceFolders.find((folder) => folder.systemType === "all") ??
      workspaceFolders[0] ??
      null);
  const workspaceEffectiveFolderId = workspaceEffectiveFolder?.folderUuid ?? null;
  const workspaceTotalStreamCount = workspaceStreamIds.length;
  const workspaceStreams = useMemo(
    () =>
      sidebarWorkspaceIdentity != null
        ? selectMessengerSidebarStreams(workspaceSidebarState, {
            organizationId: sidebarWorkspaceIdentity.organizationId,
            projectId: sidebarWorkspaceIdentity.projectId,
            currentUserUuid,
            selectedFolderUuid: workspaceEffectiveFolderId,
            messagesById: workspaceMessagesById,
            usersById: workspaceUsersById,
          })
        : EMPTY_WORKSPACE_STREAMS,
    [
      currentUserUuid,
      sidebarWorkspaceIdentity,
      workspaceEffectiveFolderId,
      workspaceMessagesById,
      workspaceSidebarState,
      workspaceUsersById,
    ],
  );
  const workspaceLoading = useMessengerStore((state) => state.isLoading);
  const workspaceError = useMessengerStore((state) => state.error);
  const workspaceRailFolders = workspaceFolders.map((folder) => ({
    id: folder.folderUuid,
    label: folder.title,
    backgroundColor: folder.backgroundColorValue ?? 0,
    badge: folder.unreadCount > 0 ? folder.unreadCount : undefined,
    systemType: folder.systemType ?? undefined,
  }));

  const sidebarFrame = (children: React.ReactNode) => (
    <div className="relative flex min-h-0 flex-shrink-0 self-stretch" style={sidebarStyle}>
      {children}
      {sidebarResizeControl}
    </div>
  );

  const handleSelectWorkspaceFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
    },
    [setSelectedFolderId],
  );

  const workspaceFolderRail = (
    <FolderRail
      folders={workspaceRailFolders}
      selectedFolderId={workspaceEffectiveFolderId ?? "all"}
      onSelectFolder={handleSelectWorkspaceFolder}
      layout={folderRailLayout}
    />
  );

  if (folderRailLayout === "vertical") {
    return (
      <>
        <div className="flex min-h-0 flex-shrink-0 self-stretch">{workspaceFolderRail}</div>
        {sidebarFrame(
          <WorkspaceSidebar
            streams={workspaceStreams}
            loading={workspaceLoading}
            error={workspaceError}
            activityCounts={workspaceActivityCounts}
            workspaceStreamCount={workspaceTotalStreamCount}
            selectedFolderSystemType={workspaceEffectiveFolder?.systemType ?? null}
          />,
        )}
      </>
    );
  }

  return sidebarFrame(
    <WorkspaceSidebar
      streams={workspaceStreams}
      loading={workspaceLoading}
      error={workspaceError}
      activityCounts={workspaceActivityCounts}
      workspaceStreamCount={workspaceTotalStreamCount}
      selectedFolderSystemType={workspaceEffectiveFolder?.systemType ?? null}
      activityPanelBottomSlot={workspaceFolderRail}
    />,
  );
};
