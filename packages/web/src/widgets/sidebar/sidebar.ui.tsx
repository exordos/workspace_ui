import React, { useMemo, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { CreateChatDialog } from "~/features/create-chat/create-chat-dialog.ui";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { t } from "~/i18n/i18n";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SidebarActivity } from "./sidebar-activity.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { SidebarDmList } from "./sidebar-dm-list.ui";
import { doesSidebarChatMatchQuery, normalizeSidebarSearchQuery } from "./sidebar-filtering.lib";
import { SidebarFolderChatList } from "./sidebar-folder-chat-list.ui";
import { SidebarSearchHeader } from "./sidebar-search-header.ui";
import { SidebarStreamList } from "./sidebar-stream-list.ui";
import { getStreamChats, isSidebarSystemFolderScope } from "./sidebar.lib";
import type { SidebarChat, SidebarUiProps } from "./sidebar.types";

// Убирает org-префикс, чтобы дальше одинаково разбирать пути с /org/:id и без него.
function stripOrgPrefix(pathname: string): string {
  return pathname.replace(/^\/org\/[^/]+(?=\/|$)/, "");
}

// Безопасный decode сегмента пути: не роняем UI на битом %encoding.
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

function extractDmIdFromPath(pathname: string): string | null {
  const normalizedPath = stripOrgPrefix(pathname);
  const match = /^\/dm\/([^/]+)/.exec(normalizedPath);
  return match?.[1] ? decodePathSegment(match[1]) : null;
}

export const Sidebar: React.FC<SidebarUiProps> = ({
  streams: streamsProp,
  selectedFolderId: selectedFolderIdProp,
  pinFolderId: pinFolderIdProp,
  activeStreamSlug: activeStreamSlugProp = null,
  activeTopic: activeTopicProp = null,
  activeDmIdParam: activeDmIdParamProp = null,
  sidebarDms: sidebarDmsProp,
  sidebarChats: sidebarChatsProp,
  sidebarChatsLoading: sidebarChatsLoadingProp = false,
  activityPanelBottomSlot,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    streamSlug,
    topicName,
    dmId: dmIdParamFromRoute,
  } = useParams<{
    streamSlug?: string;
    topicName?: string;
    dmId?: string;
  }>();

  const streamsFromStore = useChatListStore((s) => s.streams());
  const sidebarDmsFromStore = useChatListStore((s) => s.dms());
  const sidebarDataHydrated = useChatListStore((s) => s.sidebarDataHydrated);
  const streams = streamsProp ?? streamsFromStore;
  const sidebarDms = sidebarDmsProp ?? sidebarDmsFromStore;
  const selectedFolderIdFromUi = useSidebarConfigStore((s) => s.selectedFolderId);
  const selectedFolderIdFromSync = useFolderSyncStore((s) => s.selectedFolderId);
  const selectedFolderId =
    selectedFolderIdProp ?? selectedFolderIdFromSync ?? selectedFolderIdFromUi;
  const sidebarChats = sidebarChatsProp ?? null;
  const sidebarChatsLoading = sidebarChatsLoadingProp || false;
  const pinFolderId = pinFolderIdProp ?? undefined;
  const activeStreamSlug = activeStreamSlugProp ?? streamSlug ?? null;
  const activeTopic = activeTopicProp ?? topicName ?? null;
  const activeDmIdParam = activeDmIdParamProp ?? dmIdParamFromRoute ?? null;
  // route* значения используются только для route-sync.
  // Приоритет: явные пропсы -> parsed pathname.
  const routeStreamSlug = activeStreamSlug ?? extractStreamSlugFromPath(location.pathname);
  const routeDmIdParam = activeDmIdParam ?? extractDmIdFromPath(location.pathname);
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
    // Route-sync раскрытий:
    // stream -> оставить только целевой, dm/non-chat -> свернуть все.
    if (routeStreamSlug != null && routeStreamSlug !== "") {
      collapseExpandedStreamsExcept(routeStreamSlug);
      return;
    }
    if (routeDmIdParam != null && routeDmIdParam !== "") {
      collapseAllExpandedStreams();
      return;
    }
    collapseAllExpandedStreams();
  }, [
    location.pathname,
    routeDmIdParam,
    routeStreamSlug,
    collapseAllExpandedStreams,
    collapseExpandedStreamsExcept,
  ]);

  const streamChats = useMemo(() => getStreamChats(streams), [streams]);

  const listChats = useMemo<SidebarChat[]>(() => sidebarChats ?? [], [sidebarChats]);
  const systemFolderAwaitingChatHydration = useMemo(
    () => isSidebarSystemFolderScope(selectedFolderId) && !sidebarDataHydrated,
    [selectedFolderId, sidebarDataHydrated],
  );
  const folderChatListLoading =
    (sidebarChatsLoading || systemFolderAwaitingChatHydration) && listChats.length === 0;
  const normalizedQuery = useMemo(() => normalizeSidebarSearchQuery(searchQuery), [searchQuery]);

  const doesChatMatchQuery = useCallback(
    (chat: SidebarChat) => doesSidebarChatMatchQuery({ chat, normalizedQuery, users }),
    [normalizedQuery, users],
  );

  const filteredChats = useMemo(
    () => listChats.filter(doesChatMatchQuery),
    [listChats, doesChatMatchQuery],
  );
  const filteredStreamChats = useMemo(
    () => streamChats.filter(doesChatMatchQuery),
    [streamChats, doesChatMatchQuery],
  );

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
          <div className="px-3">
            <div className="bg-border-subtle/70 h-px" />
          </div>
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
            chats={filteredChats}
            selectedFolderId={selectedFolderId}
            pinFolderId={pinFolderId}
            activeStreamSlug={activeStreamSlug}
            activeDmIdParam={activeDmIdParam}
            activeTopic={activeTopic}
            expandedStreamSlugs={expandedStreamSlugs}
            onToggleStream={handleToggleStream}
            onNewTopic={handleNewTopic}
            loading={folderChatListLoading}
            showEmptyState={sidebarChats != null && normalizedQuery.length === 0}
          />
          {!sidebarChats && (
            <SidebarStreamList
              streamChats={filteredStreamChats}
              activeStreamSlug={activeStreamSlug}
              activeTopic={activeTopic}
              expandedStreamSlugs={expandedStreamSlugs}
              onToggleStream={handleToggleStream}
              onNewTopic={handleNewTopic}
            />
          )}
          {!sidebarChats && (
            <div className="mt-4">
              <h3 className="mb-2 px-3 text-xs font-medium text-text-muted">
                {t("nav.directMessages")}
              </h3>
              <SidebarDmList
                activeDmId={
                  activeDmIdParam
                    ? (() => {
                        const n = parseInt(activeDmIdParam.split("-")[0] ?? "", 10);
                        return n > 0 ? n : null;
                      })()
                    : null
                }
                dms={sidebarDms}
              />
            </div>
          )}
        </ScrollArea>
      </div>
      <CreateChatDialog
        open={createChatOpen}
        onOpenChange={setCreateChatOpen}
        onNavigateDm={(slug) => {
          setCreateChatOpen(false);
          void navigate(withCurrentOrgRoute(`/dm/${slug}`));
        }}
        onNavigateStream={(streamId, streamName) => {
          setCreateChatOpen(false);
          void navigate(withCurrentOrgRoute(`/stream/${buildStreamSlug(streamId, streamName)}`));
        }}
        onChannelCreated={() => {
          setCreateChatOpen(false);
        }}
      />
    </aside>
  );
};
