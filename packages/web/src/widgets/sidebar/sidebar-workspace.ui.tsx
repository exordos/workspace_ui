import React, { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { MessengerSidebarActivityCounts } from "~/entities/messenger/messenger-sidebar.lib";
import type {
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
} from "~/entities/messenger/messenger.types";
import { CreateChatDialog } from "~/features/create-chat/create-chat-dialog.ui";
import { useSettingsStore } from "~/features/settings/settings.model";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { formatMessageTimeRelative } from "~/shared/lib/datetime.lib";
import { sidebarRowClass } from "~/shared/lib/format";
import {
  parseWorkspaceMessengerRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { Spinner } from "~/shared/ui/spinner.ui";
import { sidebarChatRowBodyClass, sidebarChatRowLinkClass } from "./sidebar-chat-row-layout.lib";
import { SidebarChatRowMeta } from "./sidebar-chat-row-meta.ui";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { normalizeSidebarSearchQuery } from "./sidebar-filtering.lib";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";
import { SidebarSearchHeader } from "./sidebar-search-header.ui";
import { useSidebarTopicCollapse } from "./sidebar-topic-collapse.hook";
import { SidebarTopicShowMoreButton } from "./sidebar-topic-show-more.ui";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";
import { WorkspaceSidebarActivity } from "./sidebar-workspace-activity.ui";
import {
  WorkspaceStreamContextMenu,
  WorkspaceTopicContextMenu,
} from "./sidebar-workspace-context-menu.ui";

const WORKSPACE_CREATE_CHAT_VISIBLE_TABS = ["dm", "channel", "topic"] as const;

export interface WorkspaceSidebarProps {
  streams: MessengerSidebarStreamItem[];
  loading: boolean;
  error: string | null;
  activityCounts: MessengerSidebarActivityCounts;
  workspaceStreamCount: number;
  selectedFolderSystemType?: "all" | "created" | "personal" | "channels" | null;
  activityPanelBottomSlot?: React.ReactNode;
  onOpenCreateChat?: () => void;
}

// This component only renders the Workspace chat list.
// Data, links, and counts are prepared by messenger-sidebar.lib.ts selectors.
function workspaceStreamMatchesQuery(
  stream: MessengerSidebarStreamItem,
  normalizedQuery: string,
): boolean {
  if (normalizedQuery.length === 0) return true;
  return (
    stream.title.toLowerCase().includes(normalizedQuery) ||
    stream.topics.some((topic) => topic.title.toLowerCase().includes(normalizedQuery))
  );
}

function workspaceTopicMatchesQuery(
  topic: MessengerSidebarTopicItem,
  normalizedQuery: string,
): boolean {
  return normalizedQuery.length === 0 || topic.title.toLowerCase().includes(normalizedQuery);
}

function formatWorkspaceMessageTime(createdAt: string | null): string | undefined {
  if (createdAt == null) return undefined;
  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp)) return undefined;
  return formatMessageTimeRelative(Math.floor(timestamp / 1000));
}

function resolveWorkspaceSidebarEmptyState(input: {
  normalizedQuery: string;
  workspaceStreamCount: number;
  selectedFolderSystemType?: "all" | "created" | "personal" | "channels" | null;
}): { title: string; hint: string } {
  if (input.normalizedQuery.length > 0) {
    return {
      title: t("sidebar.emptySearch"),
      hint: t("sidebar.emptySearchHint"),
    };
  }

  if (input.workspaceStreamCount === 0) {
    return {
      title: t("sidebar.emptyWorkspace"),
      hint: t("sidebar.emptyWorkspaceHint"),
    };
  }

  if (input.selectedFolderSystemType === "personal") {
    return {
      title: t("sidebar.emptyPersonalChats"),
      hint: t("sidebar.emptyPersonalChatsHint"),
    };
  }

  if (input.selectedFolderSystemType === "channels") {
    return {
      title: t("sidebar.emptyChannelList"),
      hint: t("sidebar.emptyChannelListHint"),
    };
  }

  return {
    title: t("sidebar.emptySelectedFolder"),
    hint: t("sidebar.emptySelectedFolderHint"),
  };
}

