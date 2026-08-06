import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchMyMentionsPage } from "~/entities/activity/activity-mentions.api";
import { fetchWorkspaceStarredMessages } from "~/entities/activity/activity-workspace-starred.api";
import { adaptMessengerMessage } from "~/entities/messenger/messenger-adapters.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
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
import { useOpenSearch } from "~/shared/contexts/open-search";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger } from "~/shared/lib/logger";
import { computeScrollTopAfterPrepend } from "~/shared/lib/scroll-prepend-anchor.lib";
import {
  workspaceActivityRoute,
  workspaceMessengerMessageRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { ChatChannelHeader } from "~/widgets/chat-view/chat-header-channel.ui";
import { MY_ACTIVITY } from "~/widgets/sidebar/sidebar.lib";
import { ActivityMessageList } from "./activity-message-list.ui";
import { WorkspaceDraftsPage } from "./workspace-drafts-page.ui";

const log = createLogger("activity-page");

type ActivityPageFilter = "starred" | "mentions" | "reactions" | "drafts";
type ActivityMessageFilter = Extract<ActivityPageFilter, "starred" | "mentions">;

const ALL_FILTERS = ["starred", "mentions", "reactions", "drafts"] as const;
const ACTIVITY_PAGE_SIZE = 50;
const ACTIVITY_TOP_PAGINATION_THRESHOLD_PX = 64;
const ACTIVITY_TOP_PAGINATION_REARM_THRESHOLD_PX = 96;
const ACTIVITY_BOTTOM_PAGINATION_THRESHOLD_PX = 64;
const ACTIVITY_BOTTOM_PAGINATION_REARM_THRESHOLD_PX = 96;
const EMPTY_ACTIVITY_MESSAGES: MessengerMessage[] = [];

interface ActivityMessagesState {
  collectionKey: string | null;
  messages: MessengerMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: boolean;
  paginationError: boolean;
}

function getActivityTitle(filter: ActivityPageFilter): string {
  const item = MY_ACTIVITY.find(
    (i) =>
      (filter === "starred" && i.key === "markedMessages") ||
      (filter === "mentions" && i.key === "mentions") ||
      (filter === "reactions" && i.key === "reactions") ||
      (filter === "drafts" && i.key === "drafts"),
  );
  return item ? t(item.labelKey) : filter;
}

function getUnsupportedMessage(): string {
  return t("workspaceMessenger.reactionsUnsupported");
}

function isRuntimeContextCurrent(runtimeContext: WorkspaceRuntimeContext): boolean {
  return isWorkspaceRuntimeRequestContextCurrent(runtimeContext, () =>
    useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  );
}

function compareActivityMessages(left: MessengerMessage, right: MessengerMessage): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  return createdAtOrder !== 0 ? createdAtOrder : left.uuid.localeCompare(right.uuid);
}

type ActivityMessageOrder = "oldest-first" | "newest-first";

function sortUniqueActivityMessages(
  messages: readonly MessengerMessage[],
  order: ActivityMessageOrder = "oldest-first",
): MessengerMessage[] {
  const byUuid = new Map<string, MessengerMessage>();
  for (const message of messages) {
    byUuid.set(message.uuid, message);
  }
  const sortedMessages = [...byUuid.values()].sort(compareActivityMessages);
  return order === "newest-first" ? sortedMessages.reverse() : sortedMessages;
}

function ActivityUnsupportedState() {
  return (
    <div className="flex min-h-0 flex-1 items-start p-4 text-sm text-text-muted">
      {getUnsupportedMessage()}
    </div>
  );
}

