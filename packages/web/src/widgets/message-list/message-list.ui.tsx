import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { createLogger } from "~/shared/lib/logger";
import { normalizeStreamTopicForMessageCache } from "~/shared/lib/message-cache-keys.lib";
import { logMessageFlow } from "~/shared/lib/message-flow-debug.lib";
import { computeScrollTopAfterPrepend } from "~/shared/lib/scroll-prepend-anchor.lib";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Icon } from "~/shared/ui/icon";
import { MessageBubble, type MessageBubbleCallbacks } from "./message-bubble.ui";
import { getSenderGroups, scrollToBottom } from "./message-list-grouping.lib";
import { buildMessageMediaGallery } from "./message-list-media.lib";
import { MessageListSenderGroup } from "./message-list-sender-group.ui";
import type { MessageListProps } from "./message-list.types";

const SCROLL_AT_BOTTOM_THRESHOLD = 80;

function getDateKey(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return t("chat.today");
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return t("chat.yesterday");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

const UnreadMarker: React.FC<{ unreadCount: number }> = ({ unreadCount }) => (
  <div className="flex items-center gap-2 px-4 py-1 text-xs text-notice-base">
    <div className="bg-notice-base/30 h-px flex-1" />
    <span>
      {unreadCount > 0
        ? t("chat.unreadMessagesWithCount", { count: unreadCount })
        : t("chat.unreadMessages")}
    </span>
    <div className="bg-notice-base/30 h-px flex-1" />
  </div>
);

const LOAD_MORE_THRESHOLD = 100;

const messageListLog = createLogger("ui:message-list");

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  scrollToBottomKey,
  callbacks,
  selectionMode = false,
  selectedMessageIds,
  onLoadMore,
  isLoadingMore = false,
  onLoadNewer,
  hasNewerMessages = false,
  firstUnreadId,
  unreadCount = 0,
  focusedMessageId = null,
  onUnreadMessagesVisible,
  onUnreadMessagesAtBottom,
  showLoadingOverlay = false,
}) => {
  const bubbleCallbacks: MessageBubbleCallbacks | undefined = useMemo(
    () =>
      callbacks
        ? {
            onReply: callbacks.onMessageReply,
            onEdit: callbacks.onMessageEdit,
            onDelete: callbacks.onMessageDelete,
            onCopy: callbacks.onMessageCopy,
            onForward: callbacks.onMessageForward,
            onStar: callbacks.onMessageStar,
            onSelect: callbacks.onMessageSelect,
            onToggleSelect: callbacks.onMessageSelect,
            onAddReaction: callbacks.onMessageAddReaction,
            onRemoveReaction: callbacks.onMessageRemoveReaction,
            onOpenJitsiCall: callbacks.onOpenJitsiCall,
            onViews: callbacks.onMessageViews,
            onOpenInChat: callbacks.onMessageOpenInChat,
            onAuthorClick: callbacks.onMessageAuthorClick,
            onOpenDirectMessage: callbacks.onOpenDirectMessage,
            onRetryFailedOutgoing: callbacks.onRetryFailedOutgoing,
            onRemoveFailedOutgoing: callbacks.onRemoveFailedOutgoing,
          }
        : undefined,
    [callbacks],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingPrependScrollRef = useRef<{
    scrollTop: number;
    scrollHeight: number;
    messageCount: number;
  } | null>(null);
  const wasAtBottomRef = useRef(true);
  const pendingScrollToBottomKeyRef = useRef<string | null>(null);
  const unreadScrollKeyRef = useRef<string | null>(null);
  const bottomReadDispatchKeyRef = useRef<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const messageTailLen = messages.length;
  const messageFirstId = messages[0]?.id;
  const messageLastId = messageTailLen > 0 ? messages[messageTailLen - 1]?.id : undefined;
  useEffect(() => {
    logMessageFlow("ui:MessageList snapshot", {
      messageLen: messageTailLen,
      firstId: messageFirstId,
      lastId: messageLastId,
      isLoadingMore,
      scrollToBottomKey,
    });
  }, [messageTailLen, messageFirstId, messageLastId, isLoadingMore, scrollToBottomKey]);

  const dispatchUnreadAtBottom = useCallback(() => {
    if (!onUnreadMessagesVisible && !onUnreadMessagesAtBottom) return;
    const unreadMessageIds = messages
      .filter(
        (message) =>
          !message.flags?.includes("read") &&
          (currentUserId == null || message.sender_id !== currentUserId),
      )
      .map((message) => message.id);

    if (unreadMessageIds.length === 0) return;

    const dispatchKey = `${scrollToBottomKey ?? "__default__"}:${unreadMessageIds.join(",")}`;
    if (bottomReadDispatchKeyRef.current === dispatchKey) return;
    bottomReadDispatchKeyRef.current = dispatchKey;
    onUnreadMessagesVisible?.(unreadMessageIds);
    onUnreadMessagesAtBottom?.(unreadMessageIds);
  }, [
    onUnreadMessagesVisible,
    onUnreadMessagesAtBottom,
    messages,
    currentUserId,
    scrollToBottomKey,
  ]);

  // On chat/topic switch, remember to scroll down after messages load
  useEffect(() => {
    if (scrollToBottomKey === undefined) return;
    pendingScrollToBottomKeyRef.current = scrollToBottomKey;
  }, [scrollToBottomKey]);

  // Scroll down: after messages load on chat switch, or if user was already at the bottom (own message)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pending = pendingScrollToBottomKeyRef.current;
    if (pending !== null && scrollToBottomKey !== undefined && pending === scrollToBottomKey) {
      pendingScrollToBottomKeyRef.current = null;
      if (focusedMessageId == null && firstUnreadId != null) {
        return;
      }
      scrollToBottom(el);
      return;
    }
    if (messages.length === 0) return;
    if (wasAtBottomRef.current) scrollToBottom(el);
  }, [scrollToBottomKey, messages.length, focusedMessageId, firstUnreadId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_AT_BOTTOM_THRESHOLD;
    wasAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);

    if (el.scrollTop < LOAD_MORE_THRESHOLD && !isLoadingMore && onLoadMore) {
      const snap = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        messageCount: messages.length,
      };
      pendingPrependScrollRef.current = snap;
      messageListLog.debug("prepend scroll snapshot before loadOlder", {
        ...snap,
        clientHeight: el.clientHeight,
      });
      onLoadMore();
    }

    if (atBottom && hasNewerMessages && !isLoadingMore && onLoadNewer) {
      onLoadNewer();
    }

    if (!atBottom) {
      bottomReadDispatchKeyRef.current = null;
    }

    if (atBottom) {
      dispatchUnreadAtBottom();
    }
  }, [
    isLoadingMore,
    onLoadMore,
    hasNewerMessages,
    onLoadNewer,
    dispatchUnreadAtBottom,
    messages.length,
  ]);

  useLayoutEffect(() => {
    const pending = pendingPrependScrollRef.current;
    if (!pending || isLoadingMore) return;
    const el = scrollRef.current;
    if (!el) return;

    if (messages.length < pending.messageCount) {
      messageListLog.debug("prepend restore dropped pending (message list shrank)", {
        messagesLen: messages.length,
        pendingMessageCount: pending.messageCount,
      });
      pendingPrependScrollRef.current = null;
      return;
    }

    const snapshot = { scrollTop: pending.scrollTop, scrollHeight: pending.scrollHeight };
    const nextTop = computeScrollTopAfterPrepend(snapshot, el.scrollHeight);
    if (messages.length > pending.messageCount) {
      messageListLog.debug("prepend restore apply (length increased)", {
        messagesLen: messages.length,
        pendingMessageCount: pending.messageCount,
        prevScrollHeight: pending.scrollHeight,
        nextScrollHeight: el.scrollHeight,
        prevScrollTop: pending.scrollTop,
        nextScrollTop: nextTop,
      });
      el.scrollTop = nextTop;
      pendingPrependScrollRef.current = null;
      return;
    }

    messageListLog.debug("prepend restore apply (same length, spinner or duplicates)", {
      messagesLen: messages.length,
      pendingMessageCount: pending.messageCount,
      prevScrollHeight: pending.scrollHeight,
      nextScrollHeight: el.scrollHeight,
      prevScrollTop: pending.scrollTop,
      nextScrollTop: nextTop,
    });
    el.scrollTop = nextTop;
    pendingPrependScrollRef.current = null;
  }, [isLoadingMore, messages.length]);

  useEffect(() => {
    if (!isAtBottom) {
      bottomReadDispatchKeyRef.current = null;
      return;
    }
    // Safety net: when list is already pinned to bottom, unread rows can appear
    // without a new user scroll event (e.g. rerender/new message). Ensure they are reported.
    dispatchUnreadAtBottom();
  }, [isAtBottom, dispatchUnreadAtBottom]);

  // Sync isAtBottom after render (short chat without scrollbar)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_AT_BOTTOM_THRESHOLD);
  }, [messages.length]);

  useEffect(() => {
    if (onUnreadMessagesVisible == null) return;
    if (typeof IntersectionObserver === "undefined") return;
    const root = scrollRef.current;
    if (!root) return;

    const unreadCandidates = new Set(
      messages
        .filter(
          (message) =>
            !message.flags?.includes("read") &&
            (currentUserId == null || message.sender_id !== currentUserId),
        )
        .map((message) => message.id),
    );
    if (unreadCandidates.size === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = new Set<number>();
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
          const element = entry.target as HTMLElement;
          const rawId = element.getAttribute("data-message-id");
          if (!rawId) continue;
          const messageId = Number(rawId);
          if (!Number.isInteger(messageId) || !unreadCandidates.has(messageId)) continue;
          visible.add(messageId);
        }
        if (visible.size > 0) {
          onUnreadMessagesVisible(Array.from(visible));
        }
      },
      {
        root,
        threshold: [0.5],
      },
    );

    const nodes = root.querySelectorAll<HTMLElement>("[data-message-id]");
    for (const node of nodes) {
      observer.observe(node);
    }

    return () => {
      observer.disconnect();
    };
  }, [messages, currentUserId, onUnreadMessagesVisible]);

  useEffect(() => {
    if (focusedMessageId == null) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-message-id="${focusedMessageId}"]`);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [focusedMessageId, messages.length]);

  useEffect(() => {
    if (focusedMessageId != null || firstUnreadId == null) return;
    const el = scrollRef.current;
    if (!el) return;

    const unreadScrollKey = `${scrollToBottomKey ?? "__default__"}:${firstUnreadId}`;
    if (unreadScrollKeyRef.current === unreadScrollKey) return;

    const target = el.querySelector<HTMLElement>(`[data-message-id="${firstUnreadId}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "instant" });
    unreadScrollKeyRef.current = unreadScrollKey;
  }, [focusedMessageId, firstUnreadId, scrollToBottomKey, messages.length]);

  const scrollToBottomClick = () => {
    scrollToBottom(scrollRef.current);
  };

  const groups = useMemo(() => {
    const result: { dateKey: string; items: MockMessage[] }[] = [];
    let currentKey = "";
    messages.forEach((msg) => {
      const dateKey = getDateKey(msg.timestamp);
      if (dateKey !== currentKey) {
        currentKey = dateKey;
        result.push({ dateKey, items: [msg] });
      } else {
        result[result.length - 1]!.items.push(msg);
      }
    });
    return result;
  }, [messages]);
  const mediaGallery = useMemo(() => buildMessageMediaGallery(messages), [messages]);

  let lastStreamTopicKey: string | undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className={`overscroll-behavior-contain min-h-0 flex-1 overflow-y-auto scroll-auto ${SCROLL_AREA_CLASS}`}
        onScroll={handleScroll}
        role="feed"
        aria-label={t("a11y.conversation")}
      >
        {groups.map(({ dateKey, items }) => (
          <div key={dateKey}>
            <div className="sticky top-0 z-sticky flex justify-center py-2">
              <span className="bg-bg-elevated/90 rounded-full border border-border-subtle px-3 py-1 text-[11px] text-text-muted">
                {dateKey}
              </span>
            </div>
            {(() => {
              const senderGroups = getSenderGroups(items);
              return senderGroups.map((senderMessages) => {
                const isOwn = senderMessages[0]!.sender_id === currentUserId;
                const showUnreadMarker =
                  firstUnreadId != null && senderMessages.some((m) => m.id === firstUnreadId);
                const first = senderMessages[0]!;
                const isStream = first.stream_id != null;
                const topicKey = normalizeStreamTopicForMessageCache(first.subject ?? "");
                const topicLabel = topicKey;
                const showTopicSeparator =
                  isStream && lastStreamTopicKey !== undefined && lastStreamTopicKey !== topicKey;
                if (isStream) {
                  lastStreamTopicKey = topicKey;
                }

                if (isOwn) {
                  const ownGroupKey = senderMessages[0]!.local_echo_key ?? senderMessages[0]!.id;
                  return (
                    <React.Fragment key={`own-${ownGroupKey}`}>
                      {showTopicSeparator && (
                        <button
                          type="button"
                          onClick={() => callbacks?.onTopicSeparatorClick?.(senderMessages[0]!)}
                          className="my-3 flex w-full items-center gap-3 px-4 text-left"
                        >
                          <div className="h-px flex-1 bg-border-subtle" />
                          <span className="text-xs font-medium text-text-muted">{topicLabel}</span>
                          <div className="h-px flex-1 bg-border-subtle" />
                        </button>
                      )}
                      {showUnreadMarker && <UnreadMarker unreadCount={unreadCount} />}
                      {senderMessages.map((m, i) => (
                        <MessageBubble
                          key={m.local_echo_key ?? m.id}
                          message={m}
                          isOwn
                          showAvatar={false}
                          showSenderName={i === 0}
                          currentUserId={currentUserId}
                          callbacks={bubbleCallbacks}
                          selectionMode={selectionMode}
                          isSelected={selectedMessageIds?.has(m.id)}
                          isFocused={focusedMessageId === m.id}
                          mediaGallery={mediaGallery}
                        />
                      ))}
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={`group-${senderMessages[0]!.id}`}>
                    {showTopicSeparator && (
                      <button
                        type="button"
                        onClick={() => callbacks?.onTopicSeparatorClick?.(senderMessages[0]!)}
                        className="my-3 flex w-full items-center gap-3 px-4 text-left"
                      >
                        <div className="h-px flex-1 bg-border-subtle" />
                        <span className="text-xs font-medium text-text-muted">{topicLabel}</span>
                        <div className="h-px flex-1 bg-border-subtle" />
                      </button>
                    )}
                    {showUnreadMarker && <UnreadMarker unreadCount={unreadCount} />}
                    <MessageListSenderGroup
                      messages={senderMessages}
                      currentUserId={currentUserId}
                      bubbleCallbacks={bubbleCallbacks}
                      selectionMode={selectionMode}
                      selectedMessageIds={selectedMessageIds}
                      focusedMessageId={focusedMessageId}
                      mediaGallery={mediaGallery}
                    />
                  </React.Fragment>
                );
              });
            })()}
          </div>
        ))}
        {hasNewerMessages && !isLoadingMore && !showLoadingOverlay && onLoadNewer && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={onLoadNewer}
              className="rounded-full border border-border-subtle bg-bg-elevated px-4 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              {t("chat.loadNewer")}
            </button>
          </div>
        )}
        <div className="h-2 shrink-0" aria-hidden />
      </div>
      {!isAtBottom && (
        <div className="absolute bottom-4 right-4 z-float">
          <button
            type="button"
            onClick={scrollToBottomClick}
            className="hover:bg-bg-elevated/90 flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-bg-elevated text-text-primary shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-soft"
            aria-label={t("a11y.scrollToBottom")}
          >
            <Icon name="chevron-down" className="h-5 w-5" />
          </button>
        </div>
      )}
      <FloatingLoadingOverlay
        visible={showLoadingOverlay}
        label={t("chat.loadingMessages")}
        position={"top-left"}
      />
    </div>
  );
};
