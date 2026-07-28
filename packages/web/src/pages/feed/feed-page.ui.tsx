import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchFeedMessages, hydrateFeedMessagesFromCache } from "~/entities/feed/feed.api";
import { useFeedStore } from "~/entities/feed/feed.model";
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
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTimeWithDate } from "~/shared/lib/datetime.lib";
import { createLogger } from "~/shared/lib/logger";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";
import { scrollToBottom } from "~/shared/lib/scroll-position.lib";
import { useCacheFirstPageLoad } from "~/shared/lib/use-cache-first-page.hook";
import type { WorkspaceMessageSummaryOptions } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { workspaceMessengerTopicRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { FloatingScrollToBottomButton } from "~/shared/ui/floating-scroll-to-bottom-button";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { computeFeedScrollTopAfterPrepend, shouldRequestOlderFeedPage } from "./feed-scroll.lib";

const log = createLogger("feed-page");

function FeedSenderName({ authorUuid, fallback }: { authorUuid: string; fallback: string }) {
  const user = useUsersStore((s) => s.usersById[authorUuid]);
  return <>{selectUserDisplayName(user, fallback)}</>;
}

function formatFeedItemTime(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return "";
  const ts = Math.floor(parsed / 1000);
  return formatMessageTimeWithDate(ts);
}

function isRuntimeContextCurrent(runtimeContext: WorkspaceRuntimeContext): boolean {
  return isWorkspaceRuntimeRequestContextCurrent(runtimeContext, () =>
    useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  );
}

const FEED_PAGE_SIZE = 50;
const FEED_BOTTOM_THRESHOLD_PX = 80;
const FEED_TOP_PAGINATION_REARM_THRESHOLD_PX = 96;
const FEED_STATE_CARD_CLASS =
  "m-3 rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";
const FEED_ROW_CLASS =
  "group flex items-start gap-2 rounded-xl border border-border-subtle bg-bg-elevated/60 p-2.5 transition-colors hover:border-accent-soft/40 hover:bg-card-bg";
const FEED_ACTION_BUTTON_CLASS =
  "rounded-md p-1.5 text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary";
const FEED_MESSAGE_SUMMARY_OPTIONS = {
  maxLength: 80,
  includeMediaLabel: true,
  includeAttachmentLabel: true,
  includeQuotePrefix: true,
} as const satisfies WorkspaceMessageSummaryOptions;

function isNearBottom(el: HTMLElement, thresholdPx = FEED_BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

export const FeedPage: React.FC = () => {
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = React.useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const ownerKey = React.useMemo(
    () => (runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext)),
    [runtimeContext],
  );
  const currentInstanceId = runtimeContext?.instanceId ?? null;
  const messages = useFeedStore((s) => s.messages);
  const isInitialLoading = useFeedStore((s) => s.isInitialLoading);
  const isRefreshing = useFeedStore((s) => s.isRefreshing);
  const isLoadingMore = useFeedStore((s) => s.isLoadingMore);
  const hasMore = useFeedStore((s) => s.hasMore);
  const nextPageMarker = useFeedStore((s) => s.nextPageMarker);
  const error = useFeedStore((s) => s.error);
  const openWorkspaceForward = useWorkspaceForwardMessageStore((s) => s.open);
  const setMessages = useFeedStore((s) => s.setMessages);
  const setMessagesIfActual = useFeedStore((s) => s.setMessagesIfActual);
  const setError = useFeedStore((s) => s.setError);
  const startRequest = useFeedStore((s) => s.startRequest);
  const streamsById = useMessengerStore((s) => s.streamsById);
  const topicsById = useMessengerStore((s) => s.topicsById);
  const listRef = useRef<HTMLUListElement>(null);
  const initialScrollPositionKeyRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const loadMoreRequestRef = useRef<{ ownerKey: string; pageMarker: string } | null>(null);
  // If refresh started while pinned to bottom, stay at bottom after response.
  const shouldStickToBottomAfterRefreshRef = useRef(false);
  // Debounce top pagination — one auto-fetch until re-armed.
  const topPaginationArmedRef = useRef(true);
  // Scroll-to-bottom button visibility (same as message-list).
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const initialScrollPositionKey = ownerKey;

  useCacheFirstPageLoad({
    instanceId: currentInstanceId,
    getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
    dedupeKey: `${ownerKey ?? "none"}:feed:newest:${FEED_PAGE_SIZE}`,
    onInstanceChange: () => {
      const cachedOwnerKey = useFeedStore.getState().ownerKey;
      if (cachedOwnerKey != null && cachedOwnerKey !== ownerKey) {
        useFeedStore.getState().clear();
      }
      initialScrollPositionKeyRef.current = null;
      pendingScrollRestoreRef.current = null;
      loadMoreRequestRef.current = null;
    },
    hydrate: async ({ instanceId, signal, requestContext }) => {
      const cached = await hydrateFeedMessagesFromCache(ownerKey ?? instanceId);
      if (
        signal.aborted ||
        !isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        )
      ) {
        return;
      }
      if (cached.length > 0) {
        setMessages(cached, { nextPageMarker: null, hasMore: false }, ownerKey);
      }
    },
    hasCachedData: () => {
      const state = useFeedStore.getState();
      return state.ownerKey === ownerKey && state.messages.length > 0;
    },
    startRequest: (hasCached) => {
      const scrollEl = listRef.current;
      shouldStickToBottomAfterRefreshRef.current =
        hasCached && (scrollEl == null || isNearBottom(scrollEl));
      return startRequest(hasCached);
    },
    fetch: async ({ instanceId, requestContext, requestVersion, signal }) => {
      if (runtimeContext == null) return;
      const page = await fetchFeedMessages({ runtimeContext, pageLimit: FEED_PAGE_SIZE, signal });
      if (
        signal.aborted ||
        !isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        ) ||
        !isRuntimeContextCurrent(runtimeContext)
      ) {
        return;
      }
      setMessagesIfActual(
        page.messages,
        { nextPageMarker: page.nextPageMarker, hasMore: page.hasMore },
        requestVersion,
        ownerKey ?? instanceId,
      );
    },
    onFetchError: (err, requestVersion) => {
      setError(String(err), requestVersion);
      log.error("Failed to load feed", { error: String(err) });
    },
  });

  useLayoutEffect(() => {
    if (initialScrollPositionKey == null || isInitialLoading || messages.length === 0) return;
    if (initialScrollPositionKeyRef.current === initialScrollPositionKey) return;
    const el = listRef.current;
    if (!el) return;
    scrollToBottom(el);
    initialScrollPositionKeyRef.current = initialScrollPositionKey;
    topPaginationArmedRef.current = true;
  }, [initialScrollPositionKey, isInitialLoading, messages.length]);

  useEffect(() => {
    // After refresh stick to bottom only if user has not scrolled up.
    if (isRefreshing || !shouldStickToBottomAfterRefreshRef.current || messages.length === 0)
      return;
    const el = listRef.current;
    if (!el) return;
    scrollToBottom(el);
    shouldStickToBottomAfterRefreshRef.current = false;
    topPaginationArmedRef.current = true;
  }, [isRefreshing, messages.length]);

  useEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending || isLoadingMore) return;

    const el = listRef.current;
    if (!el) return;

    el.scrollTop = computeFeedScrollTopAfterPrepend(pending, el.scrollHeight);
    setIsAtBottom(isNearBottom(el));
    pendingScrollRestoreRef.current = null;
  }, [messages.length, isLoadingMore]);

  const handleLoadMore = React.useCallback(
    (preserveScroll: boolean) => {
      if (
        isLoadingMore ||
        !hasMore ||
        nextPageMarker == null ||
        currentInstanceId == null ||
        runtimeContext == null ||
        ownerKey == null
      ) {
        return;
      }

      if (preserveScroll && listRef.current) {
        pendingScrollRestoreRef.current = {
          scrollTop: listRef.current.scrollTop,
          scrollHeight: listRef.current.scrollHeight,
        };
      }

      useFeedStore.getState().setLoadingMore(true);
      const requestInstanceId = currentInstanceId;
      const requestRuntimeContext = runtimeContext;
      const requestOwnerKey = ownerKey;
      const requestPageMarker = nextPageMarker;
      loadMoreRequestRef.current = {
        ownerKey: requestOwnerKey,
        pageMarker: requestPageMarker,
      };
      const requestKey = `${requestOwnerKey}:feed:${requestPageMarker}:${FEED_PAGE_SIZE}`;
      const isCurrentLoadMoreRequest = () => {
        const activeRequest = loadMoreRequestRef.current;
        const feedState = useFeedStore.getState();
        return (
          activeRequest?.ownerKey === requestOwnerKey &&
          activeRequest.pageMarker === requestPageMarker &&
          feedState.ownerKey === requestOwnerKey &&
          feedState.nextPageMarker === requestPageMarker &&
          isRuntimeContextCurrent(requestRuntimeContext) &&
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext()?.instanceId ===
            requestInstanceId
        );
      };
      void runInFlightDeduped(requestKey, () =>
        fetchFeedMessages({
          runtimeContext: requestRuntimeContext,
          pageLimit: FEED_PAGE_SIZE,
          pageMarker: requestPageMarker,
        }),
      )
        .then((page) => {
          if (!isCurrentLoadMoreRequest()) return;
          useFeedStore.getState().appendOlder(page.messages, {
            nextPageMarker: page.nextPageMarker,
            hasMore: page.hasMore,
          });
          loadMoreRequestRef.current = null;
        })
        .catch((err) => {
          if (!isCurrentLoadMoreRequest()) return;
          useFeedStore.getState().setLoadingMore(false);
          log.error("Failed to load more feed messages", { error: String(err) });
          pendingScrollRestoreRef.current = null;
          loadMoreRequestRef.current = null;
        });
    },
    [isLoadingMore, hasMore, nextPageMarker, currentInstanceId, runtimeContext, ownerKey],
  );

  const handleListScroll = React.useCallback(
    (event: React.UIEvent<HTMLUListElement>) => {
      const currentScrollTop = event.currentTarget.scrollTop;
      setIsAtBottom(isNearBottom(event.currentTarget));

      // Manual scroll away from bottom disables post-refresh stickiness.
      if (isRefreshing && shouldStickToBottomAfterRefreshRef.current) {
        if (!isNearBottom(event.currentTarget)) {
          shouldStickToBottomAfterRefreshRef.current = false;
        }
      }

      // Re-arm top pagination after scrolling away from the top edge.
      if (currentScrollTop > FEED_TOP_PAGINATION_REARM_THRESHOLD_PX) {
        topPaginationArmedRef.current = true;
      }

      if (
        topPaginationArmedRef.current &&
        shouldRequestOlderFeedPage({
          scrollTop: currentScrollTop,
          isLoadingMore,
          hasMore,
          nextPageMarker,
        })
      ) {
        topPaginationArmedRef.current = false;
        handleLoadMore(true);
      }
    },
    [handleLoadMore, isLoadingMore, hasMore, isRefreshing, nextPageMarker],
  );

  const handleScrollToBottomClick = React.useCallback(() => {
    scrollToBottom(listRef.current, "smooth");
    setIsAtBottom(true);
    topPaginationArmedRef.current = true;
  }, []);

  const handleMessageClick = (m: (typeof messages)[number], mode: "open" | "forward" = "open") => {
    if (mode === "forward") {
      openWorkspaceForward({ messageUuids: [m.uuid] });
      return;
    }

    if (runtimeContext == null) {
      return;
    }

    void navigate(
      workspaceMessengerTopicRoute({
        orgId: runtimeContext.organizationId,
        projectId: runtimeContext.projectId,
        streamUuid: m.streamUuid,
        topicUuid: m.topicUuid,
      }),
    );
  };

  return (
    <div className="flex max-h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ChatHeader
        channelName={t("feed.title")}
        hideTopic
        hideParticipants
        onOpenSearch={openSearch ?? undefined}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isInitialLoading && (
          <div className={`${FEED_STATE_CARD_CLASS} text-text-muted`}>{t("app.loading")}</div>
        )}
        {!isInitialLoading && error && (
          <div className={`${FEED_STATE_CARD_CLASS} text-notice-base`}>{t("feed.loadError")}</div>
        )}
        {!isInitialLoading && !error && messages.length === 0 && (
          <div className={`${FEED_STATE_CARD_CLASS} text-text-muted`}>{t("feed.noMessages")}</div>
        )}
        {!isInitialLoading && !error && messages.length > 0 && (
          <div className="relative flex min-h-0 flex-1 flex-col">
            <ul
              ref={listRef}
              onScroll={handleListScroll}
              className="overscroll-behavior-contain flex min-h-0 flex-1 flex-col space-y-2 overflow-auto scroll-auto px-3 pb-3 pt-2"
            >
              {messages.map((m) => {
                const streamName = streamsById[m.streamUuid]?.name ?? m.streamUuid;
                const topic = topicsById[m.topicUuid]?.name.trim();
                const contextTopic = topic != null && topic.length > 0 ? topic : m.topicUuid;
                const context = `#${streamName} · ${contextTopic}`;
                // Feed uses the same Workspace summary path as the sidebar:
                // previews stay textual and do not expose protected file URLs.
                const summaryText = summarizeWorkspaceMessageMarkdown(
                  m.payload.content,
                  FEED_MESSAGE_SUMMARY_OPTIONS,
                ).text;

                return (
                  <li key={m.uuid}>
                    <div className={FEED_ROW_CLASS}>
                      <button
                        type="button"
                        onClick={() => handleMessageClick(m)}
                        className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-muted">
                            {formatFeedItemTime(m.createdAt)}
                          </span>
                          <span className="truncate rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                            {context}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-sidebar-sender">
                          <FeedSenderName authorUuid={m.authorUuid} fallback={m.authorUuid} />
                        </p>
                        <p className="bg-bg/70 mt-1.5 line-clamp-2 rounded-lg px-2.5 py-2 text-sm leading-snug text-text-primary">
                          {summaryText}
                        </p>
                      </button>
                      <div className="bg-bg/60 mt-0.5 flex shrink-0 items-center gap-1 rounded-lg p-1 opacity-70 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleMessageClick(m)}
                          className={FEED_ACTION_BUTTON_CLASS}
                          aria-label={t("message.openInChat")}
                          title={t("message.openInChat")}
                        >
                          <Icon name="newWindow" size={16} className="text-current" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMessageClick(m, "forward")}
                          className={FEED_ACTION_BUTTON_CLASS}
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
            <FloatingLoadingOverlay visible={isLoadingMore || isRefreshing} />
            {!isAtBottom && <FloatingScrollToBottomButton onClick={handleScrollToBottomClick} />}
          </div>
        )}
      </section>
    </div>
  );
};
