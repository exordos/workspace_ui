// /feed — IDB hydrate → background refresh (newest replace, load-more append+dedupe).
import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { fetchFeedMessages, hydrateFeedMessagesFromCache } from "~/entities/feed/feed.api";
import { useFeedStore } from "~/entities/feed/feed.model";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
  useInstancesStore,
} from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/messenger.types";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTimeWithDate } from "~/shared/lib/datetime.lib";
import { createLogger } from "~/shared/lib/logger";
import { messageAuthorId } from "~/shared/lib/message-author.lib";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { buildNavigableRouteFromMessage, buildPushClickUrl } from "~/shared/lib/push-click";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";
import { scrollToBottom } from "~/shared/lib/scroll-position.lib";
import { useCacheFirstPageLoad } from "~/shared/lib/use-cache-first-page.hook";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { FloatingScrollToBottomButton } from "~/shared/ui/floating-scroll-to-bottom-button";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { appendForwardIntentQuery } from "./feed-forward-intent.lib";
import { computeFeedScrollTopAfterPrepend, shouldRequestOlderFeedPage } from "./feed-scroll.lib";

const log = createLogger("feed-page");

function FeedSenderName({ senderId, fallback }: Readonly<{ senderId: UserId; fallback: string }>) {
  const displayName = useUsersStore((s) => s.getDisplayName(senderId));
  return <>{displayName !== "Unknown" ? displayName : fallback}</>;
}

function nonEmptyText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : undefined;
}

function resolveFeedStreamName(
  message: MockMessage,
  stream: StreamEntryInternal | undefined,
): string {
  const displayRecipient =
    typeof message.display_recipient === "string" ? message.display_recipient : undefined;
  return (
    nonEmptyText(stream?.name) ??
    nonEmptyText(message.channel) ??
    nonEmptyText(displayRecipient) ??
    String(message.stream_uuid ?? "")
  );
}

function resolveFeedTopicName(
  message: MockMessage,
  stream: StreamEntryInternal | undefined,
): string | undefined {
  const topicUuid = nonEmptyText(message.topic_uuid);
  if (topicUuid != null && stream != null) {
    for (const topic of stream.topics.values()) {
      if (topic.topicUuid === topicUuid) {
        return nonEmptyText(topic.subject);
      }
    }
  }
  return nonEmptyText(message.subject);
}

function buildFeedMessageRoute(
  message: MockMessage,
  streamsMap: ReadonlyMap<string, StreamEntryInternal>,
  currentUserId: UserId | null,
): string | null {
  const streamUuid = nonEmptyText(message.stream_uuid);
  if (streamUuid != null) {
    const stream = streamsMap.get(streamUuid);
    const streamName = resolveFeedStreamName(message, stream);
    const topic = nonEmptyText(message.topic_uuid) ?? resolveFeedTopicName(message, stream);
    return buildPushClickUrl({
      type: "stream",
      streamId: streamUuid,
      streamName,
      ...(topic != null ? { topic } : {}),
      messageId: message.id,
    });
  }
  return buildNavigableRouteFromMessage(message, currentUserId);
}

