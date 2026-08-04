import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isWindowActive } from "~/shared/lib/visibility";
import {
  computeWorkspaceScrollTopAfterPrepend,
  computeWorkspaceScrollTopFromRenderAnchor,
  findWorkspaceMessageNode,
  isWorkspaceScrollAtBottom,
  resolveVisibleWorkspaceMessageRenderAnchor,
  WORKSPACE_MESSAGE_UUID_ATTRIBUTE,
  WORKSPACE_MESSAGE_UUID_SELECTOR,
  type WorkspaceScrollAnchor,
  type WorkspaceScrollSnapshot,
} from "./workspace-message-list-scroll-anchor.lib";
import type React from "react";

const SCROLL_AT_BOTTOM_THRESHOLD = 80;
const LOAD_MORE_THRESHOLD = 100;
const UNREAD_VISIBILITY_THRESHOLD = 0.5;

interface PendingPrependScrollSnapshot extends WorkspaceScrollSnapshot {
  messageCount: number;
  firstMessageKey: string | undefined;
  anchor: WorkspaceScrollAnchor | null;
}

interface PendingSameMessagesScrollAnchor {
  messageKeysKey: string;
  scrollToBottomKey: string | undefined;
  anchor: WorkspaceScrollAnchor | null;
  wasAtBottom: boolean;
}

interface WorkspaceMessageListScrollOptions<TMessage> {
  messages: readonly TMessage[];
  getMessageKey: (message: TMessage) => string;
  isUnreadFromOther: (message: TMessage) => boolean;
  initialPositionReady?: boolean;
  scrollToBottomKey?: string;
  scrollToBottomAfterSendNonce?: number;
  firstUnreadKey?: string;
  unreadCount?: number;
  focusedMessageKey?: string | null;
  isLoadingOlder?: boolean;
  isLoadingNewer?: boolean;
  hasOlderMessages?: boolean;
  hasNewerMessages?: boolean;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
  onUnreadMessagesVisible?: (messageKeys: string[]) => void;
  onUnreadMessagesAtBottom?: (messageKeys: string[]) => void;
}

interface WorkspaceMessageListScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  handleWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  handleTouchMove: () => void;
  isUnreadDividerDismissed: boolean;
}

function scrollToBottom(root: HTMLElement): void {
  root.scrollTop = root.scrollHeight;
}

function getOrderedKeys<TMessage>(
  messages: readonly TMessage[],
  getMessageKey: (message: TMessage) => string,
): string[] {
  return messages.map(getMessageKey);
}

function collectVisibleUnreadKeys(root: HTMLElement, unreadKeys: ReadonlySet<string>): string[] {
  const rootRect = root.getBoundingClientRect();
  const visibleKeys: string[] = [];

  for (const node of root.querySelectorAll<HTMLElement>(WORKSPACE_MESSAGE_UUID_SELECTOR)) {
    const messageKey = node.getAttribute(WORKSPACE_MESSAGE_UUID_ATTRIBUTE);

    if (messageKey == null || !unreadKeys.has(messageKey)) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);

    if (rect.height <= 0 || visibleHeight / rect.height < UNREAD_VISIBILITY_THRESHOLD) {
      continue;
    }

    visibleKeys.push(messageKey);
  }

  return visibleKeys;
}