async function fetchActivityMessagesPage({
  filter,
  runtimeContext,
  cursor,
  signal,
}: {
  filter: ActivityMessageFilter;
  runtimeContext: WorkspaceRuntimeContext;
  cursor?: string;
  signal: AbortSignal;
}): Promise<{ messages: MessengerMessage[]; nextCursor: string | null; hasMore: boolean }> {
  if (filter === "mentions") {
    return fetchMyMentionsPage({
      runtimeContext,
      pageSize: ACTIVITY_PAGE_SIZE,
      ...(cursor == null ? {} : { cursor }),
      signal,
    });
  }

  const page = await fetchWorkspaceStarredMessages({
    runtimeContext,
    pageLimit: ACTIVITY_PAGE_SIZE,
    ...(cursor == null ? {} : { pageMarker: cursor }),
    signal,
  });
  return {
    messages: page.messages.map(adaptMessengerMessage),
    nextCursor: page.nextPageMarker,
    hasMore: page.hasMore,
  };
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
  const [activityMessagesState, setActivityMessagesState] = useState<ActivityMessagesState>({
    collectionKey: null,
    messages: EMPTY_ACTIVITY_MESSAGES,
    nextCursor: null,
    hasMore: false,
    isInitialLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    error: false,
    paginationError: false,
  });
  const [reloadVersion, setReloadVersion] = useState(0);
  const listScrollRef = useRef<HTMLUListElement>(null);
  const initialScrollPositionKeyRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const paginationArmedRef = useRef(true);

  const validFilter: ActivityPageFilter | null =
    filter && (ALL_FILTERS as readonly string[]).includes(filter)
      ? (filter as ActivityPageFilter)
      : null;
  const activityMessageFilter: ActivityMessageFilter | null =
    validFilter === "starred" || validFilter === "mentions" ? validFilter : null;
  const collectionKey =
    ownerKey != null && activityMessageFilter != null
      ? `${ownerKey}:activity:${activityMessageFilter}`
      : null;
  const stateBelongsToCollection =
    collectionKey != null && activityMessagesState.collectionKey === collectionKey;
  const activityMessages = stateBelongsToCollection
    ? activityMessagesState.messages
    : EMPTY_ACTIVITY_MESSAGES;
  const isInitialLoading =
    activityMessageFilter != null &&
    runtimeContext != null &&
    (!stateBelongsToCollection || activityMessagesState.isInitialLoading);
  const isRefreshing = stateBelongsToCollection && activityMessagesState.isRefreshing;
  const isLoadingMore = stateBelongsToCollection && activityMessagesState.isLoadingMore;
  const hasMore = stateBelongsToCollection && activityMessagesState.hasMore;
  const nextCursor = stateBelongsToCollection ? activityMessagesState.nextCursor : null;
  const hasLoadError = stateBelongsToCollection && activityMessagesState.error;
  const hasPaginationError = stateBelongsToCollection && activityMessagesState.paginationError;
  const activityMessageOrder: ActivityMessageOrder =
    activityMessageFilter != null ? "newest-first" : "oldest-first";
  const isNewestFirst = activityMessageOrder === "newest-first";

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
    if (activityMessageFilter == null || runtimeContext == null || collectionKey == null) {
      return;
    }

    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
    pendingScrollRestoreRef.current = null;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    queueMicrotask(() => {
      if (
        controller.signal.aborted ||
        requestVersionRef.current !== requestVersion ||
        !isRuntimeContextCurrent(runtimeContext)
      ) {
        return;
      }
      setActivityMessagesState((current) => {
        const hasCurrentMessages =
          current.collectionKey === collectionKey && current.messages.length > 0;
        return {
          collectionKey,
          messages: hasCurrentMessages ? current.messages : EMPTY_ACTIVITY_MESSAGES,
          nextCursor: hasCurrentMessages ? current.nextCursor : null,
          hasMore: hasCurrentMessages && current.hasMore,
          isInitialLoading: !hasCurrentMessages,
          isRefreshing: hasCurrentMessages,
          isLoadingMore: false,
          error: false,
          paginationError: false,
        };
      });
    });

    const requestRuntimeContext = runtimeContext;
    void fetchActivityMessagesPage({
      filter: activityMessageFilter,
      runtimeContext: requestRuntimeContext,
      signal: controller.signal,
    })
      .then((page) => {
        if (
          controller.signal.aborted ||
          requestVersionRef.current !== requestVersion ||
          !isRuntimeContextCurrent(requestRuntimeContext)
        ) {
          return;
        }
        setActivityMessagesState((current) => {
          if (current.collectionKey !== collectionKey) return current;
          return {
            collectionKey,
            messages: sortUniqueActivityMessages(page.messages, activityMessageOrder),
            nextCursor: page.nextCursor,
            hasMore: page.hasMore,
            isInitialLoading: false,
            isRefreshing: false,
            isLoadingMore: false,
            error: false,
            paginationError: false,
          };
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (
          requestVersionRef.current !== requestVersion ||
          !isRuntimeContextCurrent(requestRuntimeContext)
        ) {
          return;
        }
        setActivityMessagesState((current) => {
          if (current.collectionKey !== collectionKey) return current;
          return {
            ...current,
            isInitialLoading: false,
            isRefreshing: false,
            error: true,
          };
        });
        log.error("Failed to load Workspace activity messages", {
          filter: activityMessageFilter,
          error: String(error),
        });
      });

    return () => {
      controller.abort();
      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;
    };
  }, [activityMessageFilter, activityMessageOrder, collectionKey, reloadVersion, runtimeContext]);

  useLayoutEffect(() => {
    if (collectionKey == null) {
      initialScrollPositionKeyRef.current = null;
      return;
    }
    if (isInitialLoading || activityMessages.length === 0) return;
    if (initialScrollPositionKeyRef.current === collectionKey) return;
    const el = listScrollRef.current;
    if (!el) return;
    el.scrollTop = isNewestFirst ? 0 : el.scrollHeight;
    initialScrollPositionKeyRef.current = collectionKey;
    paginationArmedRef.current = true;
  }, [activityMessages.length, collectionKey, isInitialLoading, isNewestFirst]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (isNewestFirst || pending == null || isLoadingMore) return;
    const el = listScrollRef.current;
    if (!el) return;
    el.scrollTop = computeScrollTopAfterPrepend(pending, el.scrollHeight);
    pendingScrollRestoreRef.current = null;
  }, [activityMessages.length, isLoadingMore, isNewestFirst]);

  const handleWorkspaceMessageForward = useCallback(
    (messageUuid: string) => {
      openWorkspaceForward({ messageUuids: [messageUuid] });
    },
    [openWorkspaceForward],
  );

  const handleWorkspaceMessageClick = useCallback(
    (message: MessengerMessage) => {
      if (runtimeContext == null) return;
      void navigate(
        workspaceMessengerMessageRoute({
          orgId: runtimeContext.organizationId,
          projectId: runtimeContext.projectId,
          messageUuid: message.uuid,
        }),
      );
    },
    [navigate, runtimeContext],
  );

  const handleLoadMore = useCallback(() => {
    if (
      activityMessageFilter == null ||
      runtimeContext == null ||
      collectionKey == null ||
      nextCursor == null ||
      !hasMore ||
      isInitialLoading ||
      isRefreshing ||
      isLoadingMore ||
      loadMoreAbortRef.current != null
    ) {
      return;
    }

    const list = listScrollRef.current;
    if (list != null && !isNewestFirst) {
      pendingScrollRestoreRef.current = {
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
      };
    }

    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    const requestRuntimeContext = runtimeContext;
    const requestCollectionKey = collectionKey;
    const requestCursor = nextCursor;
    const requestVersion = requestVersionRef.current;
    setActivityMessagesState((current) =>
      current.collectionKey === requestCollectionKey &&
      current.nextCursor === requestCursor &&
      !current.isLoadingMore
        ? { ...current, isLoadingMore: true, paginationError: false }
        : current,
    );

    void fetchActivityMessagesPage({
      filter: activityMessageFilter,
      runtimeContext: requestRuntimeContext,
      cursor: requestCursor,
      signal: controller.signal,
    })
      .then((page) => {
        if (
          controller.signal.aborted ||
          requestVersionRef.current !== requestVersion ||
          !isRuntimeContextCurrent(requestRuntimeContext)
        ) {
          return;
        }
        setActivityMessagesState((current) => {
          if (
            current.collectionKey !== requestCollectionKey ||
            current.nextCursor !== requestCursor
          ) {
            return current;
          }
          return {
            ...current,
            messages: sortUniqueActivityMessages(
              [...current.messages, ...page.messages],
              activityMessageOrder,
            ),
            nextCursor: page.nextCursor,
            hasMore: page.hasMore,
            isLoadingMore: false,
            paginationError: false,
          };
        });
        loadMoreAbortRef.current = null;
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (
          requestVersionRef.current !== requestVersion ||
          !isRuntimeContextCurrent(requestRuntimeContext)
        ) {
          return;
        }
        setActivityMessagesState((current) =>
          current.collectionKey === requestCollectionKey && current.nextCursor === requestCursor
            ? { ...current, isLoadingMore: false, paginationError: true }
            : current,
        );
        pendingScrollRestoreRef.current = null;
        loadMoreAbortRef.current = null;
        log.error("Failed to load older Workspace activity messages", {
          filter: activityMessageFilter,
          error: String(error),
        });
      });
  }, [
    activityMessageFilter,
    activityMessageOrder,
    collectionKey,
    hasMore,
    isInitialLoading,
    isLoadingMore,
    isRefreshing,
    nextCursor,
    runtimeContext,
    isNewestFirst,
  ]);

  const handleListScroll = useCallback(
    (event: React.UIEvent<HTMLUListElement>) => {
      const scrollTop = event.currentTarget.scrollTop;
      const distanceFromBottom =
        event.currentTarget.scrollHeight - event.currentTarget.clientHeight - scrollTop;
      const paginationThreshold = isNewestFirst
        ? ACTIVITY_BOTTOM_PAGINATION_THRESHOLD_PX
        : ACTIVITY_TOP_PAGINATION_THRESHOLD_PX;
      const paginationRearmThreshold = isNewestFirst
        ? ACTIVITY_BOTTOM_PAGINATION_REARM_THRESHOLD_PX
        : ACTIVITY_TOP_PAGINATION_REARM_THRESHOLD_PX;
      const paginationDistance = isNewestFirst ? distanceFromBottom : scrollTop;
      if (paginationDistance > paginationRearmThreshold) {
        paginationArmedRef.current = true;
      }
      if (
        paginationArmedRef.current &&
        paginationDistance <= paginationThreshold &&
        hasMore &&
        nextCursor != null &&
        !isInitialLoading &&
        !isRefreshing &&
        !isLoadingMore
      ) {
        paginationArmedRef.current = false;
        handleLoadMore();
      }
    },
    [
      handleLoadMore,
      hasMore,
      isInitialLoading,
      isLoadingMore,
      isNewestFirst,
      isRefreshing,
      nextCursor,
    ],
  );

  const handleRetry = useCallback(() => {
    setReloadVersion((current) => current + 1);
  }, []);

  if (!validFilter) return null;

  const title = getActivityTitle(validFilter);

  const renderActivityContent = () => {
    if (validFilter === "drafts") {
      return <WorkspaceDraftsPage />;
    }
    if (validFilter === "reactions") {
      return <ActivityUnsupportedState />;
    }
    if (runtimeContext == null) {
      return (
        <div className="p-4 text-sm text-text-muted">
          {t("workspaceMessenger.runtimeUnavailable")}
        </div>
      );
    }
    if (isInitialLoading) {
      return <div className="p-4 text-sm text-text-muted">{t("app.loading")}</div>;
    }
    if (hasLoadError && activityMessages.length === 0) {
      return (
        <div className="m-3 rounded-lg border border-border-subtle p-3 text-sm text-notice-base">
          <p>{t("activity.messagesLoadError")}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 rounded-md px-2 py-1 text-accent hover:bg-card-bg"
          >
            {t("activity.retryLoad")}
          </button>
        </div>
      );
    }
    if (activityMessages.length === 0) {
      return (
        <div className="p-4 text-sm text-text-muted">
          {validFilter === "mentions" ? t("activity.mentionsEmpty") : t("chat.noMessages")}
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {hasLoadError ? (
          <button
            type="button"
            onClick={handleRetry}
            className="mx-3 mt-2 self-start text-xs text-notice-base hover:text-text-primary"
          >
            {t("activity.messagesRefreshError")} {t("activity.retryLoad")}
          </button>
        ) : null}
        {hasPaginationError ? (
          <button
            type="button"
            onClick={handleLoadMore}
            className="mx-3 mt-2 self-start text-xs text-notice-base hover:text-text-primary"
          >
            {t("activity.loadMoreError")} {t("activity.retryLoad")}
          </button>
        ) : null}
        <ActivityMessageList
          messages={activityMessages}
          streamsById={workspaceStreamsById}
          topicsById={workspaceTopicsById}
          listRef={listScrollRef}
          onScroll={handleListScroll}
          onOpen={handleWorkspaceMessageClick}
          onForward={handleWorkspaceMessageForward}
          isLoading={isRefreshing || isLoadingMore}
        />
      </div>
    );
  };

  return (
    <div className="flex max-h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ChatChannelHeader
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
