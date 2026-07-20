import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchWorkspaceStarredMessages } from "~/entities/activity/activity-workspace-starred.api";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { isAbortError } from "~/shared/lib/abort-error";
import { formatActivityItemTime } from "~/shared/lib/datetime.lib";
import { createLogger } from "~/shared/lib/logger";
import type { WorkspaceMessageSummaryOptions } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import {
  workspaceActivityRoute,
  workspaceMessengerMessageRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { MY_ACTIVITY } from "~/widgets/sidebar/sidebar.lib";
import { WorkspaceDraftsPage } from "./workspace-drafts-page.ui";

const log = createLogger("activity-page");

type ActivityPageFilter = "starred" | "mentions" | "reactions" | "drafts";

const ALL_FILTERS = ["starred", "mentions", "reactions", "drafts"] as const;
const EMPTY_WORKSPACE_STARRED_MESSAGES: WorkspaceMessengerMessageDto[] = [];
const ACTIVITY_WORKSPACE_SUMMARY_OPTIONS = {
  maxLength: 80,
  includeMediaLabel: true,
  includeAttachmentLabel: true,
  includeQuotePrefix: true,
} as const satisfies WorkspaceMessageSummaryOptions;

interface WorkspaceStarredState {
  ownerKey: string | null;
  messages: WorkspaceMessengerMessageDto[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
}

function getActivityTitle(filter: ActivityPageFilter): string {
  const item = MY_ACTIVITY.find(
    (i) =>
      (filter === "starred" && i.key === "favorites") ||
      (filter === "mentions" && i.key === "mentions") ||
      (filter === "reactions" && i.key === "reactions") ||
      (filter === "drafts" && i.key === "drafts"),
  );
  return item ? t(item.labelKey) : filter;
}

function getUnsupportedMessage(filter: Exclude<ActivityPageFilter, "starred">): string {
  if (filter === "mentions") return t("workspaceMessenger.mentionsUnsupported");
  if (filter === "reactions") return t("workspaceMessenger.reactionsUnsupported");
  return t("workspaceMessenger.draftsUnsupported");
}

function truncateText(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function formatWorkspaceItemTime(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return "";
  return formatActivityItemTime(Math.floor(parsed / 1000));
}

function isRuntimeContextCurrent(runtimeContext: WorkspaceRuntimeContext): boolean {
  return isWorkspaceRuntimeRequestContextCurrent(runtimeContext, () =>
    useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  );
}

function ActivityWorkspaceSenderName({
  authorUuid,
  fallback,
}: Readonly<{
  authorUuid: string;
  fallback: string;
}>) {
  const user = useUsersStore((s) => s.usersById[authorUuid]);
  return <>{selectUserDisplayName(user, fallback)}</>;
}

function ActivityUnsupportedState({
  filter,
}: Readonly<{ filter: Exclude<ActivityPageFilter, "starred"> }>) {
  return (
    <div className="flex min-h-0 flex-1 items-start p-4 text-sm text-text-muted">
      {getUnsupportedMessage(filter)}
    </div>
  );
}

export const ActivityPage: React.FC = () => {
  const { filter, orgId, projectId } = useParams<{
    filter: string;
    orgId?: string;
    projectId?: string;
  }>();
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const ownerKey = useMemo(
    () => (runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext)),
    [runtimeContext],
  );
  const workspaceStreamsById = useMessengerStore((s) => s.streamsById);
  const workspaceTopicsById = useMessengerStore((s) => s.topicsById);
  const openWorkspaceForward = useWorkspaceForwardMessageStore((s) => s.open);
  const [workspaceStarredState, setWorkspaceStarredState] = useState<WorkspaceStarredState>({
    ownerKey: null,
    messages: EMPTY_WORKSPACE_STARRED_MESSAGES,
    isInitialLoading: false,
    isRefreshing: false,
  });
  const listScrollRef = useRef<HTMLUListElement>(null);
  const initialScrollPositionKeyRef = useRef<string | null>(null);

  const validFilter: ActivityPageFilter | null =
    filter && (ALL_FILTERS as readonly string[]).includes(filter)
      ? (filter as ActivityPageFilter)
      : null;
  const workspaceStarredMessages =
    workspaceStarredState.ownerKey === ownerKey
      ? workspaceStarredState.messages
      : EMPTY_WORKSPACE_STARRED_MESSAGES;
  const loading =
    validFilter === "starred" &&
    workspaceStarredState.ownerKey === ownerKey &&
    workspaceStarredState.isInitialLoading;
  const isRefreshing =
    validFilter === "starred" &&
    workspaceStarredState.ownerKey === ownerKey &&
    workspaceStarredState.isRefreshing;
  const initialScrollPositionKey =
    validFilter != null ? `${ownerKey ?? "none"}:${validFilter}` : null;

  useEffect(() => {
    if (!validFilter) {
      if (orgId != null && projectId != null) {
        void navigate(workspaceActivityRoute({ orgId, projectId, filter: "mentions" }), {
          replace: true,
        });
      } else {
        void navigate("/", { replace: true });
      }
    }
  }, [navigate, orgId, projectId, validFilter]);

  useEffect(() => {
    if (validFilter !== "starred") return;

    if (runtimeContext == null || ownerKey == null) return;

    const controller = new AbortController();
    setWorkspaceStarredState((current) => ({
      ownerKey,
      messages: current.ownerKey === ownerKey ? current.messages : EMPTY_WORKSPACE_STARRED_MESSAGES,
      isInitialLoading: current.ownerKey !== ownerKey || current.messages.length === 0,
      isRefreshing: current.ownerKey === ownerKey && current.messages.length > 0,
    }));

    const requestRuntimeContext = runtimeContext;
    void fetchWorkspaceStarredMessages({
      runtimeContext: requestRuntimeContext,
      signal: controller.signal,
    })
      .then((page) => {
        if (controller.signal.aborted || !isRuntimeContextCurrent(requestRuntimeContext)) return;
        setWorkspaceStarredState({
          ownerKey,
          messages: page.messages,
          isInitialLoading: false,
          isRefreshing: false,
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (!isRuntimeContextCurrent(requestRuntimeContext)) return;
        setWorkspaceStarredState((current) => ({
          ownerKey,
          messages:
            current.ownerKey === ownerKey ? current.messages : EMPTY_WORKSPACE_STARRED_MESSAGES,
          isInitialLoading: false,
          isRefreshing: false,
        }));
        log.error("Failed to load Workspace starred activity", { error: String(error) });
      });

    return () => {
      controller.abort();
    };
  }, [ownerKey, runtimeContext, validFilter]);

  useLayoutEffect(() => {
    if (initialScrollPositionKey == null) {
      initialScrollPositionKeyRef.current = null;
      return;
    }
    if (loading || workspaceStarredMessages.length === 0) return;
    if (initialScrollPositionKeyRef.current === initialScrollPositionKey) return;
    const el = listScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    initialScrollPositionKeyRef.current = initialScrollPositionKey;
  }, [initialScrollPositionKey, loading, workspaceStarredMessages.length]);

  const handleWorkspaceMessageForward = useCallback(
    (messageUuid: string) => {
      openWorkspaceForward({ messageUuids: [messageUuid] });
    },
    [openWorkspaceForward],
  );

  const handleWorkspaceMessageClick = useCallback(
    (m: WorkspaceMessengerMessageDto) => {
      if (runtimeContext == null) return;
      void navigate(
        workspaceMessengerMessageRoute({
          orgId: runtimeContext.organizationId,
          projectId: runtimeContext.projectId,
          messageUuid: m.uuid,
        }),
      );
    },
    [navigate, runtimeContext],
  );

  if (!validFilter) return null;

  const title = getActivityTitle(validFilter);

  const renderActivityContent = () => {
    if (validFilter === "drafts") {
      return <WorkspaceDraftsPage />;
    }
    if (validFilter !== "starred") {
      return <ActivityUnsupportedState filter={validFilter} />;
    }
    if (loading) {
      return <div className="p-4 text-sm text-text-muted">{t("app.loading")}</div>;
    }
    if (runtimeContext == null) {
      return (
        <div className="p-4 text-sm text-text-muted">
          {t("workspaceMessenger.runtimeUnavailable")}
        </div>
      );
    }
    if (workspaceStarredMessages.length === 0) {
      return <div className="p-4 text-sm text-text-muted">{t("chat.noMessages")}</div>;
    }
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ul
          ref={listScrollRef}
          className="flex min-h-0 flex-1 flex-col space-y-1 overflow-auto scroll-auto p-2"
        >
          {workspaceStarredMessages.map((m) => {
            const stream = workspaceStreamsById[m.stream_uuid];
            const topic = workspaceTopicsById[m.topic_uuid];
            const streamName = stream?.name.trim() ?? "";
            const topicName = topic?.name.trim() ?? "";
            const isPrivate = stream?.isPrivate ?? false;
            const privateContext =
              isPrivate && streamName.length > 0 ? `${t("dm.private")} · ${streamName}` : null;
            const preview = summarizeWorkspaceMessageMarkdown(
              m.payload.content,
              ACTIVITY_WORKSPACE_SUMMARY_OPTIONS,
            ).text;

            return (
              <li key={m.uuid}>
                <div className="group flex items-start gap-2 rounded-lg p-3 transition-colors hover:bg-card-bg">
                  <button
                    type="button"
                    onClick={() => handleWorkspaceMessageClick(m)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {formatWorkspaceItemTime(m.created_at)}
                      </span>
                      {streamName.length > 0 && !isPrivate ? (
                        <span className="truncate text-[11px] text-text-muted">
                          <span>{`#${streamName}`}</span>
                          {topicName.length > 0 ? <span>{` · ${topicName}`}</span> : null}
                        </span>
                      ) : null}
                      {privateContext != null ? (
                        <span className="truncate text-[11px] text-text-muted">
                          {privateContext}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-sidebar-sender">
                      <ActivityWorkspaceSenderName authorUuid={m.author_uuid} fallback="" />
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-text-primary">
                      {truncateText(preview)}
                    </p>
                  </button>
                  <div className="mt-0.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleWorkspaceMessageClick(m)}
                      className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
                      aria-label={t("message.openInChat")}
                      title={t("message.openInChat")}
                    >
                      <Icon name="newWindow" size={16} className="text-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWorkspaceMessageForward(m.uuid)}
                      className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
                      aria-label={t("message.forward")}
                      title={t("message.forward")}
                    >
                      <Icon name="send" size={16} className="text-current" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <FloatingLoadingOverlay visible={isRefreshing} />
      </div>
    );
  };

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <ChatHeader
        channelName={title}
        hideTopic
        hideParticipants
        onOpenSearch={openSearch ?? undefined}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {renderActivityContent()}
      </section>
    </div>
  );
};
