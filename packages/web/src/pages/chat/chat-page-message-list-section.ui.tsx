import React from "react";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { MessageList } from "~/widgets/message-list/message-list.ui";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.ui";

export interface ChatPageMessageListSectionProps {
  messagesLoading: boolean;
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null | undefined;
  activeTopic: string | null | undefined;
  messages: MockMessage[];
  currentUserId: number | undefined;
  callbacks: MessageListCallbacks;
  selectionMode: boolean;
  selectedMessageIds: Set<number>;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  onLoadNewer: () => void;
  hasNewerMessages: boolean;
  firstUnreadId: number | undefined;
  unreadCount: number;
  focusedMessageId: number | null | undefined;
  onUnreadMessagesVisible: (messageIds: number[]) => void;
  onUnreadMessagesAtBottom: (messageIds: number[]) => void;
}

export const ChatPageMessageListSection = React.memo(function ChatPageMessageListSection({
  messagesLoading,
  isDmView,
  activeDmUserIds,
  activeStream,
  activeTopic,
  messages,
  currentUserId,
  callbacks,
  selectionMode,
  selectedMessageIds,
  onLoadMore,
  isLoadingMore,
  onLoadNewer,
  hasNewerMessages,
  firstUnreadId,
  unreadCount,
  focusedMessageId,
  onUnreadMessagesVisible,
  onUnreadMessagesAtBottom,
}: ChatPageMessageListSectionProps) {
  if (messagesLoading) {
    return (
      <div
        className="flex min-h-[200px] flex-1 items-center justify-center"
        aria-busy="true"
        aria-label={t("chat.loadingMessages")}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
      </div>
    );
  }

  const scrollToBottomKey = isDmView
    ? activeDmUserIds !== null
      ? `dm-${activeDmUserIds.join(",")}`
      : undefined
    : [activeStream ?? "", activeTopic ?? ""].join("|");

  return (
    <MessageList
      messages={messages}
      currentUserId={currentUserId}
      scrollToBottomKey={scrollToBottomKey}
      callbacks={callbacks}
      selectionMode={selectionMode}
      selectedMessageIds={selectedMessageIds}
      onLoadMore={onLoadMore}
      isLoadingMore={isLoadingMore}
      onLoadNewer={onLoadNewer}
      hasNewerMessages={hasNewerMessages}
      firstUnreadId={firstUnreadId}
      unreadCount={unreadCount}
      focusedMessageId={focusedMessageId}
      onUnreadMessagesVisible={onUnreadMessagesVisible}
      onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
    />
  );
});
