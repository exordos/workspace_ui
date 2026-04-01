import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { resolveAvatarSrc } from "./message-avatar.lib";
import { MessageBubble, type MessageBubbleCallbacks } from "./message-bubble.ui";
import { buildMessageMediaGallery, type MessageMediaGallery } from "./message-list-media.lib";
import { getSenderGroups, scrollToBottom } from "./message-list-grouping.lib";

const SCROLL_AT_BOTTOM_THRESHOLD = 80;

export interface MessageListCallbacks {
  onMessageReply?: (message: MockMessage, selectedText?: string) => void;
  onMessageEdit?: (message: MockMessage) => void;
  onMessageDelete?: (message: MockMessage) => void;
  onMessageCopy?: (message: MockMessage) => void;
  onMessageForward?: (message: MockMessage, selectedText?: string) => void;
  onMessageStar?: (message: MockMessage) => void;
  onMessageSelect?: (message: MockMessage) => void;
  onMessageAddReaction?: (messageId: number, emojiName: string) => void;
  onMessageRemoveReaction?: (messageId: number, emojiName: string) => void;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
  onMessageViews?: (message: MockMessage) => void;
  onMessageOpenInChat?: (message: MockMessage) => void;
  onTopicSeparatorClick?: (message: MockMessage) => void;
  onMessageAuthorClick?: (userId: number) => void;
}

