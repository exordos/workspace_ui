// Страница /feed.
// Паттерн работы: мгновенный hydrate из IDB -> фоновый refresh с сервера ->
// authoritative replace для newest и append+dedupe для load more.
import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { fetchFeedMessages, hydrateFeedMessagesFromCache } from "~/entities/feed/feed.api";
import { useFeedStore } from "~/entities/feed/feed.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTime } from "~/shared/lib/format";
import { stripHtml } from "~/shared/lib/html";
import { createLogger } from "~/shared/lib/logger";
import { buildNavigableRouteFromMessage } from "~/shared/lib/push-click";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { appendForwardIntentQuery } from "./feed-forward-intent.lib";
import { computeFeedScrollTopAfterPrepend, shouldRequestOlderFeedPage } from "./feed-scroll.lib";

const log = createLogger("feed-page");

function FeedSenderName({ senderId, fallback }: { senderId: number; fallback: string }) {
  const displayName = useUsersStore((s) => s.getDisplayName(senderId));
  return <>{displayName !== "Unknown" ? displayName : fallback}</>;
}

function truncateText(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

const FEED_PAGE_SIZE = 50;
const FEED_STATE_CARD_CLASS =
  "m-3 rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";
const FEED_ROW_CLASS =
  "group flex items-start gap-2 rounded-xl border border-border-subtle bg-bg-elevated/60 p-2.5 transition-colors hover:border-accent-soft/40 hover:bg-card-bg";
const FEED_ACTION_BUTTON_CLASS =
  "rounded-md p-1.5 text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary";

export const FeedPage: React.FC = () => {
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
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
  const didAutoScrollToLatestRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);

  useEffect(() => {
    if (currentInstanceId == null) {
      return;
    }

    let cancelled = false;
    const cachedInstanceId = useFeedStore.getState().instanceId;
    // Если переключили инстанс, не переносим feed-кэш между инстансами.
    if (cachedInstanceId != null && cachedInstanceId !== currentInstanceId) {
      useFeedStore.getState().clear();
    }
    didAutoScrollToLatestRef.current = false;
    pendingScrollRestoreRef.current = null;

    void (async () => {
      // 1) Быстрый локальный старт из IDB.
      const cached = await hydrateFeedMessagesFromCache(currentInstanceId);
      if (cancelled) return;
      if (cached.length > 0) {
        setMessages(cached, false, currentInstanceId);
      }
      // 2) Фоновая актуализация с requestVersion и dedupe.
      const hasCachedData = cached.length > 0 || useFeedStore.getState().messages.length > 0;
      const requestVersion = startRequest(hasCachedData);
      const requestKey = `${currentInstanceId}:feed:newest:${FEED_PAGE_SIZE}`;
      try {
        const page = await runInFlightDeduped(requestKey, () =>
          fetchFeedMessages("newest", FEED_PAGE_SIZE),
        );
        if (cancelled) return;
        for (const m of page.messages) useUsersStore.getState().mergeFromMessage(m);
        setMessagesIfActual(page.messages, page.foundOldest, requestVersion, currentInstanceId);
      } catch (err) {
        if (!cancelled) setError(String(err), requestVersion);
        log.error("Failed to load feed", { error: String(err) });
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentInstanceId, setError, setMessages, setMessagesIfActual, startRequest]);

  useEffect(() => {
    if (isInitialLoading || messages.length === 0 || didAutoScrollToLatestRef.current) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    didAutoScrollToLatestRef.current = true;
  }, [isInitialLoading, messages.length]);

  useEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending || isLoadingMore) return;

    const el = listRef.current;
    if (!el) return;

    el.scrollTop = computeFeedScrollTopAfterPrepend(pending, el.scrollHeight);
    pendingScrollRestoreRef.current = null;
  }, [messages.length, isLoadingMore]);

  const handleLoadMore = React.useCallback(
    (preserveScroll: boolean) => {
      if (isLoadingMore || isAllLoaded || lastMessageId == null) return;

      if (preserveScroll && listRef.current) {
        pendingScrollRestoreRef.current = {
          scrollTop: listRef.current.scrollTop,
          scrollHeight: listRef.current.scrollHeight,
        };
      }

      useFeedStore.getState().setLoadingMore(true);
      const requestKey = `${currentInstanceId ?? "none"}:feed:${lastMessageId}:${FEED_PAGE_SIZE}`;
      void runInFlightDeduped(requestKey, () => fetchFeedMessages(lastMessageId, FEED_PAGE_SIZE))
        .then((page) => {
          // Убираем anchor-сообщение и безопасно дописываем только старые уникальные.
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
    [isLoadingMore, isAllLoaded, lastMessageId],
  );

  const handleListScroll = React.useCallback(
    (event: React.UIEvent<HTMLUListElement>) => {
      if (
        shouldRequestOlderFeedPage({
          scrollTop: event.currentTarget.scrollTop,
          isLoadingMore,
          isAllLoaded,
          lastMessageId,
        })
      ) {
        handleLoadMore(true);
      }
    },
    [handleLoadMore, isLoadingMore, isAllLoaded, lastMessageId],
  );

  const handleMessageClick = (m: (typeof messages)[number], mode: "open" | "forward" = "open") => {
    const route = buildNavigableRouteFromMessage(m, currentUserId);
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
              className="flex min-h-0 flex-1 flex-col space-y-2 overflow-auto px-3 pb-3 pt-2"
            >
              {messages.map((m) => {
                const isStream = m.stream_id != null;
                const streamName = isStream ? (m.channel ?? null) : null;
                const topic = isStream ? (m.subject ?? "").trim() : null;
                const contextTopic = topic != null && topic.length > 0 ? topic : t("feed.title");
                const context = isStream ? `#${streamName} · ${contextTopic}` : t("dm.private");

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
                            {formatMessageTime(m.timestamp)}
                          </span>
                          <span className="truncate rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                            {context}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-sidebar-sender">
                          <FeedSenderName senderId={m.sender_id} fallback={m.sender_full_name} />
                        </p>
                        <p className="bg-bg/70 mt-1.5 line-clamp-2 rounded-lg px-2.5 py-2 text-sm leading-snug text-text-primary">
                          {truncateText(stripHtml(m.content))}
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
              {!isAllLoaded && !isLoadingMore && (
                <li className="py-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleLoadMore(false)}
                    className="bg-bg-elevated/50 hover:border-accent-soft/40 rounded-xl border border-border-subtle px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-card-bg"
                  >
                    {t("common.loadMore")}
                  </button>
                </li>
              )}
            </ul>
            <FloatingLoadingOverlay visible={isLoadingMore || isRefreshing} />
          </div>
        )}
      </section>
    </div>
  );
};
