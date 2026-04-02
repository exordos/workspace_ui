import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { CreateChatDialog } from "~/features/create-chat/create-chat-dialog.ui";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { selectSidebarChatsLoading } from "~/features/folder-sync/folder-sync.selectors";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { t } from "~/i18n/i18n";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SidebarActivity } from "./sidebar-activity.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { SidebarDmList } from "./sidebar-dm-list.ui";
import { SidebarFolderChatList } from "./sidebar-folder-chat-list.ui";
import { SidebarPinReorderBanner } from "./sidebar-pin-reorder-banner.ui";
import { SidebarSearchHeader } from "./sidebar-search-header.ui";
import { SidebarStreamList } from "./sidebar-stream-list.ui";
import { chatToWorkspaceChatId, getStreamChats, parseDmSlugToUserIds } from "./sidebar.lib";
import { doesSidebarChatMatchQuery, normalizeSidebarSearchQuery } from "./sidebar-filtering.lib";
import type { SidebarChat, SidebarUiProps, StreamWithLast } from "./sidebar.types";

const EMPTY_PIN_REORDER_CHAT_IDS: string[] = [];

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
  pinReorderMode: pinReorderModeProp = false,
  onExitPinReorderMode,
  onFolderAssignmentsChanged,
  activityPanelBottomSlot,
}) => {
  const navigate = useNavigate();
  const { streamSlug, topicName, dmId: dmIdParamFromRoute } = useParams<{
    streamSlug?: string;
    topicName?: string;
    dmId?: string;
  }>();

  const streams = streamsProp ?? useChatListStore((s) => s.streams());
  const sidebarDms = sidebarDmsProp ?? useChatListStore((s) => s.dms());
  const selectedFolderIdFromUi = useSidebarConfigStore((s) => s.selectedFolderId);
  const setSelectedFolderIdFromUi = useSidebarConfigStore((s) => s.setSelectedFolderId);
  const pinReorderModeFromUi = useSidebarConfigStore((s) => s.pinReorderMode);
  const setPinReorderModeFromUi = useSidebarConfigStore((s) => s.setPinReorderMode);
  const selectedFolderIdFromSync = useFolderSyncStore((s) => s.selectedFolderId);
  const selectedFolderId =
    selectedFolderIdProp ?? selectedFolderIdFromSync ?? selectedFolderIdFromUi;
  const sidebarChats = sidebarChatsProp ?? null;
  const sidebarChatsLoading = sidebarChatsLoadingProp || false;
  const selectFolderSync = useFolderSyncStore((s) => s.selectFolder);
  const refreshFolderSync = useFolderSyncStore((s) => s.refresh);
  const refreshFolderItemsCache = useFolderSyncStore((s) => s.refreshFolderItemsCache);
  const pinFolderId = pinFolderIdProp ?? undefined;
  const pinReorderMode = pinReorderModeProp || pinReorderModeFromUi;
  const activeStreamSlug = activeStreamSlugProp ?? streamSlug ?? null;
  const activeTopic = activeTopicProp ?? topicName ?? null;
  const activeDmIdParam = activeDmIdParamProp ?? dmIdParamFromRoute ?? null;
  const activityOpen = useSidebarConfigStore((s) => s.activityOpen);
  const expandedStreamSlug = useSidebarConfigStore((s) => s.expandedStreamSlug);
  const setActivityOpen = useSidebarConfigStore((s) => s.setActivityOpen);
  const setExpandedStreamSlug = useSidebarConfigStore((s) => s.setExpandedStreamSlug);
  const searchQuery = useSidebarConfigStore((s) => s.searchQuery);
  const setSearchQuery = useSidebarConfigStore((s) => s.setSearchQuery);
  const createChatOpen = useSidebarConfigStore((s) => s.createChatOpen);
  const setCreateChatOpen = useSidebarConfigStore((s) => s.setCreateChatOpen);
  const users = useUsersStore((s) => s.users);
  const pinnedChatIdsForSelectedFolder = usePinStore((s) =>
    pinReorderMode ? s.getPinnedChatIds(selectedFolderId) : EMPTY_PIN_REORDER_CHAT_IDS,
  );

  useEffect(() => {
    if (!activeTopic || !activeStreamSlug) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (expandedStreamSlug !== activeStreamSlug) {
        setExpandedStreamSlug(activeStreamSlug);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTopic, activeStreamSlug, expandedStreamSlug, setExpandedStreamSlug]);

  useEffect(() => {
    if (activeDmIdParam == null || activeDmIdParam === "") return;
    if (expandedStreamSlug == null) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setExpandedStreamSlug(null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeDmIdParam, expandedStreamSlug, setExpandedStreamSlug]);

  const streamChats = useMemo(() => getStreamChats(streams as StreamWithLast[]), [streams]);

  const listChats = useMemo<SidebarChat[]>(() => sidebarChats ?? [], [sidebarChats]);
  const folderChatListLoading = sidebarChatsLoading && listChats.length === 0;
  const normalizedQuery = useMemo(() => normalizeSidebarSearchQuery(searchQuery), [searchQuery]);

  const doesChatMatchQuery = useCallback(
    (chat: SidebarChat) => doesSidebarChatMatchQuery({ chat, normalizedQuery, users }),
    [normalizedQuery, users],
  );

  const filteredChats = useMemo(
    () => listChats.filter(doesChatMatchQuery),
    [listChats, doesChatMatchQuery],
  );
  const pinnedChatIdSetForReorder = useMemo(
    () => new Set(pinnedChatIdsForSelectedFolder),
    [pinnedChatIdsForSelectedFolder],
  );
  const filteredFolderChats = useMemo(() => {
    if (!pinReorderMode) return filteredChats;
    // В режиме reorder показываем только закрепленные чаты текущей папки.
    return filteredChats.filter((chat) =>
      pinnedChatIdSetForReorder.has(chatToWorkspaceChatId(chat)),
    );
  }, [filteredChats, pinReorderMode, pinnedChatIdSetForReorder]);

  const filteredStreamChats = useMemo(
    () => streamChats.filter(doesChatMatchQuery),
    [streamChats, doesChatMatchQuery],
  );

  const handleToggleStream = useCallback(
    (slug: string) => setExpandedStreamSlug(expandedStreamSlug === slug ? null : slug),
    [expandedStreamSlug, setExpandedStreamSlug],
  );

  const handleNewTopic = useCallback(
    (streamSlug: string, topicName: string) => {
      void navigate(
        withCurrentOrgRoute(`/stream/${streamSlug}/topic/${encodeURIComponent(topicName)}`),
      );
    },
    [navigate],
  );

  const handleToggleActivity = useCallback(
    () => setActivityOpen(!activityOpen),
    [setActivityOpen, activityOpen],
  );
  const handleExitPinReorderMode = useCallback(() => {
    onExitPinReorderMode?.();
    setPinReorderModeFromUi(false);
  }, [onExitPinReorderMode, setPinReorderModeFromUi]);

  const handleFoldersChanged = useCallback(
    async (affectedFolderUuid?: string) => {
      const uuid = affectedFolderUuid?.trim();
      if (uuid != null && uuid.length > 0) {
        await refreshFolderItemsCache(uuid);
      } else {
        await refreshFolderSync("mutation");
      }
      await onFolderAssignmentsChanged?.(affectedFolderUuid);
    },
    [refreshFolderItemsCache, refreshFolderSync, onFolderAssignmentsChanged],
  );

  return (
    <aside
      className="flex min-h-0 w-sidebar min-w-sidebar max-w-sidebar flex-shrink-0 overflow-hidden rounded-xl bg-sidebar-bg"
      data-focus-zone="sidebar"
      role="navigation"
      aria-label="Chat list"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="flex-1 scrollbar-track-sidebar-bg">
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
          {pinReorderMode && (
            <SidebarPinReorderBanner onClose={handleExitPinReorderMode} />
          )}
          <SidebarFolderChatList
            chats={filteredFolderChats}
            selectedFolderId={selectedFolderId}
            pinFolderId={pinFolderId}
            activeStreamSlug={activeStreamSlug}
            activeDmIdParam={activeDmIdParam}
            activeTopic={activeTopic}
            expandedStreamSlug={expandedStreamSlug}
            onToggleStream={handleToggleStream}
            onNewTopic={handleNewTopic}
            reorderPinnedOnly={pinReorderMode}
            loading={folderChatListLoading}
            showEmptyState={sidebarChats != null && normalizedQuery.length === 0}
            onFolderAssignmentsChanged={handleFoldersChanged}
          />
          {!sidebarChats && (
            <SidebarStreamList
              streamChats={filteredStreamChats}
              activeStreamSlug={activeStreamSlug}
              activeTopic={activeTopic}
              expandedStreamSlug={expandedStreamSlug}
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
        onChannelCreated={() => {
          setCreateChatOpen(false);
        }}
      />
    </aside>
  );
};