interface MessageListProps {
  messages: MockMessage[];
  currentUserId?: number;
  /** When the key changes (chat/topic/DM), scroll resets to the latest messages */
  scrollToBottomKey?: string;
  callbacks?: MessageListCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<number>;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onLoadNewer?: () => void;
  hasNewerMessages?: boolean;
  /** ID of the first unread message — an "unread" separator is shown above it */
  firstUnreadId?: number;
  /** Count of unread messages for marker text parity. */
  unreadCount?: number;
  /** Optional message to bring into view and visually highlight. */
  focusedMessageId?: number | null;
  /** Called when unread messages become at least 50% visible in viewport. */
  onUnreadMessagesVisible?: (messageIds: number[]) => void;
  /** Called when user reaches chat bottom with unread messages in the loaded list. */
  onUnreadMessagesAtBottom?: (messageIds: number[]) => void;
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

/** Group of messages from the same sender: single avatar at the bottom edge of the block. */
const SenderMessageGroup = React.memo(function SenderMessageGroup({
  messages,
  currentUserId,
  bubbleCallbacks,
  selectionMode,
  selectedMessageIds,
  focusedMessageId,
  mediaGallery,
}: {
  messages: MockMessage[];
  currentUserId?: number;
  bubbleCallbacks?: MessageBubbleCallbacks;
  selectionMode?: boolean;
  selectedMessageIds?: Set<number>;
  focusedMessageId?: number | null;
  mediaGallery: MessageMediaGallery;
}) {
  const user = useUsersStore((s) => s.getUser(messages[0]!.sender_id));
  const trimmedUserName = user?.full_name?.trim();
  const displayName =
    trimmedUserName != null && trimmedUserName.length > 0
      ? trimmedUserName
      : (messages[0]!.sender_full_name ?? "");
  const avatarSrc = resolveAvatarSrc(user?.avatar_url ?? undefined);
  const presenceState =
    user?.presence != null ? getPresenceState(user.presence.timestamp, user.presence.status) : null;
  const authorId = messages[0]!.sender_id;
  const handleAuthorClick = useCallback(() => {
    bubbleCallbacks?.onAuthorClick?.(authorId);
  }, [bubbleCallbacks, authorId]);

  return (
    <>
      <div className="flex items-stretch gap-2 px-4">
        <div className="flex w-12 flex-shrink-0 flex-col justify-end pb-2">
          <button
            type="button"
            onClick={handleAuthorClick}
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            aria-label={t("a11y.openUserProfile", { name: displayName })}
          >
            <span className="relative block">
              <Avatar
                size="lg"
                className="bg-bg-elevated text-accent-soft"
                src={avatarSrc ?? undefined}
              >
                {displayName.slice(0, 1)}
              </Avatar>
              <PresenceIndicator
                status={presenceState}
                size="sm"
                className="absolute bottom-0 right-0"
              />
            </span>
          </button>
        </div>
        <div className="min-w-0 flex-1">
          {messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              message={m}
              isOwn={false}
              showSenderName={i === 0}
              inSenderGroup
              currentUserId={currentUserId}
              callbacks={bubbleCallbacks}
              selectionMode={selectionMode}
              isSelected={selectedMessageIds?.has(m.id)}
              isFocused={focusedMessageId === m.id}
              mediaGallery={mediaGallery}
            />
          ))}
        </div>
      </div>
    </>
  );
});

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
          }
        : undefined,
    [callbacks],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const pendingScrollToBottomKeyRef = useRef<string | null>(null);
  const unreadScrollKeyRef = useRef<string | null>(null);
  const bottomReadDispatchKeyRef = useRef<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

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
  }, [isLoadingMore, onLoadMore, hasNewerMessages, onLoadNewer, dispatchUnreadAtBottom]);

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

    const unreadScrollKey = `${scrollToBottomKey ?? "__default__"}:${firstUnreadId}:${messages.length}`;
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

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className={`scroll-auto overscroll-behavior-contain min-h-0 flex-1 overflow-y-auto ${SCROLL_AREA_CLASS}`}
        onScroll={handleScroll}
        role="feed"
        aria-label={t("a11y.conversation")}
      >
        {isLoadingMore && (
          <div className="flex justify-center py-3" aria-busy="true">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
          </div>
        )}
        {groups.map(({ dateKey, items }) => (
          <div key={dateKey}>
            <div className="sticky top-0 z-sticky flex justify-center py-2">
              <span className="bg-bg-elevated/90 rounded-full border border-border-subtle px-3 py-1 text-[11px] text-text-muted">
                {dateKey}
              </span>
            </div>
            {(() => {
              const senderGroups = getSenderGroups(items);
              let prevTopic: string | undefined;
              return senderGroups.map((senderMessages) => {
                const isOwn = senderMessages[0]!.sender_id === currentUserId;
                const showUnreadMarker =
                  firstUnreadId != null && senderMessages.some((m) => m.id === firstUnreadId);
                const currentTopic = senderMessages[0]!.subject;
                const isStream = senderMessages[0]!.stream_id != null;
                const showTopicSeparator =
                  isStream && currentTopic && prevTopic !== undefined && prevTopic !== currentTopic;
                prevTopic = currentTopic;

                if (isOwn) {
                  return (
                    <React.Fragment key={`own-${senderMessages[0]!.id}`}>
                      {showTopicSeparator && (
                        <button
                          type="button"
                          onClick={() => callbacks?.onTopicSeparatorClick?.(senderMessages[0]!)}
                          className="my-3 flex w-full items-center gap-3 px-4 text-left"
                        >
                          <div className="h-px flex-1 bg-border-subtle" />
                          <span className="text-xs font-medium text-text-muted">
                            {currentTopic}
                          </span>
                          <div className="h-px flex-1 bg-border-subtle" />
                        </button>
                      )}
                      {showUnreadMarker && <UnreadMarker unreadCount={unreadCount} />}
                      {senderMessages.map((m, i) => (
                        <MessageBubble
                          key={m.id}
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
                        <span className="text-xs font-medium text-text-muted">{currentTopic}</span>
                        <div className="h-px flex-1 bg-border-subtle" />
                      </button>
                    )}
                    {showUnreadMarker && <UnreadMarker unreadCount={unreadCount} />}
                    <SenderMessageGroup
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
        {hasNewerMessages && !isLoadingMore && onLoadNewer && (
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
    </div>
  );
};
