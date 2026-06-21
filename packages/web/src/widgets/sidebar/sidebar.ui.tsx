import React, { useMemo, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { CreateChatDialog } from "~/features/create-chat/create-chat-dialog.ui";
import {
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "~/features/folder-sync/folder-sync-constants.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { t } from "~/i18n/i18n";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { WidgetErrorBoundary } from "~/shared/ui/widget-error-boundary.ui";
import { SidebarActivity } from "./sidebar-activity.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { doesSidebarChatMatchQuery, normalizeSidebarSearchQuery } from "./sidebar-filtering.lib";
import { SidebarFolderChatList } from "./sidebar-folder-chat-list.ui";
import { SidebarSearchHeader } from "./sidebar-search-header.ui";
import { getStreamChats } from "./sidebar.lib";
import type { SidebarChat, SidebarUiProps } from "./sidebar.types";

function stripOrgPrefix(pathname: string): string {
  return pathname.replace(/^\/org\/[^/]+(?=\/|$)/, "");
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractStreamSlugFromPath(pathname: string): string | null {
  const normalizedPath = stripOrgPrefix(pathname);
  const match = /^\/stream\/([^/]+)/.exec(normalizedPath);
  return match?.[1] ? decodePathSegment(match[1]) : null;
}

function isStreamChat(chat: SidebarChat): chat is Extract<SidebarChat, { type: "stream" }> {
  return chat.type === "stream";
}

function selectStreamsForFolder(options: {
  selectedFolderId: string;
  allStreams: Extract<SidebarChat, { type: "stream" }>[];
  folderChats: SidebarChat[] | null;
}): Extract<SidebarChat, { type: "stream" }>[] {
  const { selectedFolderId, allStreams, folderChats } = options;
  const folderStreams = folderChats == null ? null : folderChats.filter(isStreamChat);
  const systemStreams = allStreams.length > 0 ? allStreams : (folderStreams ?? allStreams);

  if (selectedFolderId === SYSTEM_PERSONAL_FOLDER_ID) {
    return systemStreams.filter((chat) => chat.private === true);
  }
  if (selectedFolderId === SYSTEM_CHANNELS_FOLDER_ID) {
    return systemStreams.filter((chat) => chat.private !== true);
  }
  if (selectedFolderId === SYSTEM_ALL_FOLDER_ID) {
    return systemStreams;
  }
  if (folderStreams != null) {
    return folderStreams;
  }
  return allStreams;
}

export const SidebarInner: React.FC<SidebarUiProps> = ({
  streams: streamsProp,
  selectedFolderId: selectedFolderIdProp,
  pinFolderId: pinFolderIdProp,
  activeStreamSlug: activeStreamSlugProp = null,
  activeTopic: activeTopicProp = null,
  sidebarChats: sidebarChatsProp,
  sidebarChatsLoading: sidebarChatsLoadingProp = false,
  activityPanelBottomSlot,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { streamSlug, topicName } = useParams<{
    streamSlug?: string;
    topicName?: string;
  }>();

  const streamsFromStore = useChatListStore((s) => s.streams());
  const sidebarDataHydrated = useChatListStore((s) => s.sidebarDataHydrated);
  const streams = streamsProp ?? streamsFromStore;
  const selectedFolderIdFromUi = useSidebarConfigStore((s) => s.selectedFolderId);
  const selectedFolderIdFromSync = useFolderSyncStore((s) => s.selectedFolderId);
  const selectedFolderId =
    selectedFolderIdProp ?? selectedFolderIdFromSync ?? selectedFolderIdFromUi;
  const activeStreamSlug = activeStreamSlugProp ?? streamSlug ?? null;
  const activeTopic = activeTopicProp ?? topicName ?? null;
  const routeStreamSlug = activeStreamSlug ?? extractStreamSlugFromPath(location.pathname);
  const activityOpen = useSidebarConfigStore((s) => s.activityOpen);
  const expandedStreamSlugs = useSidebarConfigStore((s) => s.expandedStreamSlugs);
  const setActivityOpen = useSidebarConfigStore((s) => s.setActivityOpen);
  const toggleExpandedStreamSlug = useSidebarConfigStore((s) => s.toggleExpandedStreamSlug);
  const collapseExpandedStreamsExcept = useSidebarConfigStore(
    (s) => s.collapseExpandedStreamsExcept,
  );
  const collapseAllExpandedStreams = useSidebarConfigStore((s) => s.collapseAllExpandedStreams);
  const searchQuery = useSidebarConfigStore((s) => s.searchQuery);
  const setSearchQuery = useSidebarConfigStore((s) => s.setSearchQuery);
  const createChatOpen = useSidebarConfigStore((s) => s.createChatOpen);
  const setCreateChatOpen = useSidebarConfigStore((s) => s.setCreateChatOpen);
  const users = useUsersStore((s) => s.users);

  useEffect(() => {
    if (routeStreamSlug != null && routeStreamSlug !== "") {
      collapseExpandedStreamsExcept(routeStreamSlug);
      return;
    }
    collapseAllExpandedStreams();
  }, [
    location.pathname,
    routeStreamSlug,
    collapseAllExpandedStreams,
    collapseExpandedStreamsExcept,
  ]);

  const streamChats = useMemo(() => getStreamChats(streams), [streams]);
  const folderStreamChats = useMemo(
    () =>
      selectStreamsForFolder({
        selectedFolderId,
        allStreams: streamChats,
        folderChats: sidebarChatsProp ?? null,
      }),
    [selectedFolderId, sidebarChatsProp, streamChats],
  );
  const pinFolderId = pinFolderIdProp ?? selectedFolderId;
  const normalizedQuery = useMemo(() => normalizeSidebarSearchQuery(searchQuery), [searchQuery]);

  const doesChatMatchQuery = useCallback(
    (chat: SidebarChat) => doesSidebarChatMatchQuery({ chat, normalizedQuery, users }),
    [normalizedQuery, users],
  );

  const filteredStreamChats = useMemo(
    () => folderStreamChats.filter(doesChatMatchQuery),
    [folderStreamChats, doesChatMatchQuery],
  );

  const streamListLoading =
    (sidebarChatsLoadingProp || !sidebarDataHydrated) && folderStreamChats.length === 0;

  const handleToggleStream = useCallback(
    (slug: string) => toggleExpandedStreamSlug(slug),
    [toggleExpandedStreamSlug],
  );

  const handleNewTopic = useCallback(
    (streamSlug: string, topicName: string) => {
      void navigate(
        withCurrentOrgRoute(
          `/stream/${streamSlug}/topic/${encodeURIComponent(encodeTopicForRoute(topicName))}`,
        ),
      );
    },
    [navigate],
  );

  const handleToggleActivity = useCallback(
    () => setActivityOpen(!activityOpen),
    [setActivityOpen, activityOpen],
  );

  return (
    <aside
      className="flex min-h-0 w-sidebar min-w-sidebar max-w-sidebar flex-shrink-0 overflow-hidden rounded-xl bg-sidebar-bg"
      data-focus-zone="sidebar"
      role="navigation"
      aria-label="Chat list"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="flex-1 scrollbar-track-sidebar-bg" data-sidebar-scroll>
          <SidebarSearchHeader
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onOpenCreateChat={() => setCreateChatOpen(true)}
          />
          <SidebarActivity open={activityOpen} onToggle={handleToggleActivity} />
          {activityPanelBottomSlot != null && (
            <>
              {activityPanelBottomSlot}
              <div className="my-2">
                <div className="bg-border-subtle/70 h-px" />
              </div>
            </>
          )}
          <SidebarFolderChatList
            chats={filteredStreamChats}
            selectedFolderId={selectedFolderId}
            pinFolderId={pinFolderId}
            activeStreamSlug={activeStreamSlug}
            activeTopic={activeTopic}
            expandedStreamSlugs={expandedStreamSlugs}
            onToggleStream={handleToggleStream}
            onNewTopic={handleNewTopic}
            loading={streamListLoading}
            showEmptyState={normalizedQuery.length === 0}
          />
        </ScrollArea>
      </div>
      <CreateChatDialog
        open={createChatOpen}
        onOpenChange={setCreateChatOpen}
        onNavigateStream={(streamUuid) => {
          setCreateChatOpen(false);
          void navigate(withCurrentOrgRoute(`/stream/${buildStreamSlug(streamUuid)}`));
        }}
        onChannelCreated={() => {
          setCreateChatOpen(false);
        }}
      />
    </aside>
  );
};

export const Sidebar: React.FC<SidebarUiProps> = (props) => (
  <WidgetErrorBoundary sectionLabel={t("nav.messenger")}>
    <SidebarInner {...props} />
  </WidgetErrorBoundary>
);
