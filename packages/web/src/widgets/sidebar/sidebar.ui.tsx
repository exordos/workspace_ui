import * as Dialog from "@radix-ui/react-dialog";
import React, { useState, useMemo, useEffect, useCallback, useId, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list";
import { formatUserStatusLabel, useUsersStore } from "~/entities/user";
import { createChannel } from "~/features/create-chat";
import { usePinStore } from "~/features/pin-chat";
import { t } from "~/i18n";
import { getPresenceState } from "~/shared/lib/format";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { Icon, PresenceIndicator, ScrollArea } from "~/shared/ui";
import { SidebarActivity } from "./sidebar-activity.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { SidebarDmList } from "./sidebar-dm-list.ui";
import { SidebarFolderChatList } from "./sidebar-folder-chat-list.ui";
import { SidebarStreamList } from "./sidebar-stream-list.ui";
import { chatToWorkspaceChatId, getStreamChats, parseDmSlugToUserIds } from "./sidebar.lib";
import type { SidebarProps } from "./sidebar.types";

const EMPTY_PIN_REORDER_CHAT_IDS: string[] = [];
const CREATE_CHAT_TABS = ["dm", "group", "channel"] as const;
type CreateChatTab = (typeof CREATE_CHAT_TABS)[number];

interface SidebarUiProps extends SidebarProps {
  activityPanelBottomSlot?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarUiProps> = ({
  streams,
  selectedFolderId,
  pinFolderId,
  activeStreamSlug = null,
  activeTopic = null,
  activeDmIdParam = null,
  sidebarDms,
  sidebarChats,
  sidebarChatsLoading = false,
  pinReorderMode = false,
  onExitPinReorderMode,
  onFolderAssignmentsChanged,
  activityPanelBottomSlot,
}) => {
  const navigate = useNavigate();
  const activityOpen = useSidebarConfigStore((s) => s.activityOpen);
  const expandedStreamSlug = useSidebarConfigStore((s) => s.expandedStreamSlug);
  const setActivityOpen = useSidebarConfigStore((s) => s.setActivityOpen);
  const setExpandedStreamSlug = useSidebarConfigStore((s) => s.setExpandedStreamSlug);
  const [searchQuery, setSearchQuery] = useState("");
  const [createChatOpen, setCreateChatOpen] = useState(false);
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

  const streamChats = useMemo(() => getStreamChats(streams), [streams]);

  const listChats = useMemo(() => sidebarChats ?? [], [sidebarChats]);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const doesChatMatchQuery = useCallback(
    (chat: (typeof listChats)[number]) => {
      if (!normalizedQuery) return true;
      if (chat.type === "stream") {
        const nameMatch = chat.name.toLowerCase().includes(normalizedQuery);
        const topicMatch = chat.topics?.some((topic) =>
          topic.subject.toLowerCase().includes(normalizedQuery),
        );
        return nameMatch || (topicMatch ?? false);
      }
      const nameMatch = chat.name.toLowerCase().includes(normalizedQuery);
      if (nameMatch) return true;
      const participantIds =
        Array.isArray(chat.userIds) && chat.userIds.length > 0
          ? chat.userIds
          : parseDmSlugToUserIds(chat.slug);
      return participantIds.some((userId) => {
        const user = users.get(userId);
        if (!user) return false;
        if (user.full_name.toLowerCase().includes(normalizedQuery)) return true;
        return user.email?.toLowerCase().includes(normalizedQuery) ?? false;
      });
    },
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
  }, [onExitPinReorderMode]);

  return (
    <aside
      className="flex min-h-0 w-sidebar min-w-sidebar max-w-sidebar flex-shrink-0 flex-col overflow-hidden rounded-xl bg-sidebar-bg"
      data-focus-zone="sidebar"
      role="navigation"
      aria-label="Chat list"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="flex-1 scrollbar-track-sidebar-bg">
          <div className="flex items-center gap-2 px-3 pb-3 pt-4">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-text-field-bg px-2 py-0.5 text-text-muted opacity-100 focus-within:border-accent focus-within:text-text-primary">
              <input
                type="search"
                placeholder={t("search.find")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                aria-label={t("search.search")}
              />
              <Icon name="search" size={20} className="shrink-0" />
            </label>
            <button
              type="button"
              onClick={() => setCreateChatOpen(true)}
              className="hover:bg-bg/60 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-primary"
              aria-label={t("a11y.newWindow")}
            >
              <Icon name="newWindow" size={20} />
            </button>
          </div>
          <SidebarActivity open={activityOpen} onToggle={handleToggleActivity} />
          {activityPanelBottomSlot != null && activityPanelBottomSlot}
          <div className="my-2">
            <div className="bg-border-subtle/70 h-px" />
          </div>
          {pinReorderMode && (
            <div className="mx-3 mb-2 flex items-center justify-between rounded-lg border border-border-subtle bg-bg-elevated px-2.5 py-1.5">
              <span className="text-xs font-medium text-text-primary">
                {t("settings.chatSorting")}
              </span>
              <button
                type="button"
                onClick={handleExitPinReorderMode}
                className="hover:bg-bg/50 rounded px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text-primary"
                aria-label={t("common.close")}
              >
                {t("common.close")}
              </button>
            </div>
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
            loading={sidebarChatsLoading}
            showEmptyState={sidebarChats != null && normalizedQuery.length === 0}
            onFolderAssignmentsChanged={onFolderAssignmentsChanged}
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

function CreateChatDialog({
  open,
  onOpenChange,
  onNavigateDm,
  onChannelCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateDm: (slug: string) => void;
  onChannelCreated: () => void;
}) {
  const [tab, setTab] = useState<CreateChatTab>("dm");
  const tabBaseId = useId();
  const tabRefs = useRef<Record<CreateChatTab, HTMLButtonElement | null>>({
    dm: null,
    group: null,
    channel: null,
  });
  const tabIds: Record<CreateChatTab, string> = {
    dm: `${tabBaseId}-tab-dm`,
    group: `${tabBaseId}-tab-group`,
    channel: `${tabBaseId}-tab-channel`,
  };
  const panelIds: Record<CreateChatTab, string> = {
    dm: `${tabBaseId}-panel-dm`,
    group: `${tabBaseId}-panel-group`,
    channel: `${tabBaseId}-panel-channel`,
  };
  const [userSearch, setUserSearch] = useState("");
  const [groupSelectedUserIds, setGroupSelectedUserIds] = useState<Set<number>>(new Set());
  const [channelSelectedUserIds, setChannelSelectedUserIds] = useState<Set<number>>(new Set());
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [channelInviteOnly, setChannelInviteOnly] = useState(false);
  const [channelAnnounce, setChannelAnnounce] = useState(false);
  const [creating, setCreating] = useState(false);
  const allUsers = useUsersStore((s) => s.users);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);

  const filteredUsers = useMemo(() => {
    const list = Array.from(allUsers.values()).filter((u) => u.user_id !== currentUserId);
    if (!userSearch.trim()) return list;
    const q = userSearch.trim().toLowerCase();
    return list.filter(
      (u) => u.full_name.toLowerCase().includes(q) || (u.email?.toLowerCase().includes(q) ?? false),
    );
  }, [allUsers, userSearch, currentUserId]);

  const resolvePresenceState = useCallback(
    (userId: number) => {
      const presence = allUsers.get(userId)?.presence;
      return presence != null ? getPresenceState(presence.timestamp, presence.status) : null;
    },
    [allUsers],
  );
  const resolveStatusLabel = useCallback(
    (userId: number) => formatUserStatusLabel(allUsers.get(userId)?.status),
    [allUsers],
  );

  const groupUsers = useMemo(
    () => [
      ...filteredUsers.filter((u) => groupSelectedUserIds.has(u.user_id)),
      ...filteredUsers.filter((u) => !groupSelectedUserIds.has(u.user_id)),
    ],
    [filteredUsers, groupSelectedUserIds],
  );

  const channelUsers = useMemo(
    () => [
      ...filteredUsers.filter((u) => channelSelectedUserIds.has(u.user_id)),
      ...filteredUsers.filter((u) => !channelSelectedUserIds.has(u.user_id)),
    ],
    [filteredUsers, channelSelectedUserIds],
  );

  useEffect(() => {
    if (open) return;
    void Promise.resolve().then(() => {
      setTab("dm");
      setUserSearch("");
      setGroupSelectedUserIds(new Set());
      setChannelSelectedUserIds(new Set());
      setChannelName("");
      setChannelDesc("");
      setChannelInviteOnly(false);
      setChannelAnnounce(false);
      setCreating(false);
    });
  }, [open]);

  const handleCreateGroup = useCallback(() => {
    if (groupSelectedUserIds.size === 0 || currentUserId == null) return;
    const ids = [...groupSelectedUserIds, currentUserId].sort((a, b) => a - b);
    onNavigateDm(ids.join(","));
    setGroupSelectedUserIds(new Set());
  }, [groupSelectedUserIds, currentUserId, onNavigateDm]);

  const handleToggleGroupUser = useCallback((userId: number) => {
    setGroupSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const handleToggleChannelUser = useCallback((userId: number) => {
    setChannelSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const focusTab = useCallback((nextTab: CreateChatTab) => {
    tabRefs.current[nextTab]?.focus();
  }, []);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: CreateChatTab) => {
      const currentTabIndex = CREATE_CHAT_TABS.indexOf(currentTab);
      if (currentTabIndex < 0) return;

      let nextTab: CreateChatTab | null = null;
      if (event.key === "ArrowRight") {
        nextTab = CREATE_CHAT_TABS[(currentTabIndex + 1) % CREATE_CHAT_TABS.length] ?? null;
      } else if (event.key === "ArrowLeft") {
        nextTab =
          CREATE_CHAT_TABS[
            (currentTabIndex - 1 + CREATE_CHAT_TABS.length) % CREATE_CHAT_TABS.length
          ] ?? null;
      } else if (event.key === "Home") {
        nextTab = CREATE_CHAT_TABS[0] ?? null;
      } else if (event.key === "End") {
        nextTab = CREATE_CHAT_TABS[CREATE_CHAT_TABS.length - 1] ?? null;
      }

      if (nextTab == null) return;
      event.preventDefault();
      setTab(nextTab);
      focusTab(nextTab);
    },
    [focusTab],
  );

  const handleCreateChannel = useCallback(() => {
    if (!channelName.trim() || creating) return;
    setCreating(true);
    createChannel({
      name: channelName.trim(),
      description: channelDesc.trim(),
      subscribers: Array.from(channelSelectedUserIds).sort((a, b) => a - b),
      inviteOnly: channelInviteOnly,
      announce: channelAnnounce,
    })
      .then((result) => {
        if (result) {
          setChannelName("");
          setChannelDesc("");
          setChannelSelectedUserIds(new Set());
          setChannelInviteOnly(false);
          setChannelAnnounce(false);
          onChannelCreated();
        }
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [
    channelName,
    channelDesc,
    channelSelectedUserIds,
    channelInviteOnly,
    channelAnnounce,
    creating,
    onChannelCreated,
  ]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal flex max-h-[70vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              {t("nav.newChat")}
            </Dialog.Title>
            <Dialog.Description className="sr-only">{t("nav.newChat")}</Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="hover:bg-bg/50 rounded p-1 text-text-muted"
                aria-label={t("common.close")}
              >
                <Icon name="close" size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div
            className="flex border-b border-border-subtle"
            role="tablist"
            aria-label={t("nav.newChat")}
          >
            <button
              type="button"
              ref={(node) => {
                tabRefs.current.dm = node;
              }}
              role="tab"
              id={tabIds.dm}
              aria-selected={tab === "dm"}
              aria-controls={panelIds.dm}
              tabIndex={tab === "dm" ? 0 : -1}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                tab === "dm"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setTab("dm")}
              onKeyDown={(event) => handleTabKeyDown(event, "dm")}
            >
              {t("dm.startChat")}
            </button>
            <button
              type="button"
              ref={(node) => {
                tabRefs.current.group = node;
              }}
              role="tab"
              id={tabIds.group}
              aria-selected={tab === "group"}
              aria-controls={panelIds.group}
              tabIndex={tab === "group" ? 0 : -1}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                tab === "group"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setTab("group")}
              onKeyDown={(event) => handleTabKeyDown(event, "group")}
            >
              {t("dm.createGroup")}
            </button>
            <button
              type="button"
              ref={(node) => {
                tabRefs.current.channel = node;
              }}
              role="tab"
              id={tabIds.channel}
              aria-selected={tab === "channel"}
              aria-controls={panelIds.channel}
              tabIndex={tab === "channel" ? 0 : -1}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                tab === "channel"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setTab("channel")}
              onKeyDown={(event) => handleTabKeyDown(event, "channel")}
            >
              {t("channel.createChannel")}
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
            {tab === "dm" && (
              <div
                role="tabpanel"
                id={panelIds.dm}
                aria-labelledby={tabIds.dm}
                className="flex flex-1 flex-col gap-3 overflow-hidden"
              >
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t("message.searchUsers")}
                />
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border-subtle">
                  {filteredUsers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-text-muted">
                      {t("search.noResults")}
                    </p>
                  ) : (
                    filteredUsers.map((u) => {
                      const presenceState = resolvePresenceState(u.user_id);
                      const statusLabel = resolveStatusLabel(u.user_id);
                      return (
                        <button
                          type="button"
                          key={u.user_id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                          onClick={() =>
                            onNavigateDm(
                              `${u.user_id}-${u.full_name.toLowerCase().replace(/\s+/g, "-")}`,
                            )
                          }
                        >
                          <PresenceIndicator status={presenceState} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{u.full_name}</span>
                            {(statusLabel ?? u.email) && (
                              <span className="block truncate text-[11px] text-text-secondary">
                                {statusLabel ?? u.email}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {tab === "group" && (
              <div
                role="tabpanel"
                id={panelIds.group}
                aria-labelledby={tabIds.group}
                className="flex flex-1 flex-col gap-3 overflow-hidden"
              >
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t("message.searchUsers")}
                />
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border-subtle">
                  {filteredUsers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-text-muted">
                      {t("search.noResults")}
                    </p>
                  ) : (
                    groupUsers.map((u) => {
                      const presenceState = resolvePresenceState(u.user_id);
                      const statusLabel = resolveStatusLabel(u.user_id);
                      return (
                        <label
                          key={u.user_id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                        >
                          <input
                            type="checkbox"
                            checked={groupSelectedUserIds.has(u.user_id)}
                            onChange={() => handleToggleGroupUser(u.user_id)}
                            className="h-4 w-4 rounded border-border-subtle"
                          />
                          <PresenceIndicator status={presenceState} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{u.full_name}</span>
                            {(statusLabel ?? u.email) && (
                              <span className="block truncate text-[11px] text-text-secondary">
                                {statusLabel ?? u.email}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
                    >
                      {t("common.cancel")}
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={groupSelectedUserIds.size === 0}
                    onClick={handleCreateGroup}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
                  >
                    {t("common.create")}
                  </button>
                </div>
              </div>
            )}

            {tab === "channel" && (
              <div
                role="tabpanel"
                id={panelIds.channel}
                aria-labelledby={tabIds.channel}
                className="flex flex-1 flex-col gap-3 overflow-hidden"
              >
                <label className="text-sm text-text-muted">{t("channel.channelName")}</label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t("channel.channelName")}
                />
                <label className="text-sm text-text-muted">{t("channel.description")}</label>
                <input
                  type="text"
                  value={channelDesc}
                  onChange={(e) => setChannelDesc(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t("channel.description")}
                />
                <div className="grid gap-2 rounded-lg border border-border-subtle bg-bg px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={channelInviteOnly}
                      onChange={(e) => setChannelInviteOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-border-subtle"
                    />
                    <span>{t("channel.inviteOnly")}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={channelAnnounce}
                      onChange={(e) => setChannelAnnounce(e.target.checked)}
                      className="h-4 w-4 rounded border-border-subtle"
                    />
                    <span>{t("channel.announceChannel")}</span>
                  </label>
                </div>
                <label className="text-sm text-text-muted">{t("channel.addMembers")}</label>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t("message.searchUsers")}
                />
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border-subtle">
                  {filteredUsers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-text-muted">
                      {t("search.noResults")}
                    </p>
                  ) : (
                    channelUsers.map((u) => {
                      const presenceState = resolvePresenceState(u.user_id);
                      const statusLabel = resolveStatusLabel(u.user_id);
                      return (
                        <label
                          key={u.user_id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                        >
                          <input
                            type="checkbox"
                            checked={channelSelectedUserIds.has(u.user_id)}
                            onChange={() => handleToggleChannelUser(u.user_id)}
                            className="h-4 w-4 rounded border-border-subtle"
                          />
                          <PresenceIndicator status={presenceState} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{u.full_name}</span>
                            {(statusLabel ?? u.email) && (
                              <span className="block truncate text-[11px] text-text-secondary">
                                {statusLabel ?? u.email}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
                    >
                      {t("common.cancel")}
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={!channelName.trim() || creating}
                    onClick={handleCreateChannel}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
                  >
                    {t("common.create")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
