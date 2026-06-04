import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react";
import { t } from "~/i18n/i18n";
import type { MockMessage, Reaction, RealmEmoji } from "~/shared/api/zulip.types";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { normalizeEmojiShortcodeName } from "~/shared/lib/emoji-shortcodes.lib";
import { createLogger } from "~/shared/lib/logger";
import { normalizeStreamTopicForMessageCache } from "~/shared/lib/message-cache-keys.lib";
import { containsEmojiShortcode } from "~/shared/lib/message-emoji-shortcodes.lib";
import {
  logMessageFlow,
  logScrollReadFlow,
  summarizeMessageIdsForFlowDebug,
  summarizeScrollElement,
} from "~/shared/lib/message-flow-debug.lib";
import {
  buildMessageIdMap,
  filterViewportUnreadIdsForReadDispatch,
} from "~/shared/lib/message-id-index.lib";
import {
  canAutoLoadNewer,
  canAutoLoadOlder,
  isElementNearViewportBottom,
} from "~/shared/lib/message-list-pagination-policy.lib";
import { isLikelyRenderedMessageHtml } from "~/shared/lib/message-markdown-display.lib";
import { resolveLastUnreadBoundaryMessageId } from "~/shared/lib/message-unread-boundary.lib";
import {
  collectViewportVisibleUnreadIds,
  computeReadTailReady,
  shouldDeferAutoMarkUnreadUntilUserScroll,
} from "~/shared/lib/read-receipts-policy.lib";
import { ensureRealmEmojisLoaded, getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import { scrollToBottom } from "~/shared/lib/scroll-position.lib";
import {
  computeScrollTopAfterPrepend,
  computeScrollTopFromAnchor,
  resolveVisibleMessageAnchor,
  type ScrollPrependAnchor,
  type ScrollPrependSnapshot,
} from "~/shared/lib/scroll-prepend-anchor.lib";
import { logSidebarUnreadFlow } from "~/shared/lib/sidebar-unread-debug.lib";
import { isTabVisible, onVisibilityChange } from "~/shared/lib/visibility";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { FloatingScrollToBottomButton } from "~/shared/ui/floating-scroll-to-bottom-button";
import { WidgetErrorBoundary } from "~/shared/ui/widget-error-boundary.ui";
import { MessageBubble, type MessageBubbleCallbacks } from "./message-bubble.ui";
import { getSenderGroups } from "./message-list-grouping.lib";
import { buildMessageMediaGallery } from "./message-list-media.lib";
import { MessageListSenderGroup } from "./message-list-sender-group.ui";
import type { MessageListProps } from "./message-list.types";

const SCROLL_AT_BOTTOM_THRESHOLD = 80;
const FOCUSED_MESSAGE_HIGHLIGHT_DURATION_MS = 6_000;

interface PendingPrependScrollSnapshot extends ScrollPrependSnapshot {
  messageCount: number;
  firstMessageId: number | undefined;
  anchor: ScrollPrependAnchor | null;
}

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
const VISIBILITY_READ_RECHECK_MS = 200;
const SCROLL_LOG_THROTTLE_MS = 100;
const INITIAL_READ_SUPPRESS_MS = 400;

const messageListLog = createLogger("ui:message-list");

export const MessageListInner: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  scrollToBottomKey,
  scrollToBottomAfterSendNonce = 0,
  callbacks,
  selectionMode = false,
  selectedMessageIds,
  onLoadMore,
  isLoadingMore = false,
  isLoadingNewer = false,
  onLoadNewer,
  hasNewerMessages = false,
  firstUnreadId,
  unreadCount = 0,
  focusedMessageId = null,
  onUnreadMessagesVisible,
  onUnreadMessagesAtBottom,
  showLoadingOverlay = false,
  showTopicInSenderName = true,
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
            onPermalinkClick: callbacks.onMessagePermalinkClick,
            onAuthorClick: callbacks.onMessageAuthorClick,
            onOpenDirectMessage: callbacks.onOpenDirectMessage,
            onRetryFailedOutgoing: callbacks.onRetryFailedOutgoing,
            onRemoveFailedOutgoing: callbacks.onRemoveFailedOutgoing,
          }
        : undefined,
    [callbacks],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingPrependScrollRef = useRef<PendingPrependScrollSnapshot | null>(null);
  const wasAtBottomRef = useRef(true);
  const userScrollSeenRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const pendingScrollToBottomKeyRef = useRef<string | null>(null);
  const openAtBottomIntentKeyRef = useRef<string | null>(null);
  const unreadScrollKeyRef = useRef<string | null>(null);
  const suppressReadUntilMsRef = useRef(0);
  const scrollLogLastAtMsRef = useRef(0);
  const bottomReadDispatchKeyRef = useRef<string | null>(null);
  const prevMessagesLengthForReanchorRef = useRef<number | null>(null);
  const [unreadAnchorId, setUnreadAnchorId] = useState<number | null>(null);
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const observedUnreadNodesRef = useRef<Map<number, HTMLElement>>(new Map());
  const viewportUnreadIdsRef = useRef<Set<number>>(new Set());
  const unreadCandidatesRef = useRef<Set<number>>(new Set());
  const focusedHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedHighlightFrameRef = useRef<number | null>(null);
  const highlightedFocusedMessageRef = useRef<number | null>(null);
  const [flashFocusedMessageId, setFlashFocusedMessageId] = useState<number | null>(
    focusedMessageId,
  );
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [customEmojis, setCustomEmojis] = useState<RealmEmoji[]>(() => getCachedRealmEmojis());

  const ensureCustomEmojisLoaded = useCallback(() => {
    void ensureRealmEmojisLoaded()
      .then((list) => {
        setCustomEmojis(list);
      })
      .catch(() => {
        messageListLog.warn("Failed to load realm custom emojis for reaction picker");
      });
  }, []);

  const customEmojiById = useMemo(() => {
    const map = new Map<string, RealmEmoji>();
    for (const emoji of customEmojis) {
      const id = emoji.id.trim();
      if (id.length > 0) {
        map.set(id, emoji);
      }
    }
    return map;
  }, [customEmojis]);

  const customEmojiByName = useMemo(() => {
    const map = new Map<string, RealmEmoji>();
    for (const emoji of customEmojis) {
      for (const name of emoji.names) {
        const normalized = normalizeEmojiShortcodeName(name);
        if (normalized.length > 0) {
          map.set(normalized, emoji);
        }
      }
    }
    return map;
  }, [customEmojis]);

  const hasMarkdownEmojiShortcodes = useMemo(
    () =>
      messages.some((message) => {
        const content = message.content.trim();
        if (content.length === 0) return false;
        if (isLikelyRenderedMessageHtml(content)) return false;
        return containsEmojiShortcode(content);
      }),
    [messages],
  );

  const hasRealmEmojiReactions = useMemo(
    () =>
      messages.some((message) =>
        message.reactions?.some((reaction) => reaction.reaction_type === "realm_emoji"),
      ),
    [messages],
  );

  const messageById = useMemo(() => buildMessageIdMap(messages), [messages]);
  const lastUnreadId = useMemo(
    () => resolveLastUnreadBoundaryMessageId(messages, currentUserId),
    [messages, currentUserId],
  );

  const deferAutoMarkUnreadUntilUserScroll = useCallback(
    () =>
      shouldDeferAutoMarkUnreadUntilUserScroll({
        firstUnreadId,
        unreadCount,
        userScrollSeen: userScrollSeenRef.current,
      }),
    [firstUnreadId, unreadCount],
  );

  const syncWasAtBottomFromElement = useCallback(
    (el: HTMLElement) => {
      if (deferAutoMarkUnreadUntilUserScroll()) {
        wasAtBottomRef.current = false;
        setIsAtBottom(false);
        return false;
      }
      const metrics = summarizeScrollElement(el, SCROLL_AT_BOTTOM_THRESHOLD);
      wasAtBottomRef.current = metrics.atBottom;
      setIsAtBottom(metrics.atBottom);
      return metrics.atBottom;
    },
    [deferAutoMarkUnreadUntilUserScroll],
  );

  const logScrollMetrics = useCallback(
    (phase: string, extra?: Record<string, unknown>) => {
      const el = scrollRef.current;
      logScrollReadFlow(phase, {
        scrollToBottomKey,
        firstUnreadId: firstUnreadId ?? null,
        unreadAnchorId,
        programmaticScroll: programmaticScrollRef.current,
        wasAtBottom: wasAtBottomRef.current,
        userScrollSeen: userScrollSeenRef.current,
        ...(el ? summarizeScrollElement(el, SCROLL_AT_BOTTOM_THRESHOLD) : {}),
        ...extra,
      });
    },
    [scrollToBottomKey, firstUnreadId, unreadAnchorId],
  );

  const runProgrammaticScroll = useCallback((scrollAction: () => void) => {
    programmaticScrollRef.current = true;
    scrollAction();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    });
  }, []);

  const pinTailToBottom = useCallback(
    (el: HTMLElement, reason: string) => {
      logScrollMetrics("scroll:toBottom", { reason });
      runProgrammaticScroll(() => {
        scrollToBottom(el);
        syncWasAtBottomFromElement(el);
      });
      requestAnimationFrame(() => {
        scrollToBottom(el);
        syncWasAtBottomFromElement(el);
      });
    },
    [runProgrammaticScroll, logScrollMetrics, syncWasAtBottomFromElement],
  );

  const isLastUnreadNearViewportBottom = useCallback(
    (root: HTMLElement): boolean => {
      if (lastUnreadId == null) {
        return true;
      }
      const target = root.querySelector<HTMLElement>(`[data-message-id="${lastUnreadId}"]`);
      if (target == null) {
        return true;
      }
      const rootRect = root.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return isElementNearViewportBottom({
        rootTop: rootRect.top,
        rootBottom: rootRect.bottom,
        elementBottom: targetRect.bottom,
        bottomThreshold: SCROLL_AT_BOTTOM_THRESHOLD,
      });
    },
    [lastUnreadId],
  );

  useEffect(() => {
    if (!hasMarkdownEmojiShortcodes && !hasRealmEmojiReactions) {
      return;
    }
    ensureCustomEmojisLoaded();
  }, [ensureCustomEmojisLoaded, hasMarkdownEmojiShortcodes, hasRealmEmojiReactions]);

  const resolveCustomEmojiImageUrl = useCallback(
    (reaction: Reaction): string | undefined => {
      if (reaction.reaction_type !== "realm_emoji") {
        return undefined;
      }
      const byCode = customEmojiById.get(reaction.emoji_code.trim());
      if (byCode != null) {
        return byCode.imgUrl;
      }
      const byName = customEmojiByName.get(normalizeEmojiShortcodeName(reaction.emoji_name));
      return byName?.imgUrl;
    },
    [customEmojiById, customEmojiByName],
  );

  const resolveCustomEmojiShortcodeImageUrl = useCallback(
    (shortcode: string): string | undefined => {
      const normalized = normalizeEmojiShortcodeName(shortcode);
      if (normalized.length === 0) return undefined;
      return customEmojiByName.get(normalized)?.imgUrl;
    },
    [customEmojiByName],
  );

  const scheduleFlashFocusedMessageId = useCallback((nextFocusedMessageId: number | null) => {
    if (focusedHighlightFrameRef.current != null) {
      cancelAnimationFrame(focusedHighlightFrameRef.current);
    }
    focusedHighlightFrameRef.current = requestAnimationFrame(() => {
      focusedHighlightFrameRef.current = null;
      setFlashFocusedMessageId(nextFocusedMessageId);
    });
  }, []);

  const messageTailLen = messages.length;
  const messageFirstId = messages[0]?.id;
  const messageLastId = messageTailLen > 0 ? messages[messageTailLen - 1]?.id : undefined;
  const capturePrependScrollSnapshot = useCallback(
    (el: HTMLElement): PendingPrependScrollSnapshot => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      messageCount: messageTailLen,
      firstMessageId: messageFirstId,
      anchor: resolveVisibleMessageAnchor(el),
    }),
    [messageFirstId, messageTailLen],
  );

  useEffect(() => {
    logMessageFlow("ui:MessageList snapshot", {
      messageLen: messageTailLen,
      firstId: messageFirstId,
      lastId: messageLastId,
      isLoadingMore,
      scrollToBottomKey,
    });
  }, [messageTailLen, messageFirstId, messageLastId, isLoadingMore, scrollToBottomKey]);

  useEffect(() => {
    const next = new Set(
      messages
        .filter(
          (m) =>
            !m.flags?.includes("read") && (currentUserId == null || m.sender_id !== currentUserId),
        )
        .map((m) => m.id),
    );
    unreadCandidatesRef.current = next;
    if (next.size === 0) {
      viewportUnreadIdsRef.current.clear();
    }
  }, [messages, currentUserId]);

  useEffect(() => {
    viewportUnreadIdsRef.current.clear();
    bottomReadDispatchKeyRef.current = null;
    userScrollSeenRef.current = false;
    programmaticScrollRef.current = false;
    pendingPrependScrollRef.current = null;
    unreadScrollKeyRef.current = null;
    suppressReadUntilMsRef.current = 0;
    prevMessagesLengthForReanchorRef.current = null;
    setUnreadAnchorId(null);
    if (scrollToBottomKey !== undefined && focusedMessageId == null) {
      openAtBottomIntentKeyRef.current = scrollToBottomKey;
    } else {
      openAtBottomIntentKeyRef.current = null;
    }
  }, [scrollToBottomKey, focusedMessageId]);

  useEffect(() => {
    if (firstUnreadId == null || unreadCount === 0) {
      setUnreadAnchorId(null);
      return;
    }
    setUnreadAnchorId((prev) => prev ?? firstUnreadId);
  }, [firstUnreadId, unreadCount, scrollToBottomKey]);

  const processIntersectionEntries = useCallback(
    (entries: readonly IntersectionObserverEntry[]) => {
      if (deferAutoMarkUnreadUntilUserScroll()) {
        return;
      }
      const candidates = unreadCandidatesRef.current;
      const visibleThisFrame: number[] = [];
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const rawId = element.getAttribute("data-message-id");
        if (!rawId) continue;
        const messageId = Number(rawId);
        if (!Number.isInteger(messageId) || !candidates.has(messageId)) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          viewportUnreadIdsRef.current.add(messageId);
          visibleThisFrame.push(messageId);
        } else {
          viewportUnreadIdsRef.current.delete(messageId);
        }
      }
      if (visibleThisFrame.length > 0 && isTabVisible()) {
        if (
          typeof performance !== "undefined" &&
          performance.now() < suppressReadUntilMsRef.current
        ) {
          return;
        }
        logScrollReadFlow("read:intersection", summarizeMessageIdsForFlowDebug(visibleThisFrame));
        onUnreadMessagesVisible?.(visibleThisFrame);
      }
    },
    [onUnreadMessagesVisible, deferAutoMarkUnreadUntilUserScroll],
  );

  const dispatchUnreadAtBottom = useCallback(() => {
    if (!onUnreadMessagesVisible && !onUnreadMessagesAtBottom) return;
    if (!isTabVisible()) return;
    if (typeof performance !== "undefined" && performance.now() < suppressReadUntilMsRef.current) {
      return;
    }
    if (deferAutoMarkUnreadUntilUserScroll()) {
      logSidebarUnreadFlow("ui:messageList:atBottom:blocked", {
        reason: "defer_until_user_scroll",
        viewportUnreadCount: viewportUnreadIdsRef.current.size,
      });
      return;
    }

    const candidateUnread = unreadCandidatesRef.current;
    for (const id of viewportUnreadIdsRef.current) {
      if (!candidateUnread.has(id)) {
        viewportUnreadIdsRef.current.delete(id);
      }
    }

    const tailReady = computeReadTailReady({
      isAtBottom: true,
      hasNewerMessages,
      loadingNewer: isLoadingNewer,
    });
    if (!tailReady) {
      logSidebarUnreadFlow("ui:messageList:atBottom:blocked", {
        reason: "tail_not_ready",
        hasNewerMessages,
        loadingNewer: isLoadingNewer,
        viewportUnreadCount: viewportUnreadIdsRef.current.size,
      });
      return;
    }

    const root = scrollRef.current;
    if (firstUnreadId != null && unreadCount > 0 && root != null) {
      if (!isLastUnreadNearViewportBottom(root)) {
        logSidebarUnreadFlow("ui:messageList:atBottom:blocked", {
          reason: "last_unread_not_near_bottom",
          firstUnreadId,
          unreadCount,
          lastUnreadId,
        });
        return;
      }
    }

    const ids = filterViewportUnreadIdsForReadDispatch(
      viewportUnreadIdsRef.current,
      messageById,
      currentUserId ?? null,
    );
    if (ids.length === 0) return;

    const sorted = [...ids].sort((a, b) => a - b);
    const dispatchKey = `${scrollToBottomKey ?? "__default__"}:${sorted.join(",")}`;
    if (bottomReadDispatchKeyRef.current === dispatchKey) return;
    bottomReadDispatchKeyRef.current = dispatchKey;

    logScrollReadFlow("read:atBottom", {
      ...summarizeMessageIdsForFlowDebug(ids),
      tailReady,
    });
    logSidebarUnreadFlow("ui:messageList:atBottom:dispatch", {
      ...summarizeMessageIdsForFlowDebug(ids),
      scrollToBottomKey: scrollToBottomKey ?? null,
    });
    onUnreadMessagesVisible?.(ids);
    if (tailReady) {
      onUnreadMessagesAtBottom?.(ids);
    }
  }, [
    onUnreadMessagesVisible,
    onUnreadMessagesAtBottom,
    messageById,
    currentUserId,
    scrollToBottomKey,
    hasNewerMessages,
    isLoadingNewer,
    deferAutoMarkUnreadUntilUserScroll,
    firstUnreadId,
    unreadCount,
    isLastUnreadNearViewportBottom,
    lastUnreadId,
  ]);

  // On chat/topic switch, remember to scroll down after messages load (?msg= uses anchor scroll instead)
  useEffect(() => {
    if (scrollToBottomKey === undefined) return;
    if (focusedMessageId != null) {
      pendingScrollToBottomKeyRef.current = null;
      return;
    }
    pendingScrollToBottomKeyRef.current = scrollToBottomKey;
  }, [scrollToBottomKey, focusedMessageId]);

  // After the user sends a message, always reveal the new tail (even with unread anchor or off-bottom scroll).
  useLayoutEffect(() => {
    if (scrollToBottomAfterSendNonce === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    userScrollSeenRef.current = true;
    bottomReadDispatchKeyRef.current = null;
    logScrollMetrics("scroll:toBottom", { reason: "afterSend" });
    runProgrammaticScroll(() => {
      scrollToBottom(el);
      syncWasAtBottomFromElement(el);
    });
    const rafId = requestAnimationFrame(() => {
      scrollToBottom(el);
      syncWasAtBottomFromElement(el);
      dispatchUnreadAtBottom();
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    scrollToBottomAfterSendNonce,
    runProgrammaticScroll,
    logScrollMetrics,
    syncWasAtBottomFromElement,
    dispatchUnreadAtBottom,
  ]);

  // Scroll down: after messages load on chat switch, or if user was already at the bottom (own message)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pending = pendingScrollToBottomKeyRef.current;
    if (pending !== null && scrollToBottomKey !== undefined && pending === scrollToBottomKey) {
      pendingScrollToBottomKeyRef.current = null;
      if (focusedMessageId != null) {
        logScrollMetrics("scroll:openSkipBottom", { reason: "focusedMessage" });
        return;
      }
      if (focusedMessageId == null && firstUnreadId != null && unreadCount > 0) {
        wasAtBottomRef.current = false;
        logScrollMetrics("scroll:openSkipBottom");
        return;
      }
      openAtBottomIntentKeyRef.current = null;
      pinTailToBottom(el, "chatOpen");
      return;
    }
    if (messages.length === 0) return;
    if (focusedMessageId != null) return;
    if (pendingPrependScrollRef.current != null) {
      logScrollMetrics("scroll:skipBottomForPendingPrepend", { reason: "messagesLengthChange" });
      syncWasAtBottomFromElement(el);
      return;
    }
    if (wasAtBottomRef.current) {
      if (deferAutoMarkUnreadUntilUserScroll()) {
        logScrollMetrics("scroll:skipBottomForUnreadAnchor", { reason: "messagesLengthChange" });
        syncWasAtBottomFromElement(el);
        return;
      }
      logScrollMetrics("scroll:toBottom", { reason: "wasAtBottom" });
      runProgrammaticScroll(() => {
        scrollToBottom(el);
        syncWasAtBottomFromElement(el);
      });
    }
  }, [
    scrollToBottomKey,
    messages.length,
    messageLastId,
    focusedMessageId,
    firstUnreadId,
    unreadCount,
    unreadAnchorId,
    pinTailToBottom,
    runProgrammaticScroll,
    logScrollMetrics,
    syncWasAtBottomFromElement,
    deferAutoMarkUnreadUntilUserScroll,
  ]);

  // After cache→API, unread flags may clear; honor open-at-bottom intent without waiting for another key change.
  useLayoutEffect(() => {
    if (scrollToBottomKey === undefined) return;
    if (focusedMessageId != null) return;
    if (firstUnreadId != null || unreadCount > 0) return;
    if (userScrollSeenRef.current) return;
    if (openAtBottomIntentKeyRef.current !== scrollToBottomKey) return;
    const pending = pendingScrollToBottomKeyRef.current;
    if (pending !== null && pending === scrollToBottomKey) return;
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;

    openAtBottomIntentKeyRef.current = null;
    pinTailToBottom(el, "openAtBottomRecovery");
  }, [
    scrollToBottomKey,
    focusedMessageId,
    firstUnreadId,
    unreadCount,
    messages.length,
    messageLastId,
    pinTailToBottom,
  ]);

  const markUserScrollIntent = useCallback(() => {
    userScrollSeenRef.current = true;
  }, []);

  const flushSingleAnchorUnreadIfVisible = useCallback(() => {
    if (unreadCount !== 1) return;
    const anchorId = unreadAnchorId ?? firstUnreadId;
    if (anchorId == null) return;
    if (!onUnreadMessagesVisible) return;
    if (!isTabVisible()) return;
    const root = scrollRef.current;
    if (root == null) return;
    if (!unreadCandidatesRef.current.has(anchorId)) return;

    const visible = collectViewportVisibleUnreadIds(root, new Set([anchorId]));
    if (visible.length === 0) return;

    for (const id of visible) {
      viewportUnreadIdsRef.current.add(id);
    }
    logScrollReadFlow("read:anchorVisible", summarizeMessageIdsForFlowDebug(visible));
    onUnreadMessagesVisible(visible);
  }, [unreadCount, unreadAnchorId, firstUnreadId, onUnreadMessagesVisible]);

  const scheduleFlushSingleAnchorUnreadIfVisible = useCallback(() => {
    const runFlush = () => {
      flushSingleAnchorUnreadIfVisible();
    };
    if (typeof performance === "undefined") {
      requestAnimationFrame(() => {
        requestAnimationFrame(runFlush);
      });
      return;
    }
    const delayMs = Math.max(0, suppressReadUntilMsRef.current - performance.now());
    if (delayMs > 0) {
      window.setTimeout(() => {
        requestAnimationFrame(runFlush);
      }, delayMs);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(runFlush);
    });
  }, [flushSingleAnchorUnreadIfVisible]);

  // Cache→API shrink/grow changes scroll metrics; re-anchor without duplicating initial scroll:toUnread.
  useLayoutEffect(() => {
    const prevLen = prevMessagesLengthForReanchorRef.current;
    prevMessagesLengthForReanchorRef.current = messages.length;
    if (prevLen == null || prevLen === messages.length) return;

    if (!deferAutoMarkUnreadUntilUserScroll()) return;
    if (focusedMessageId != null) return;
    if (pendingPrependScrollRef.current != null) return;
    const anchorId = unreadAnchorId ?? firstUnreadId;
    if (anchorId == null) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-message-id="${anchorId}"]`);
    if (target == null) return;

    logScrollMetrics("scroll:reanchorUnread", { anchorMessageId: anchorId });
    runProgrammaticScroll(() => {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      wasAtBottomRef.current = false;
      setIsAtBottom(false);
    });
    scheduleFlushSingleAnchorUnreadIfVisible();
  }, [
    deferAutoMarkUnreadUntilUserScroll,
    focusedMessageId,
    unreadAnchorId,
    firstUnreadId,
    messages.length,
    runProgrammaticScroll,
    logScrollMetrics,
    scheduleFlushSingleAnchorUnreadIfVisible,
  ]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      if (event.isTrusted && !programmaticScrollRef.current) {
        userScrollSeenRef.current = true;
      }
      const atBottom = syncWasAtBottomFromElement(el);

      if (
        userScrollSeenRef.current &&
        !programmaticScrollRef.current &&
        isLoadingMore &&
        pendingPrependScrollRef.current != null
      ) {
        const snap = capturePrependScrollSnapshot(el);
        pendingPrependScrollRef.current = snap;
        messageListLog.debug("prepend scroll snapshot updated while loading", {
          ...snap,
          clientHeight: el.clientHeight,
        });
      }

      if (event.isTrusted) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - scrollLogLastAtMsRef.current >= SCROLL_LOG_THROTTLE_MS) {
          scrollLogLastAtMsRef.current = now;
          logScrollMetrics("scroll:onScroll", { trusted: true });
        }
      }

      if (
        canAutoLoadOlder({
          userScrollSeen: userScrollSeenRef.current,
          programmaticScroll: programmaticScrollRef.current,
          scrollTop: el.scrollTop,
          loadMoreThreshold: LOAD_MORE_THRESHOLD,
          isLoadingMore,
          hasOnLoadMore: onLoadMore != null,
        })
      ) {
        const snap = capturePrependScrollSnapshot(el);
        pendingPrependScrollRef.current = snap;
        messageListLog.debug("prepend scroll snapshot before loadOlder", {
          ...snap,
          clientHeight: el.clientHeight,
        });
        onLoadMore?.();
      }

      if (
        canAutoLoadNewer({
          userScrollSeen: userScrollSeenRef.current,
          programmaticScroll: programmaticScrollRef.current,
          atBottom,
          hasNewerMessages,
          isLoadingMore,
          hasOnLoadNewer: onLoadNewer != null,
          lastUnreadNearViewportBottom: isLastUnreadNearViewportBottom(el),
        })
      ) {
        onLoadNewer?.();
      }

      if (!atBottom) {
        bottomReadDispatchKeyRef.current = null;
      }

      if (atBottom) {
        dispatchUnreadAtBottom();
      }
    },
    [
      isLoadingMore,
      onLoadMore,
      hasNewerMessages,
      onLoadNewer,
      dispatchUnreadAtBottom,
      isLastUnreadNearViewportBottom,
      capturePrependScrollSnapshot,
      logScrollMetrics,
      syncWasAtBottomFromElement,
    ],
  );

  useLayoutEffect(() => {
    const pending = pendingPrependScrollRef.current;
    if (!pending) return;
    const el = scrollRef.current;
    if (!el) return;
    const firstMessageId = messageFirstId;

    if (messages.length < pending.messageCount) {
      messageListLog.debug("prepend restore dropped pending (message list shrank)", {
        messagesLen: messages.length,
        pendingMessageCount: pending.messageCount,
      });
      pendingPrependScrollRef.current = null;
      return;
    }

    if (firstMessageId === pending.firstMessageId) {
      if (isLoadingMore) return;

      messageListLog.debug("prepend restore dropped pending (no older messages)", {
        messagesLen: messages.length,
        pendingMessageCount: pending.messageCount,
        firstMessageId,
      });
      pendingPrependScrollRef.current = null;
      return;
    }

    const snapshot = { scrollTop: pending.scrollTop, scrollHeight: pending.scrollHeight };
    const anchorScrollTop =
      pending.anchor == null ? null : computeScrollTopFromAnchor(el, pending.anchor);
    const nextTop = anchorScrollTop ?? computeScrollTopAfterPrepend(snapshot, el.scrollHeight);
    messageListLog.debug("prepend restore apply", {
      messagesLen: messages.length,
      pendingMessageCount: pending.messageCount,
      prevScrollHeight: pending.scrollHeight,
      nextScrollHeight: el.scrollHeight,
      prevScrollTop: pending.scrollTop,
      nextScrollTop: nextTop,
      firstMessageId,
      pendingFirstMessageId: pending.firstMessageId,
      anchorMessageId: pending.anchor?.messageId,
      restoreMode: anchorScrollTop == null ? "scrollHeight" : "anchor",
    });
    logScrollReadFlow("scroll:prependRestore", {
      messagesLen: messages.length,
      pendingMessageCount: pending.messageCount,
      prevScrollTop: pending.scrollTop,
      nextScrollTop: nextTop,
      prevScrollHeight: pending.scrollHeight,
      nextScrollHeight: el.scrollHeight,
      firstMessageId,
      pendingFirstMessageId: pending.firstMessageId,
      anchorMessageId: pending.anchor?.messageId,
      restoreMode: anchorScrollTop == null ? "scrollHeight" : "anchor",
    });
    runProgrammaticScroll(() => {
      el.scrollTop = nextTop;
      syncWasAtBottomFromElement(el);
    });
    pendingPrependScrollRef.current = null;
  }, [
    isLoadingMore,
    messageFirstId,
    messages.length,
    runProgrammaticScroll,
    syncWasAtBottomFromElement,
  ]);

  // Keep list pinned to the tail when viewport height changes (e.g. composer toolbar expands).
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const root = scrollRef.current;
    if (!root) return;

    let prevClientHeight = root.clientHeight;
    const observer = new ResizeObserver(() => {
      const nextClientHeight = root.clientHeight;
      if (nextClientHeight === prevClientHeight) return;

      const wasPinnedBeforeResize = wasAtBottomRef.current;
      prevClientHeight = nextClientHeight;
      if (wasPinnedBeforeResize && !deferAutoMarkUnreadUntilUserScroll()) {
        logScrollMetrics("scroll:toBottom", { reason: "viewportResize" });
        runProgrammaticScroll(() => {
          scrollToBottom(root);
          syncWasAtBottomFromElement(root);
        });
        return;
      }

      syncWasAtBottomFromElement(root);
    });

    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [
    runProgrammaticScroll,
    logScrollMetrics,
    syncWasAtBottomFromElement,
    deferAutoMarkUnreadUntilUserScroll,
  ]);

  useEffect(() => {
    if (!isAtBottom) {
      bottomReadDispatchKeyRef.current = null;
      return;
    }
    if (deferAutoMarkUnreadUntilUserScroll()) return;
    // Safety net: when list is already pinned to bottom, unread rows can appear
    // without a new user scroll event (e.g. rerender/new message). Ensure they are reported.
    dispatchUnreadAtBottom();
  }, [isAtBottom, dispatchUnreadAtBottom, deferAutoMarkUnreadUntilUserScroll]);

  // Sync isAtBottom after render (short chat without scrollbar).
  // Must be passive: auto-scroll effect should read pre-update bottom state first.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncWasAtBottomFromElement(el);
  }, [messages.length, syncWasAtBottomFromElement]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const root = scrollRef.current;
    if (!root) return;

    if (unreadCandidatesRef.current.size === 0) {
      intersectionObserverRef.current = null;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        processIntersectionEntries(entries);
      },
      {
        root,
        threshold: [0.5],
      },
    );
    intersectionObserverRef.current = observer;

    const candidates = unreadCandidatesRef.current;
    const prevObserved = observedUnreadNodesRef.current;
    const nextObserved = new Map<number, HTMLElement>();
    for (const node of root.querySelectorAll<HTMLElement>("[data-message-id]")) {
      const rawId = node.getAttribute("data-message-id");
      if (!rawId) continue;
      const messageId = Number(rawId);
      if (!Number.isInteger(messageId) || !candidates.has(messageId)) continue;
      nextObserved.set(messageId, node);
    }
    for (const [messageId, node] of prevObserved) {
      if (!nextObserved.has(messageId)) {
        observer.unobserve(node);
      }
    }
    for (const [messageId, node] of nextObserved) {
      if (!prevObserved.has(messageId)) {
        observer.observe(node);
      }
    }
    observedUnreadNodesRef.current = nextObserved;

    const rafId = requestAnimationFrame(() => {
      const pending = observer.takeRecords();
      if (pending.length > 0) {
        processIntersectionEntries(pending);
      }
      if (wasAtBottomRef.current) {
        dispatchUnreadAtBottom();
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      observedUnreadNodesRef.current.clear();
      if (intersectionObserverRef.current === observer) {
        intersectionObserverRef.current = null;
      }
    };
  }, [messages, currentUserId, processIntersectionEntries, dispatchUnreadAtBottom]);

  useEffect(() => {
    let throttleId: ReturnType<typeof setTimeout> | null = null;
    const unsub = onVisibilityChange((visible) => {
      if (!visible) return;
      if (throttleId != null) {
        clearTimeout(throttleId);
      }
      throttleId = setTimeout(() => {
        throttleId = null;
        const obs = intersectionObserverRef.current;
        if (obs != null) {
          const pending = obs.takeRecords();
          if (pending.length > 0) {
            processIntersectionEntries(pending);
          }
        }
        if (wasAtBottomRef.current) {
          dispatchUnreadAtBottom();
        }
      }, VISIBILITY_READ_RECHECK_MS);
    });
    return () => {
      unsub();
      if (throttleId != null) {
        clearTimeout(throttleId);
      }
    };
  }, [processIntersectionEntries, dispatchUnreadAtBottom]);

  const scrollFocusedMessageIntoView = useCallback(() => {
    if (focusedMessageId == null) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-message-id="${focusedMessageId}"]`);
    if (target == null) return;

    runProgrammaticScroll(() => {
      target.scrollIntoView({ block: "center", behavior: "instant" });
    });
    if (highlightedFocusedMessageRef.current !== focusedMessageId) {
      highlightedFocusedMessageRef.current = focusedMessageId;
      scheduleFlashFocusedMessageId(focusedMessageId);
      if (focusedHighlightTimerRef.current != null) {
        clearTimeout(focusedHighlightTimerRef.current);
      }
      focusedHighlightTimerRef.current = setTimeout(() => {
        setFlashFocusedMessageId((current) => (current === focusedMessageId ? null : current));
        if (highlightedFocusedMessageRef.current === focusedMessageId) {
          highlightedFocusedMessageRef.current = null;
        }
        focusedHighlightTimerRef.current = null;
      }, FOCUSED_MESSAGE_HIGHLIGHT_DURATION_MS);
    }
  }, [focusedMessageId, runProgrammaticScroll, scheduleFlashFocusedMessageId]);

  useLayoutEffect(() => {
    scrollFocusedMessageIntoView();
    const rafId = requestAnimationFrame(() => {
      scrollFocusedMessageIntoView();
    });
    return () => cancelAnimationFrame(rafId);
  }, [scrollFocusedMessageIntoView, messages.length]);

  useEffect(() => {
    if (focusedMessageId == null) {
      highlightedFocusedMessageRef.current = null;
      scheduleFlashFocusedMessageId(null);
      if (focusedHighlightTimerRef.current != null) {
        clearTimeout(focusedHighlightTimerRef.current);
        focusedHighlightTimerRef.current = null;
      }
      return;
    }
    highlightedFocusedMessageRef.current = null;
    scheduleFlashFocusedMessageId(focusedMessageId);
  }, [focusedMessageId, scheduleFlashFocusedMessageId]);

  useEffect(() => {
    return () => {
      if (focusedHighlightTimerRef.current != null) {
        clearTimeout(focusedHighlightTimerRef.current);
        focusedHighlightTimerRef.current = null;
      }
      if (focusedHighlightFrameRef.current != null) {
        cancelAnimationFrame(focusedHighlightFrameRef.current);
        focusedHighlightFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (focusedMessageId != null || unreadAnchorId == null) return;
    const el = scrollRef.current;
    if (!el) return;

    const unreadScrollKey = scrollToBottomKey ?? "__default__";
    if (unreadScrollKeyRef.current === unreadScrollKey) return;

    const target = el.querySelector<HTMLElement>(`[data-message-id="${unreadAnchorId}"]`);
    if (!target) return;
    if (typeof performance !== "undefined") {
      suppressReadUntilMsRef.current = performance.now() + INITIAL_READ_SUPPRESS_MS;
    }
    logScrollMetrics("scroll:toUnread", { anchorMessageId: unreadAnchorId });
    runProgrammaticScroll(() => {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      wasAtBottomRef.current = false;
      setIsAtBottom(false);
    });
    unreadScrollKeyRef.current = unreadScrollKey;
    scheduleFlushSingleAnchorUnreadIfVisible();
  }, [
    focusedMessageId,
    unreadAnchorId,
    scrollToBottomKey,
    messages.length,
    runProgrammaticScroll,
    logScrollMetrics,
    scheduleFlushSingleAnchorUnreadIfVisible,
  ]);

  // User-initiated scroll-to-bottom uses smooth animation — the only intentional animation here.
  const handleScrollToBottomClick = useCallback(() => {
    userScrollSeenRef.current = true;
    bottomReadDispatchKeyRef.current = null;
    const el = scrollRef.current;
    if (!el) return;
    scrollToBottom(el, "smooth");
    const dispatchAfterScroll = (): void => {
      syncWasAtBottomFromElement(el);
      dispatchUnreadAtBottom();
    };
    if ("onscrollend" in el) {
      el.addEventListener("scrollend", dispatchAfterScroll, { once: true });
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(dispatchAfterScroll);
    });
  }, [dispatchUnreadAtBottom, syncWasAtBottomFromElement]);

  const groups = useMemo(() => {
    const result: { dateKey: string; senderGroups: MockMessage[][] }[] = [];
    let currentKey = "";
    let currentItems: MockMessage[] = [];
    const flushDay = () => {
      if (currentItems.length === 0) return;
      result.push({ dateKey: currentKey, senderGroups: getSenderGroups(currentItems) });
      currentItems = [];
    };
    for (const msg of messages) {
      const dateKey = getDateKey(msg.timestamp);
      if (dateKey !== currentKey) {
        flushDay();
        currentKey = dateKey;
        currentItems = [msg];
      } else {
        currentItems.push(msg);
      }
    }
    flushDay();
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
        onWheel={markUserScrollIntent}
        onTouchMove={markUserScrollIntent}
        role="feed"
        aria-label={t("a11y.conversation")}
      >
        {groups.map(({ dateKey, senderGroups }) => (
          <div key={dateKey}>
            <div className="sticky top-0 z-sticky flex justify-center py-2">
              <span className="bg-bg-elevated/90 rounded-full border border-border-subtle px-3 py-1 text-[11px] text-text-muted">
                {dateKey}
              </span>
            </div>
            {senderGroups.map((senderMessages) => {
              const isOwn = senderMessages[0]!.sender_id === currentUserId;
              const showUnreadMarker =
                unreadAnchorId != null &&
                unreadCount > 0 &&
                senderMessages.some((m) => m.id === unreadAnchorId);
              const first = senderMessages[0]!;
              const isStream = first.stream_id != null;
              const topicKey = normalizeStreamTopicForMessageCache(first.subject ?? "");
              const topicLabel = topicKey.length > 0 ? topicKey : t("chat.generalChat");
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
                        isFocused={flashFocusedMessageId === m.id}
                        mediaGallery={mediaGallery}
                        customEmojis={customEmojis}
                        onEmojiPickerOpen={ensureCustomEmojisLoaded}
                        resolveCustomEmojiImageUrl={resolveCustomEmojiImageUrl}
                        resolveCustomEmojiShortcodeImageUrl={resolveCustomEmojiShortcodeImageUrl}
                        showTopicInSenderName={showTopicInSenderName}
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
                    focusedMessageId={flashFocusedMessageId}
                    mediaGallery={mediaGallery}
                    customEmojis={customEmojis}
                    onEmojiPickerOpen={ensureCustomEmojisLoaded}
                    resolveCustomEmojiImageUrl={resolveCustomEmojiImageUrl}
                    resolveCustomEmojiShortcodeImageUrl={resolveCustomEmojiShortcodeImageUrl}
                    showTopicInSenderName={showTopicInSenderName}
                  />
                </React.Fragment>
              );
            })}
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
      {!isAtBottom && <FloatingScrollToBottomButton onClick={handleScrollToBottomClick} />}
      <FloatingLoadingOverlay
        visible={showLoadingOverlay}
        label={t("chat.loadingMessages")}
        position={"top-left"}
      />
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = (props) => (
  <WidgetErrorBoundary sectionLabel={t("nav.messenger")}>
    <MessageListInner {...props} />
  </WidgetErrorBoundary>
);