function WorkspaceSidebarTopicRow({
  topic,
  streamTitle,
  activeTopicUuid,
  compact,
}: Readonly<{
  topic: MessengerSidebarTopicItem;
  streamTitle: string;
  activeTopicUuid: string | null;
  compact: boolean;
}>): React.ReactElement {
  const isActive = activeTopicUuid === topic.topicUuid;

  return (
    <WorkspaceTopicContextMenu topic={topic} streamTitle={streamTitle}>
      <Link
        to={topic.route}
        className={`flex w-full min-w-0 items-stretch gap-3 rounded-r-lg border-l-4 border-indicator-yellow py-2 pl-3 pr-2 transition-colors ${sidebarRowClass(
          isActive,
        )}`}
      >
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-sm font-medium text-text-primary ${
              topic.isDone ? "line-through opacity-70" : ""
            }`}
          >
            {topic.title}
          </div>
          {!compact && (
            <SidebarMessagePreview
              senderName={topic.preview?.senderName}
              message={topic.preview?.text}
            />
          )}
        </div>
        <SidebarChatRowMeta
          compact={compact}
          isPinned={false}
          unreadCount={topic.unreadCount}
          hasMention={false}
          time={formatWorkspaceMessageTime(topic.lastMessageCreatedAt)}
        />
      </Link>
    </WorkspaceTopicContextMenu>
  );
}

const WorkspaceSidebarTopics = React.memo(function WorkspaceSidebarTopics({
  stream,
  activeTopicUuid,
  normalizedQuery,
  compact,
}: {
  stream: MessengerSidebarStreamItem;
  activeTopicUuid: string | null;
  normalizedQuery: string;
  compact: boolean;
}): React.ReactElement | null {
  const topics = useMemo(
    () => stream.topics.filter((topic) => workspaceTopicMatchesQuery(topic, normalizedQuery)),
    [normalizedQuery, stream.topics],
  );
  const { allTopicsVisible, hiddenCount, showToggle, visibleCount, toggleAllTopics } =
    useSidebarTopicCollapse(topics.length);
  const visibleTopics = topics.slice(0, visibleCount);

  if (topics.length === 0) return null;

  return (
    <>
      <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-transparent pl-2">
        {visibleTopics.map((topic) => (
          <WorkspaceSidebarTopicRow
            key={topic.id}
            topic={topic}
            streamTitle={stream.title}
            activeTopicUuid={activeTopicUuid}
            compact={compact}
          />
        ))}
      </div>
      {showToggle && (
        <SidebarTopicShowMoreButton
          expanded={allTopicsVisible}
          hiddenCount={hiddenCount}
          onToggle={toggleAllTopics}
        />
      )}
    </>
  );
});

function WorkspaceSidebarStreamRow({
  stream,
  expanded,
  activeStreamUuid,
  activeTopicUuid,
  normalizedQuery,
  compact,
  onToggleStream,
}: Readonly<{
  stream: MessengerSidebarStreamItem;
  expanded: boolean;
  activeStreamUuid: string | null;
  activeTopicUuid: string | null;
  normalizedQuery: string;
  compact: boolean;
  onToggleStream: (streamUuid: string) => void;
}>): React.ReactElement {
  const isActive = activeStreamUuid === stream.streamUuid && activeTopicUuid == null;
  const rowClass = sidebarChatRowLinkClass(compact, "stream");
  const avatarSize = compact ? "sm" : "md";
  const isDirectPrivate = stream.uiKind === "directPrivate";
  const avatarLabel = isDirectPrivate ? stream.title.slice(0, 1) : "#";
  const avatarStyle =
    !isDirectPrivate && stream.color != null
      ? { backgroundColor: `#${stream.color.toString(16).padStart(6, "0")}` }
      : undefined;
  const title = isDirectPrivate ? stream.title : `#${stream.title}`;
  const statusEmoji = isDirectPrivate ? (stream.statusEmoji ?? null) : null;
  const statusText =
    isDirectPrivate && stream.statusText != null && stream.statusText.trim().length > 0
      ? stream.statusText.trim()
      : null;

  return (
    <>
      <WorkspaceStreamContextMenu stream={stream}>
        <div
          className={`${rowClass} w-full ${
            expanded || isActive ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
          }`}
        >
          <Link
            to={stream.route}
            className="focus-visible:ring-border-strong relative shrink-0 focus-visible:outline-none focus-visible:ring-1"
            onClick={() => {
              if (!expanded) onToggleStream(stream.streamUuid);
            }}
          >
            <span className="relative shrink-0">
              <WorkspaceAvatar
                size={avatarSize}
                avatarUrn={isDirectPrivate ? stream.avatarUrl : null}
                style={avatarStyle}
              >
                {avatarLabel}
              </WorkspaceAvatar>
              {isDirectPrivate && (
                <PresenceIndicator
                  status={stream.presence ?? null}
                  size="sm"
                  pulse={false}
                  className="absolute bottom-0 right-0 ring-border-subtle"
                />
              )}
            </span>
          </Link>
          <div className={sidebarChatRowBodyClass(compact)}>
            <Link
              to={stream.route}
              className="focus-visible:ring-border-strong flex min-w-0 items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-1"
              onClick={() => {
                if (!expanded) onToggleStream(stream.streamUuid);
              }}
            >
              <div className="truncate text-sm font-medium text-text-primary">{title}</div>
              {statusEmoji != null ? <SidebarUserStatusEmoji statusEmoji={statusEmoji} /> : null}
              {statusText != null ? (
                <span className="truncate text-xs text-text-muted">{statusText}</span>
              ) : null}
            </Link>
            {!compact && stream.preview?.route != null && (
              <Link
                to={stream.preview.route}
                className="-ml-1.5 block min-w-0 rounded-md py-0.5 pl-1.5 pr-2 transition-colors hover:bg-bg-elevated focus-visible:bg-bg-elevated focus-visible:outline-none"
              >
                <SidebarMessagePreview
                  senderName={stream.preview.senderName}
                  message={stream.preview.text}
                />
              </Link>
            )}
          </div>
          <SidebarChatRowMeta
            compact={compact}
            isPinned={stream.pinnedAt != null}
            unreadCount={stream.unreadCount}
            hasMention={false}
            time={formatWorkspaceMessageTime(stream.lastMessageCreatedAt)}
            expandChevron={
              stream.topics.length > 0
                ? {
                    expanded,
                    onToggle: () => onToggleStream(stream.streamUuid),
                    ariaLabel: expanded ? t("a11y.collapseTopics") : t("a11y.expandTopics"),
                  }
                : undefined
            }
          />
        </div>
      </WorkspaceStreamContextMenu>
      {expanded && (
        <WorkspaceSidebarTopics
          stream={stream}
          activeTopicUuid={activeTopicUuid}
          normalizedQuery={normalizedQuery}
          compact={compact}
        />
      )}
    </>
  );
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  streams,
  loading,
  error,
  activityCounts,
  workspaceStreamCount,
  selectedFolderSystemType = null,
  activityPanelBottomSlot,
  onOpenCreateChat,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activityOpen = useSidebarConfigStore((s) => s.activityOpen);
  const setActivityOpen = useSidebarConfigStore((s) => s.setActivityOpen);
  const createChatOpen = useSidebarConfigStore((s) => s.createChatOpen);
  const setCreateChatOpen = useSidebarConfigStore((s) => s.setCreateChatOpen);
  const expandedStreamUuids = useSidebarConfigStore((s) => s.expandedStreamUuids);
  const toggleExpandedStreamUuid = useSidebarConfigStore((s) => s.toggleExpandedStreamUuid);
  const searchQuery = useSidebarConfigStore((s) => s.searchQuery);
  const setSearchQuery = useSidebarConfigStore((s) => s.setSearchQuery);
  const compact = useSettingsStore((s) => s.chatListDensity === "compact");
  const routeMatch = useMemo(
    () => parseWorkspaceMessengerRoute(location.pathname),
    [location.pathname],
  );
  // Active rows are matched by Workspace UUIDs from the URL, not old Zulip slugs or ids.
  const activeStreamUuid =
    routeMatch?.kind === "stream" || routeMatch?.kind === "topic" ? routeMatch.streamUuid : null;
  const activeTopicUuid = routeMatch?.kind === "topic" ? routeMatch.topicUuid : null;
  const normalizedQuery = useMemo(() => normalizeSidebarSearchQuery(searchQuery), [searchQuery]);
  const filteredStreams = useMemo(
    // Search is local: it filters the loaded list and does not call the API.
    () => streams.filter((stream) => workspaceStreamMatchesQuery(stream, normalizedQuery)),
    [normalizedQuery, streams],
  );
  const emptyState = useMemo(
    () =>
      resolveWorkspaceSidebarEmptyState({
        normalizedQuery,
        workspaceStreamCount,
        selectedFolderSystemType,
      }),
    [normalizedQuery, selectedFolderSystemType, workspaceStreamCount],
  );
  const hasSpecificEmptyContext = normalizedQuery.length > 0 || workspaceStreamCount > 0;
  const showNonBlockingError =
    error != null && (filteredStreams.length > 0 || hasSpecificEmptyContext);
  const showBlockingError =
    error != null && filteredStreams.length === 0 && !hasSpecificEmptyContext;
  const showEmptyState =
    !loading && filteredStreams.length === 0 && (error == null || hasSpecificEmptyContext);
  const handleToggleActivity = useCallback(
    () => setActivityOpen(!activityOpen),
    [activityOpen, setActivityOpen],
  );
  const handleOpenCreateChat = useCallback(() => {
    setCreateChatOpen(true);
  }, [setCreateChatOpen]);
  const handleWorkspaceStreamCreated = useCallback(
    (streamUuid: string) => {
      if (routeMatch == null) return;
      setCreateChatOpen(false);
      void navigate(
        workspaceMessengerStreamRoute({
          orgId: routeMatch.orgId,
          projectId: routeMatch.projectId,
          streamUuid,
        }),
      );
    },
    [navigate, routeMatch, setCreateChatOpen],
  );
  const handleWorkspaceTopicCreated = useCallback(
    (streamUuid: string, topicUuid: string) => {
      if (routeMatch == null) return;
      setCreateChatOpen(false);
      void navigate(
        workspaceMessengerTopicRoute({
          orgId: routeMatch.orgId,
          projectId: routeMatch.projectId,
          streamUuid,
          topicUuid,
        }),
      );
    },
    [navigate, routeMatch, setCreateChatOpen],
  );

  return (
    <aside
      className="flex min-h-0 w-full min-w-0 flex-shrink-0 overflow-hidden rounded-xl bg-sidebar-bg"
      data-focus-zone="sidebar"
      role="navigation"
      aria-label="Chat list"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="flex-1" data-sidebar-scroll>
          <SidebarSearchHeader
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onOpenCreateChat={onOpenCreateChat ?? handleOpenCreateChat}
          />
          <WorkspaceSidebarActivity
            open={activityOpen}
            onToggle={handleToggleActivity}
            counts={activityCounts}
          />
          {activityPanelBottomSlot != null && (
            <>
              {activityPanelBottomSlot}
              <div className="my-2">
                <div className="bg-border-subtle/70 h-px" />
              </div>
            </>
          )}
          {loading && filteredStreams.length === 0 ? (
            <div className="px-3 py-4">
              <div
                className="bg-bg-elevated/40 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-subtle px-3 py-6 text-center"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <Spinner size="lg" className="shrink-0" />
                <p className="text-sm text-text-muted">{t("app.loading")}</p>
              </div>
            </div>
          ) : null}
          {showBlockingError ? (
            <div className="px-3 py-4">
              <div className="bg-bg-elevated/40 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle px-3 py-5 text-center">
                <Icon name="info" size={18} className="text-notice-base" />
                <p className="text-sm font-medium text-text-primary">{t("app.error")}</p>
                <p className="max-w-[220px] text-xs text-text-muted">{error}</p>
              </div>
            </div>
          ) : null}
          {showNonBlockingError ? (
            <div className="px-3 pb-2">
              <div className="bg-bg-elevated/60 flex items-start gap-2 rounded-lg border border-border-subtle px-3 py-2">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-notice-base" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary">
                    {t("sidebar.partialLoadError")}
                  </p>
                  <p className="truncate text-xs text-text-muted">{error}</p>
                </div>
              </div>
            </div>
          ) : null}
          {showEmptyState ? (
            <div className="px-3 py-4">
              <div className="bg-bg-elevated/40 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle px-3 py-5 text-center">
                <Icon name="chatBubble" size={18} className="text-text-muted" />
                <p className="text-sm font-medium text-text-primary">{emptyState.title}</p>
                <p className="max-w-[220px] text-xs text-text-muted">{emptyState.hint}</p>
              </div>
            </div>
          ) : null}
          {filteredStreams.length > 0 ? (
            <div className="space-y-0.5 px-2">
              {filteredStreams.map((stream) => (
                <WorkspaceSidebarStreamRow
                  key={stream.id}
                  stream={stream}
                  expanded={expandedStreamUuids.includes(stream.streamUuid)}
                  activeStreamUuid={activeStreamUuid}
                  activeTopicUuid={activeTopicUuid}
                  normalizedQuery={normalizedQuery}
                  compact={compact}
                  onToggleStream={toggleExpandedStreamUuid}
                />
              ))}
            </div>
          ) : null}
        </ScrollArea>
        <CreateChatDialog
          open={createChatOpen}
          onOpenChange={setCreateChatOpen}
          visibleTabs={WORKSPACE_CREATE_CHAT_VISIBLE_TABS}
          onNavigateWorkspaceStream={handleWorkspaceStreamCreated}
          onNavigateWorkspaceTopic={handleWorkspaceTopicCreated}
          onChannelCreated={() => setCreateChatOpen(false)}
        />
      </div>
    </aside>
  );
};
