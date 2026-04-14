import React from "react";
import { t } from "~/i18n/i18n";
import { MessageList } from "~/widgets/message-list/message-list.ui";
import type { ChatPageMessageListSectionProps } from "./chat-page-message-list-section.types";

export const ChatPageMessageListSection = React.memo(function ChatPageMessageListSection({
  messagesLoading,
  hasInitialPayload,
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
  // Что делает: блокирует экран только пока нет ни кэшированных, ни серверных сообщений.
  const showBlockingLoader = messagesLoading && !hasInitialPayload;
  // Что делает: когда данные уже есть, оставляет только неблокирующий overlay-индикатор.
  const showLoadingOverlay =
    !showBlockingLoader && messages.length > 0 && (messagesLoading || isLoadingMore);

  if (showBlockingLoader) {
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
      showLoadingOverlay={showLoadingOverlay}
    />
  );
});