export function useWorkspaceMessageListScroll<TMessage>({
  messages,
  getMessageKey,
  isUnreadFromOther,
  initialPositionReady = true,
  scrollToBottomKey,
  scrollToBottomAfterSendNonce = 0,
  firstUnreadKey,
  unreadCount = 0,
  focusedMessageKey = null,
  isLoadingOlder = false,
  isLoadingNewer = false,
  hasOlderMessages = false,
  hasNewerMessages = false,
  onLoadOlder,
  onLoadNewer,
  onUnreadMessagesVisible,
  onUnreadMessagesAtBottom,
}: WorkspaceMessageListScrollOptions<TMessage>): WorkspaceMessageListScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingPrependScrollRef = useRef<PendingPrependScrollSnapshot | null>(null);
  const pendingSameMessagesScrollAnchorRef = useRef<PendingSameMessagesScrollAnchor | null>(null);
  const wasAtBottomRef = useRef(true);
  const userScrollSeenRef = useRef(false);
  const userScrolledAwayFromBottomRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const topPaginationArmedRef = useRef(true);
  const previousFirstMessageKeyForTopPaginationRef = useRef<string | undefined>(undefined);
  const initialPositionAppliedKeyRef = useRef<string | null>(null);
  const unreadDividerDismissedRef = useRef(false);
  const lastScrollTopRef = useRef<number | null>(null);
  const bottomUnreadDispatchKeyRef = useRef<string | null>(null);
  const observedUnreadNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const viewportUnreadKeysRef = useRef<Set<string>>(new Set());
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isUnreadDividerDismissed, setIsUnreadDividerDismissed] = useState(false);
  const isInitialPositionApplied = useCallback(
    () => initialPositionAppliedKeyRef.current === (scrollToBottomKey ?? "__default__"),
    [scrollToBottomKey],
  );

  const messageKeys = useMemo(
    () => getOrderedKeys(messages, getMessageKey),
    [messages, getMessageKey],
  );
  const messageKeysKey = useMemo(() => messageKeys.join("\u0001"), [messageKeys]);
  const messageCount = messageKeys.length;
  const firstMessageKey = messageKeys[0];
  const lastMessageKey = messageKeys[messageKeys.length - 1];
  const messageOrderIndexByKey = useMemo(() => {
    const result = new Map<string, number>();

    messageKeys.forEach((messageKey, index) => {
      result.set(messageKey, index);
    });

    return result;
  }, [messageKeys]);
  const unreadCandidateKeys = useMemo(() => {
    const result = new Set<string>();

    for (const message of messages) {
      if (isUnreadFromOther(message)) {
        result.add(getMessageKey(message));
      }
    }

    return result;
  }, [getMessageKey, isUnreadFromOther, messages]);

  const syncAtBottomFromElement = useCallback((root: HTMLElement): boolean => {
    const atBottom = isWorkspaceScrollAtBottom(root, SCROLL_AT_BOTTOM_THRESHOLD);

    wasAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);

    return atBottom;
  }, []);

  const runProgrammaticScroll = useCallback((scrollAction: () => void) => {
    programmaticScrollRef.current = true;
    scrollAction();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    });
  }, []);

  const dismissUnreadDividerIfPassed = useCallback(
    (root: HTMLElement): void => {
      if (firstUnreadKey == null || unreadDividerDismissedRef.current) {
        return;
      }

      const divider = root.querySelector<HTMLElement>("[data-unread-divider-anchor='true']");

      if (divider == null || root.clientHeight <= 0) {
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const dividerRect = divider.getBoundingClientRect();

      if (dividerRect.top >= rootRect.top || dividerRect.bottom > rootRect.top) {
        return;
      }

      unreadDividerDismissedRef.current = true;
      setIsUnreadDividerDismissed(true);
    },
    [firstUnreadKey],
  );

  const pinTailToBottom = useCallback(
    (root: HTMLElement): void => {
      runProgrammaticScroll(() => {
        scrollToBottom(root);
        syncAtBottomFromElement(root);
      });

      requestAnimationFrame(() => {
        scrollToBottom(root);
        syncAtBottomFromElement(root);
      });
    },
    [runProgrammaticScroll, syncAtBottomFromElement],
  );

  const capturePrependScrollSnapshot = useCallback(
    (root: HTMLElement): PendingPrependScrollSnapshot => ({
      scrollTop: root.scrollTop,
      scrollHeight: root.scrollHeight,
      messageCount,
      firstMessageKey,
      anchor: resolveVisibleWorkspaceMessageRenderAnchor(root),
    }),
    [firstMessageKey, messageCount],
  );

  const sortKeysByMessageOrder = useCallback(
    (messageKeysToSort: readonly string[]): string[] => {
      return [...messageKeysToSort].sort((firstKey, secondKey) => {
        const firstIndex = messageOrderIndexByKey.get(firstKey) ?? Number.MAX_SAFE_INTEGER;
        const secondIndex = messageOrderIndexByKey.get(secondKey) ?? Number.MAX_SAFE_INTEGER;

        if (firstIndex !== secondIndex) {
          return firstIndex - secondIndex;
        }

        return firstKey.localeCompare(secondKey);
      });
    },
    [messageOrderIndexByKey],
  );

  const dispatchUnreadAtBottom = useCallback(() => {
    if (!isInitialPositionApplied()) {
      return;
    }

    if (!onUnreadMessagesVisible && !onUnreadMessagesAtBottom) {
      return;
    }

    if (hasNewerMessages || isLoadingNewer) {
      return;
    }

    const root = scrollContainerRef.current;

    if (root == null) {
      return;
    }

    const visibleKeys = collectVisibleUnreadKeys(root, unreadCandidateKeys);

    if (visibleKeys.length === 0) {
      return;
    }

    const orderedKeys = sortKeysByMessageOrder(visibleKeys);
    const dispatchKey = `${scrollToBottomKey ?? "__default__"}:${orderedKeys.join(",")}`;

    if (bottomUnreadDispatchKeyRef.current === dispatchKey) {
      return;
    }

    bottomUnreadDispatchKeyRef.current = dispatchKey;
    onUnreadMessagesVisible?.(orderedKeys);
    onUnreadMessagesAtBottom?.(orderedKeys);
  }, [
    hasNewerMessages,
    isInitialPositionApplied,
    isLoadingNewer,
    onUnreadMessagesAtBottom,
    onUnreadMessagesVisible,
    scrollToBottomKey,
    sortKeysByMessageOrder,
    unreadCandidateKeys,
  ]);

  const processIntersectionEntries = useCallback(
    (entries: readonly IntersectionObserverEntry[]) => {
      const visibleThisFrame: string[] = [];

      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const messageKey = element.getAttribute(WORKSPACE_MESSAGE_UUID_ATTRIBUTE);

        if (messageKey == null || !unreadCandidateKeys.has(messageKey)) {
          continue;
        }

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          viewportUnreadKeysRef.current.add(messageKey);
          visibleThisFrame.push(messageKey);
        } else {
          viewportUnreadKeysRef.current.delete(messageKey);
        }
      }

      if (visibleThisFrame.length > 0) {
        onUnreadMessagesVisible?.(sortKeysByMessageOrder(visibleThisFrame));
      }
    },
    [onUnreadMessagesVisible, sortKeysByMessageOrder, unreadCandidateKeys],
  );

  useEffect(() => {
    const dispatchVisibleUnreadAfterFocus = (): void => {
      if (!isWindowActive() || !isInitialPositionApplied()) {
        return;
      }

      const root = scrollContainerRef.current;

      if (root == null) {
        return;
      }

      const visibleKeys = collectVisibleUnreadKeys(root, unreadCandidateKeys);

      if (visibleKeys.length > 0) {
        onUnreadMessagesVisible?.(sortKeysByMessageOrder(visibleKeys));
      }
    };

    window.addEventListener("focus", dispatchVisibleUnreadAfterFocus);
    document.addEventListener("visibilitychange", dispatchVisibleUnreadAfterFocus);

    return () => {
      window.removeEventListener("focus", dispatchVisibleUnreadAfterFocus);
      document.removeEventListener("visibilitychange", dispatchVisibleUnreadAfterFocus);
    };
  }, [
    isInitialPositionApplied,
    onUnreadMessagesVisible,
    sortKeysByMessageOrder,
    unreadCandidateKeys,
  ]);

  useEffect(() => {
    viewportUnreadKeysRef.current.clear();
    bottomUnreadDispatchKeyRef.current = null;
  }, [unreadCandidateKeys]);

  useLayoutEffect(() => {
    viewportUnreadKeysRef.current.clear();
    bottomUnreadDispatchKeyRef.current = null;
    userScrollSeenRef.current = false;
    wasAtBottomRef.current = true;
    userScrolledAwayFromBottomRef.current = false;
    programmaticScrollRef.current = false;
    pendingPrependScrollRef.current = null;
    pendingSameMessagesScrollAnchorRef.current = null;
    topPaginationArmedRef.current = true;
    previousFirstMessageKeyForTopPaginationRef.current = undefined;
    initialPositionAppliedKeyRef.current = null;
    lastScrollTopRef.current = null;
    setIsAtBottom(true);
  }, [focusedMessageKey, scrollToBottomKey]);

  useEffect(() => {
    const previousFirstMessageKey = previousFirstMessageKeyForTopPaginationRef.current;

    if (previousFirstMessageKey !== undefined && previousFirstMessageKey !== firstMessageKey) {
      topPaginationArmedRef.current = true;
    }

    previousFirstMessageKeyForTopPaginationRef.current = firstMessageKey;
  }, [firstMessageKey]);

  useLayoutEffect(() => {
    const pending = pendingSameMessagesScrollAnchorRef.current;
    pendingSameMessagesScrollAnchorRef.current = null;

    if (
      pending?.messageKeysKey === messageKeysKey &&
      pending.scrollToBottomKey === scrollToBottomKey &&
      !pending.wasAtBottom &&
      pending.anchor != null &&
      pendingPrependScrollRef.current == null
    ) {
      const root = scrollContainerRef.current;
      const nextScrollTop =
        root == null ? null : computeWorkspaceScrollTopFromRenderAnchor(root, pending.anchor);

      if (root != null && nextScrollTop != null && Math.abs(root.scrollTop - nextScrollTop) >= 1) {
        // Когда меняется высота уже видимого сообщения, DOM-узлы остаются теми же.
        // Поэтому держим старый верхний видимый uuid и возвращаем его на прежнее
        // расстояние от верха окна, вместо грубого скролла вниз.
        runProgrammaticScroll(() => {
          root.scrollTop = nextScrollTop;
          syncAtBottomFromElement(root);
        });
      }
    }

    return () => {
      const root = scrollContainerRef.current;

      pendingSameMessagesScrollAnchorRef.current =
        root == null
          ? null
          : {
              messageKeysKey,
              scrollToBottomKey,
              anchor: resolveVisibleWorkspaceMessageRenderAnchor(root),
              wasAtBottom: wasAtBottomRef.current,
            };
    };
  }, [messageKeysKey, messages, runProgrammaticScroll, scrollToBottomKey, syncAtBottomFromElement]);

  useLayoutEffect(() => {
    if (scrollToBottomAfterSendNonce === 0 || !isInitialPositionApplied()) {
      return;
    }

    const root = scrollContainerRef.current;

    if (root == null) {
      return;
    }

    userScrollSeenRef.current = true;
    userScrolledAwayFromBottomRef.current = false;
    bottomUnreadDispatchKeyRef.current = null;
    pinTailToBottom(root);
    dispatchUnreadAtBottom();
  }, [
    dispatchUnreadAtBottom,
    isInitialPositionApplied,
    pinTailToBottom,
    scrollToBottomAfterSendNonce,
  ]);

  const applyInitialPosition = useCallback(
    (root: HTMLElement, initialPositionKey: string): void => {
      if (!initialPositionReady) return;

      if (messageCount === 0) {
        initialPositionAppliedKeyRef.current = initialPositionKey;
        return;
      }

      if (focusedMessageKey != null) {
        const target = findWorkspaceMessageNode(root, focusedMessageKey);
        if (target == null || typeof target.scrollIntoView !== "function") return;

        runProgrammaticScroll(() => {
          target.scrollIntoView({ block: "center", behavior: "instant" });
          syncAtBottomFromElement(root);
        });
        initialPositionAppliedKeyRef.current = initialPositionKey;
        return;
      }

      if (firstUnreadKey != null && unreadCount > 0) {
        const target = findWorkspaceMessageNode(root, firstUnreadKey);
        if (target == null || typeof target.scrollIntoView !== "function") return;

        runProgrammaticScroll(() => {
          target.scrollIntoView({ block: "center", behavior: "instant" });
        });
        wasAtBottomRef.current = false;
        setIsAtBottom(false);
        initialPositionAppliedKeyRef.current = initialPositionKey;
        return;
      }

      pinTailToBottom(root);
      initialPositionAppliedKeyRef.current = initialPositionKey;
    },
    [
      firstUnreadKey,
      focusedMessageKey,
      initialPositionReady,
      messageCount,
      pinTailToBottom,
      runProgrammaticScroll,
      syncAtBottomFromElement,
      unreadCount,
    ],
  );

  useLayoutEffect(() => {
    const root = scrollContainerRef.current;

    if (root == null) {
      return;
    }

    const initialPositionKey = scrollToBottomKey ?? "__default__";
    if (initialPositionAppliedKeyRef.current !== initialPositionKey) {
      applyInitialPosition(root, initialPositionKey);
      return;
    }

    if (messageCount === 0) {
      return;
    }

    if (focusedMessageKey != null || pendingPrependScrollRef.current != null) {
      syncAtBottomFromElement(root);
      return;
    }

    if (wasAtBottomRef.current && !userScrolledAwayFromBottomRef.current) {
      // Append внизу должен ощущаться как продолжение живого диалога.
      // Если пользователь уже ушел читать историю выше, этот флаг будет false
      // и новые сообщения не отберут у него текущую позицию.
      pinTailToBottom(root);
      return;
    }

    syncAtBottomFromElement(root);
  }, [
    applyInitialPosition,
    focusedMessageKey,
    lastMessageKey,
    messageCount,
    pinTailToBottom,
    scrollToBottomKey,
    syncAtBottomFromElement,
  ]);

  useLayoutEffect(() => {
    const pending = pendingPrependScrollRef.current;

    if (pending == null) {
      return;
    }

    const root = scrollContainerRef.current;

    if (root == null) {
      return;
    }

    if (messageCount < pending.messageCount) {
      pendingPrependScrollRef.current = null;
      return;
    }

    if (firstMessageKey === pending.firstMessageKey) {
      if (isLoadingOlder) {
        return;
      }

      pendingPrependScrollRef.current = null;
      return;
    }

    const snapshot = {
      scrollTop: pending.scrollTop,
      scrollHeight: pending.scrollHeight,
    };
    const anchorScrollTop =
      pending.anchor == null
        ? null
        : computeWorkspaceScrollTopFromRenderAnchor(root, pending.anchor);
    const nextScrollTop =
      anchorScrollTop ?? computeWorkspaceScrollTopAfterPrepend(snapshot, root.scrollHeight);

    // Это ключевая часть prepend: после вставки истории сверху браузер оставляет
    // прежний scrollTop, из-за чего видимое сообщение прыгает вниз. Мы возвращаем
    // тот же uuid на тот же отступ от верха, а если узел исчез - используем дельту
    // scrollHeight как запасной расчет.
    runProgrammaticScroll(() => {
      root.scrollTop = nextScrollTop;
      syncAtBottomFromElement(root);
    });
    pendingPrependScrollRef.current = null;
  }, [
    firstMessageKey,
    isLoadingOlder,
    messageCount,
    runProgrammaticScroll,
    syncAtBottomFromElement,
  ]);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const root = scrollContainerRef.current;

    if (root == null) {
      return;
    }

    let previousClientHeight = root.clientHeight;
    const observer = new ResizeObserver(() => {
      if (!isInitialPositionApplied()) {
        return;
      }

      const nextClientHeight = root.clientHeight;

      if (nextClientHeight === previousClientHeight) {
        return;
      }

      previousClientHeight = nextClientHeight;

      if (wasAtBottomRef.current && !userScrolledAwayFromBottomRef.current) {
        pinTailToBottom(root);
        return;
      }

      syncAtBottomFromElement(root);
    });

    observer.observe(root);

    return () => {
      observer.disconnect();
    };
  }, [isInitialPositionApplied, pinTailToBottom, syncAtBottomFromElement]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const root = scrollContainerRef.current;

    if (root == null || unreadCandidateKeys.size === 0 || !isInitialPositionApplied()) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        processIntersectionEntries(entries);
      },
      {
        root,
        threshold: [UNREAD_VISIBILITY_THRESHOLD],
      },
    );
    const previousObservedNodes = observedUnreadNodesRef.current;
    const nextObservedNodes = new Map<string, HTMLElement>();

    for (const node of root.querySelectorAll<HTMLElement>(WORKSPACE_MESSAGE_UUID_SELECTOR)) {
      const messageKey = node.getAttribute(WORKSPACE_MESSAGE_UUID_ATTRIBUTE);

      if (messageKey == null || !unreadCandidateKeys.has(messageKey)) {
        continue;
      }

      nextObservedNodes.set(messageKey, node);
    }

    for (const [messageKey, node] of previousObservedNodes) {
      if (!nextObservedNodes.has(messageKey)) {
        observer.unobserve(node);
      }
    }

    for (const [messageKey, node] of nextObservedNodes) {
      if (!previousObservedNodes.has(messageKey)) {
        observer.observe(node);
      }
    }

    observedUnreadNodesRef.current = nextObservedNodes;
    intersectionObserverRef.current = observer;

    const frameId = requestAnimationFrame(() => {
      const pendingEntries = observer.takeRecords();

      if (pendingEntries.length > 0) {
        processIntersectionEntries(pendingEntries);
      }

      if (wasAtBottomRef.current) {
        dispatchUnreadAtBottom();
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      observedUnreadNodesRef.current.clear();

      if (intersectionObserverRef.current === observer) {
        intersectionObserverRef.current = null;
      }
    };
  }, [
    dispatchUnreadAtBottom,
    isInitialPositionApplied,
    processIntersectionEntries,
    unreadCandidateKeys,
  ]);

  useEffect(() => {
    const root = scrollContainerRef.current;

    if (root == null) {
      return;
    }

    const atBottom = syncAtBottomFromElement(root);

    if (atBottom) {
      dispatchUnreadAtBottom();
    }
  }, [dispatchUnreadAtBottom, messageCount, syncAtBottomFromElement]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const root = scrollContainerRef.current;

      if (root == null) {
        return;
      }

      const isTrustedUserScroll = event.nativeEvent.isTrusted && !programmaticScrollRef.current;
      const previousScrollTop = lastScrollTopRef.current;
      lastScrollTopRef.current = root.scrollTop;

      if (isTrustedUserScroll) {
        userScrollSeenRef.current = true;
        if (previousScrollTop != null && root.scrollTop > previousScrollTop) {
          dismissUnreadDividerIfPassed(root);
        }
      }

      const atBottom = syncAtBottomFromElement(root);

      if (isTrustedUserScroll) {
        userScrolledAwayFromBottomRef.current = !atBottom;
      }

      if (root.scrollTop >= LOAD_MORE_THRESHOLD) {
        topPaginationArmedRef.current = true;
      }

      if (
        userScrollSeenRef.current &&
        !programmaticScrollRef.current &&
        isLoadingOlder &&
        pendingPrependScrollRef.current != null
      ) {
        pendingPrependScrollRef.current = capturePrependScrollSnapshot(root);
      }

      if (
        userScrollSeenRef.current &&
        !programmaticScrollRef.current &&
        hasOlderMessages &&
        !isLoadingOlder &&
        onLoadOlder != null &&
        topPaginationArmedRef.current &&
        root.scrollTop <= LOAD_MORE_THRESHOLD
      ) {
        pendingPrependScrollRef.current = capturePrependScrollSnapshot(root);
        topPaginationArmedRef.current = false;
        onLoadOlder();
      }

      if (
        userScrollSeenRef.current &&
        !programmaticScrollRef.current &&
        atBottom &&
        hasNewerMessages &&
        !isLoadingNewer &&
        onLoadNewer != null
      ) {
        onLoadNewer();
      }

      if (!atBottom) {
        bottomUnreadDispatchKeyRef.current = null;
      } else {
        dispatchUnreadAtBottom();
      }
    },
    [
      capturePrependScrollSnapshot,
      dispatchUnreadAtBottom,
      hasNewerMessages,
      hasOlderMessages,
      isLoadingNewer,
      isLoadingOlder,
      onLoadNewer,
      onLoadOlder,
      syncAtBottomFromElement,
      dismissUnreadDividerIfPassed,
    ],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      userScrollSeenRef.current = true;

      const root = scrollContainerRef.current;
      if (root != null) {
        lastScrollTopRef.current = root.scrollTop;
      }

      if (event.deltaY < 0) {
        userScrolledAwayFromBottomRef.current = true;
        wasAtBottomRef.current = false;
        setIsAtBottom(false);
        return;
      }

      if (root == null) {
        return;
      }

      dismissUnreadDividerIfPassed(root);

      const atBottom = syncAtBottomFromElement(root);
      userScrolledAwayFromBottomRef.current = !atBottom;
    },
    [dismissUnreadDividerIfPassed, syncAtBottomFromElement],
  );

  const handleTouchMove = useCallback(() => {
    userScrollSeenRef.current = true;

    const root = scrollContainerRef.current;
    if (root != null) {
      lastScrollTopRef.current = root.scrollTop;
    }
  }, []);

  return {
    scrollContainerRef,
    isAtBottom,
    handleScroll,
    handleWheel,
    handleTouchMove,
    isUnreadDividerDismissed,
  };
}
