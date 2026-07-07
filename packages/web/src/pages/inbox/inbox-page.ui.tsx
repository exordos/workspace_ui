import React, { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  selectMessengerSidebarStreams,
  type MessengerSidebarStreamsState,
} from "~/entities/messenger/messenger-sidebar.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
} from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";

const EMPTY_WORKSPACE_STREAMS: MessengerSidebarStreamItem[] = [];
const INBOX_STATE_CARD_CLASS =
  "m-3 rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";
const INBOX_ROW_CLASS =
  "group flex w-full items-center gap-2 rounded-xl border border-border-subtle bg-bg-elevated/50 p-2.5 text-left transition-colors hover:border-accent-soft/40 hover:bg-card-bg";

interface InboxDisplayRow {
  id: string;
  title: string;
  unreadCount: number;
  route: string;
  updatedAt: string;
  uiKind: MessengerSidebarStreamItem["uiKind"];
}

interface InboxStreamGroup {
  stream: MessengerSidebarStreamItem;
  rows: InboxDisplayRow[];
}

function formatWorkspaceTimestamp(value: string): string {
  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) return "";
  return formatMessageTimeShort(Math.floor(timestampMs / 1000));
}

function hasUnread(stream: MessengerSidebarStreamItem): boolean {
  return stream.unreadCount > 0 || stream.topics.some((topic) => topic.unreadCount > 0);
}

function topicRow(
  stream: MessengerSidebarStreamItem,
  topic: MessengerSidebarTopicItem,
): InboxDisplayRow {
  const topicTitle = topic.title.trim().length > 0 ? topic.title.trim() : t("inbox.allMessages");
  const streamTitle = stream.uiKind === "directPrivate" ? stream.title : `#${stream.title}`;
  return {
    id: topic.id,
    title: `${streamTitle} · ${topicTitle}`,
    unreadCount: topic.unreadCount,
    route: topic.route,
    updatedAt: topic.updatedAt,
    uiKind: stream.uiKind,
  };
}

function fallbackStreamRow(stream: MessengerSidebarStreamItem): InboxDisplayRow {
  return {
    id: stream.id,
    title: stream.uiKind === "directPrivate" ? stream.title : `#${stream.title}`,
    unreadCount: stream.unreadCount,
    route: stream.route,
    updatedAt: stream.updatedAt,
    uiKind: stream.uiKind,
  };
}

function buildInboxStreamGroup(stream: MessengerSidebarStreamItem): InboxStreamGroup {
  const unreadTopicRows = stream.topics
    .filter((topic) => topic.unreadCount > 0)
    .map((topic) => topicRow(stream, topic));
  const rows =
    unreadTopicRows.length > 0 || stream.unreadCount === 0
      ? unreadTopicRows
      : [fallbackStreamRow(stream)];
  return { stream, rows };
}

const InboxRow = React.memo<{
  row: InboxDisplayRow;
  onNavigate: (route: string) => void;
}>(({ row, onNavigate }) => {
  const handleClick = useCallback(() => {
    onNavigate(row.route);
  }, [onNavigate, row.route]);
  const timeLabel = formatWorkspaceTimestamp(row.updatedAt);
  const isDirect = row.uiKind === "directPrivate";

  return (
    <li>
      <button type="button" onClick={handleClick} className={INBOX_ROW_CLASS}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted transition-colors group-hover:text-text-primary">
          <Icon name={isDirect ? "profile" : "channels"} size={18} className="shrink-0" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{row.title}</p>
          {timeLabel.length > 0 && (
            <p className="mt-0.5 text-[11px] text-text-muted">{timeLabel}</p>
          )}
        </div>
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-badge-bg px-1 text-[11px] font-medium text-badge-text">
          {row.unreadCount}
        </span>
      </button>
    </li>
  );
});
InboxRow.displayName = "InboxRow";