function truncateText(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function formatFeedItemTime(ts: number): string {
  return formatMessageTimeWithDate(ts);
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

function isNearBottom(el: HTMLElement, thresholdPx = FEED_BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

export const FeedPage: React.FC = () => {
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const messages = useFeedStore((s) => s.messages);
  const isInitialLoading = useFeedStore((s) => s.isInitialLoading);
  const isRefreshing = useFeedStore((s) => s.isRefreshing);
  const isLoadingMore = useFeedStore((s) => s.isLoadingMore);
  const isAllLoaded = useFeedStore((s) => s.isAllLoaded);
  const lastMessageId = useFeedStore((s) => s.lastMessageId);
  const error = useFeedStore((s) => s.error);
  const setMessages = useFeedStore((s) => s.setMessages);
  const setMessagesIfActual = useFeedStore((s) => s.setMessagesIfActual);
  const setError = useFeedStore((s) => s.setError);
  const startRequest = useFeedStore((s) => s.startRequest);
  const listRef = useRef<HTMLUListElement>(null);
  const initialScrollPositionKeyRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  // If refresh started while pinned to bottom, stay at bottom after response.
  const shouldStickToBottomAfterRefreshRef = useRef(false);
  // Debounce top pagination — one auto-fetch until re-armed.
  const topPaginationArmedRef = useRef(true);
  // Scroll-to-bottom button visibility (same as message-list).
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const initialScrollPositionKey = currentInstanceId ?? null;

  useCacheFirstPageLoad({
    instanceId: currentInstanceId,
    dedupeKey: `${currentInstanceId ?? "none"}:feed:newest:${FEED_PAGE_SIZE}`,
    onInstanceChange: (instanceId) => {
      const cachedInstanceId = useFeedStore.getState().instanceId;
      if (cachedInstanceId != null && cachedInstanceId !== instanceId) {
        useFeedStore.getState().clear();
      }
      initialScrollPositionKeyRef.current = null;
      pendingScrollRestoreRef.current = null;
    },
    hydrate: async ({ instanceId, signal, orgContext }) => {
      const cached = await hydrateFeedMessagesFromCache(instanceId);
      if (signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;
      if (cached.length > 0) {
        setMessages(cached, false, instanceId);
      }
    },
    hasCachedData: () => useFeedStore.getState().messages.length > 0,
    startRequest: (hasCached) => {
      const scrollEl = listRef.current;
      shouldStickToBottomAfterRefreshRef.current =
        hasCached && (scrollEl == null || isNearBottom(scrollEl));
      return startRequest(hasCached);
    },
    fetch: async ({ instanceId, orgContext, requestVersion, signal }) => {
      const page = await fetchFeedMessages("newest", FEED_PAGE_SIZE, { signal });
      if (signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;
      for (const m of page.messages) useUsersStore.getState().mergeFromMessage(m);
      setMessagesIfActual(page.messages, page.foundOldest, requestVersion, instanceId);
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
      if (isLoadingMore || isAllLoaded || lastMessageId == null || currentInstanceId == null)
        return;

      if (preserveScroll && listRef.current) {
        // Snapshot scroll position before prepending older messages.
        pendingScrollRestoreRef.current = {
          scrollTop: listRef.current.scrollTop,
          scrollHeight: listRef.current.scrollHeight,
        };
      }

      useFeedStore.getState().setLoadingMore(true);
      const requestInstanceId = currentInstanceId;
      const orgContext = captureActiveOrgRequestContext();
      const requestKey = `${requestInstanceId}:feed:${lastMessageId}:${FEED_PAGE_SIZE}`;
      void runInFlightDeduped(requestKey, () => fetchFeedMessages(lastMessageId, FEED_PAGE_SIZE))
        .then((page) => {
          if (
            !isActiveOrgRequestContextCurrent(orgContext) ||
            useInstancesStore.getState().currentInstanceId !== requestInstanceId
          ) {
            useFeedStore.getState().setLoadingMore(false);
            pendingScrollRestoreRef.current = null;
            return;
          }
          // Drop anchor message and append only unique older rows.
          const withoutAnchor = page.messages.filter((m) => m.id !== lastMessageId);
          for (const m of withoutAnchor) useUsersStore.getState().mergeFromMessage(m);
          useFeedStore.getState().appendOlder(withoutAnchor, page.foundOldest);
        })
        .catch((err) => {
          useFeedStore.getState().setLoadingMore(false);
          log.error("Failed to load more feed messages", { error: String(err) });
          pendingScrollRestoreRef.current = null;
        });
    },
    [isLoadingMore, isAllLoaded, lastMessageId, currentInstanceId],
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
          isAllLoaded,
          lastMessageId,
        })
      ) {
        // No repeat auto-fetch until user scrolls down from top again.
        topPaginationArmedRef.current = false;
        handleLoadMore(true);
      }
    },
    [handleLoadMore, isLoadingMore, isAllLoaded, isRefreshing, lastMessageId],
  );

  // Scroll-to-bottom button uses smooth scroll; load/refresh auto-scrolls stay instant.
  const handleScrollToBottomClick = React.useCallback(() => {
    scrollToBottom(listRef.current, "smooth");
    setIsAtBottom(true);
    topPaginationArmedRef.current = true;
  }, []);

  const handleMessageClick = (m: (typeof messages)[number], mode: "open" | "forward" = "open") => {
    const route = buildFeedMessageRoute(m, streamsMap, currentUserId);
    if (route) {
      const nextRoute = mode === "forward" ? appendForwardIntentQuery(route, m.id) : route;
      void navigate(nextRoute);
    }
  };

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
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
                const isStream = m.stream_uuid != null;
                const stream = isStream ? streamsMap.get(String(m.stream_uuid)) : undefined;
                const streamName = isStream ? resolveFeedStreamName(m, stream) : null;
                const topic = isStream ? resolveFeedTopicName(m, stream) : null;
                const context =
                  isStream && topic != null
                    ? `#${streamName} · ${topic}`
                    : isStream
                      ? `#${streamName}`
                      : t("dm.private");

                return (
                  <li key={m.id}>
                    <div className={FEED_ROW_CLASS}>
                      <button
                        type="button"
                        onClick={() => handleMessageClick(m)}
                        className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-muted">
                            {formatFeedItemTime(m.timestamp)}
                          </span>
                          <span className="truncate rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                            {context}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-sidebar-sender">
                          <FeedSenderName
                            senderId={messageAuthorId(m)}
                            fallback={m.sender_full_name}
                          />
                        </p>
                        <p className="bg-bg/70 mt-1.5 line-clamp-2 rounded-lg px-2.5 py-2 text-sm leading-snug text-text-primary">
                          {truncateText(plainTextPreviewFromMessageBody(m.content))}
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
