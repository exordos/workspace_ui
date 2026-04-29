// Страница /feed.
// Паттерн работы: мгновенный hydrate из IDB -> фоновый refresh с сервера ->
// authoritative replace для newest и append+dedupe для load more.
import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { fetchFeedMessages, hydrateFeedMessagesFromCache } from "~/entities/feed/feed.api";
import { useFeedStore } from "~/entities/feed/feed.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTime } from "~/shared/lib/format";
import { createLogger } from "~/shared/lib/logger";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { buildNavigableRouteFromMessage } from "~/shared/lib/push-click";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";
import { scrollToBottom } from "~/shared/lib/scroll-position.lib";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { FloatingScrollToBottomButton } from "~/shared/ui/floating-scroll-to-bottom-button";
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

// Формат времени для feed:
// - сегодня: только HH:MM;
// - вчера и старше: дата + HH:MM.
function formatFeedItemTime(ts: number): string {
  const date = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) return formatMessageTime(ts);
  const datePart = date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${datePart} ${formatMessageTime(ts)}`;
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

// Проверяем, находится ли скролл около низа списка.
function isNearBottom(el: HTMLElement, thresholdPx = FEED_BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

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
  const initialScrollPositionKeyRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  // Если refresh стартовал при "приклеенном" низе, после ответа оставляем пользователя внизу.
  const shouldStickToBottomAfterRefreshRef = useRef(false);
  // Защита от дребезга: автоподгрузка у верхней границы выполняется один раз до re-arm.
  const topPaginationArmedRef = useRef(true);
  // Нужен для отображения кнопки "прокрутить вниз", как в обычном message-list.
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const initialScrollPositionKey = currentInstanceId ?? null;

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
    initialScrollPositionKeyRef.current = null;
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
      const scrollEl = listRef.current;
      // Запоминаем, нужно ли после refresh автоматически удержать низ.
      shouldStickToBottomAfterRefreshRef.current =
        hasCachedData && (scrollEl == null || isNearBottom(scrollEl));
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
    // После завершения refresh мягко возвращаемся к последним сообщениям,
    // только если пользователь не успел вручную уйти вверх.
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
      if (isLoadingMore || isAllLoaded || lastMessageId == null) return;

      if (preserveScroll && listRef.current) {
        // Снимок нужен, чтобы после prepend старых сообщений сохранить позицию viewport.
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
    [isLoadingMore, isAllLoaded, lastMessageId, currentInstanceId],
  );

  const handleListScroll = React.useCallback(
    (event: React.UIEvent<HTMLUListElement>) => {
      const currentScrollTop = event.currentTarget.scrollTop;
      setIsAtBottom(isNearBottom(event.currentTarget));

      // Если пользователь вручную ушел от низа, отключаем автоприлипание после refresh.
      if (isRefreshing && shouldStickToBottomAfterRefreshRef.current) {
        if (!isNearBottom(event.currentTarget)) {
          shouldStickToBottomAfterRefreshRef.current = false;
        }
      }

      // Re-arm после заметного ухода от верхней границы.
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
        // Пока снова не уйдем вниз от топа, повторный автозапрос не запускаем.
        topPaginationArmedRef.current = false;
        handleLoadMore(true);
      }
    },
    [handleLoadMore, isLoadingMore, isAllLoaded, isRefreshing, lastMessageId],
  );

  // Для кнопки "вниз" используем плавную прокрутку,
  // но автоскроллы загрузки и refresh выше остаются мгновенными.
  const handleScrollToBottomClick = React.useCallback(() => {
    scrollToBottom(listRef.current, "smooth");
    setIsAtBottom(true);
    topPaginationArmedRef.current = true;
  }, []);

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
              className="overscroll-behavior-contain flex min-h-0 flex-1 flex-col space-y-2 overflow-auto scroll-auto px-3 pb-3 pt-2"
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
                            {formatFeedItemTime(m.timestamp)}
                          </span>
                          <span className="truncate rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                            {context}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-sidebar-sender">
                          <FeedSenderName senderId={m.sender_id} fallback={m.sender_full_name} />
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