const InboxStreamCard = React.memo<{
  group: InboxStreamGroup;
  onNavigate: (route: string) => void;
}>(({ group, onNavigate }) => {
  const { stream, rows } = group;
  const isDirect = stream.uiKind === "directPrivate";
  const title = isDirect ? stream.title : `#${stream.title}`;

  return (
    <div className="bg-bg-elevated/45 rounded-xl border border-border-subtle p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted">
            <Icon name={isDirect ? "profile" : "channels"} size={16} className="shrink-0" />
          </span>
          <span className="truncate text-sm font-semibold text-text-primary">{title}</span>
        </div>
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-badge-bg px-1 text-[11px] font-medium text-badge-text">
          {stream.unreadCount}
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <InboxRow key={row.id} row={row} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
});
InboxStreamCard.displayName = "InboxStreamCard";

export const InboxPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const openSearch = useOpenSearch();
  const workspaceRoute = useMemo(
    () => parseWorkspaceMessengerRoute(location.pathname),
    [location.pathname],
  );
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const workspaceRuntimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const currentUserUuid = workspaceRuntimeContext?.userUuid ?? null;
  const workspaceIdentity = useMemo(() => {
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
  const messagesById = useWorkspaceMessageStore((state) => state.messagesById);
  const usersById = useUsersStore((state) => state.usersById);
  const streamIds = useMessengerStore((state) => state.streamIds);
  const streamsById = useMessengerStore((state) => state.streamsById);
  const topicIds = useMessengerStore((state) => state.topicIds);
  const topicsById = useMessengerStore((state) => state.topicsById);
  const foldersById = useMessengerStore((state) => state.foldersById);
  const conversationsById = useMessengerStore((state) => state.conversationsById);
  const messengerSidebarState = useMemo<MessengerSidebarStreamsState>(
    () => ({
      streamIds,
      streamsById,
      topicIds,
      topicsById,
      foldersById,
      conversationsById,
    }),
    [conversationsById, foldersById, streamIds, streamsById, topicIds, topicsById],
  );
  const loading = useMessengerStore((state) => state.isLoading);
  const error = useMessengerStore((state) => state.error);
  const streams = useMemo(
    () =>
      workspaceIdentity != null
        ? selectMessengerSidebarStreams(messengerSidebarState, {
            organizationId: workspaceIdentity.organizationId,
            projectId: workspaceIdentity.projectId,
            currentUserUuid,
            messagesById,
            usersById,
          })
        : EMPTY_WORKSPACE_STREAMS,
    [currentUserUuid, messagesById, messengerSidebarState, usersById, workspaceIdentity],
  );
  const unreadGroups = useMemo(
    () => streams.filter(hasUnread).map(buildInboxStreamGroup),
    [streams],
  );
  const personalGroups = useMemo(
    () => unreadGroups.filter((group) => group.stream.uiKind === "directPrivate"),
    [unreadGroups],
  );
  const channelGroups = useMemo(
    () => unreadGroups.filter((group) => group.stream.uiKind !== "directPrivate"),
    [unreadGroups],
  );

  const handleNavigate = useCallback(
    (route: string) => {
      void navigate(route);
    },
    [navigate],
  );

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <ChatHeader
        channelName={t("inbox.title")}
        hideTopic
        hideParticipants
        onOpenSearch={openSearch ?? undefined}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading && unreadGroups.length === 0 && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-text-muted`}>{t("app.loading")}</div>
        )}
        {!loading && error && unreadGroups.length === 0 && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-notice-base`}>{t("inbox.loadError")}</div>
        )}
        {!loading && !error && unreadGroups.length === 0 && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-text-muted`}>{t("inbox.noUnread")}</div>
        )}
        {unreadGroups.length > 0 && (
          <div className="relative flex flex-1 flex-col overflow-auto px-3 pb-3 pt-2">
            {personalGroups.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="flex items-center gap-2 px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("inbox.dm")}
                  <span className="bg-border-subtle/60 h-px flex-1" />
                </h3>
                <div className="space-y-2.5">
                  {personalGroups.map((group) => (
                    <InboxStreamCard
                      key={group.stream.id}
                      group={group}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </section>
            )}

            {channelGroups.length > 0 && (
              <section className="mt-4 space-y-2">
                <h3 className="flex items-center gap-2 px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("inbox.channels")}
                  <span className="bg-border-subtle/60 h-px flex-1" />
                </h3>
                <div className="space-y-2.5">
                  {channelGroups.map((group) => (
                    <InboxStreamCard
                      key={group.stream.id}
                      group={group}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
