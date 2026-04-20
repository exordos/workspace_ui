import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { MessageList } from "~/widgets/message-list/message-list.ui";
import type { ChatPageMessageListSectionProps } from "./chat-page-message-list-section.types";

const CHAT_MESSAGE_LIST_STATE_CARD_CLASS =
  "m-3 flex min-h-0 flex-1 flex-col justify-center rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";

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
  messagesLoadError,
  onRetryMessagesLoad,
  boundaryLoadFailed,
  onDismissBoundaryLoadFailed,
}: ChatPageMessageListSectionProps) {
  const handleRetryClick = useCallback(() => {
    onRetryMessagesLoad();
  }, [onRetryMessagesLoad]);

  const handleDismissBoundary = useCallback(() => {
    onDismissBoundaryLoadFailed();
  }, [onDismissBoundaryLoadFailed]);

  // Что делает: блокирует экран только пока нет ни кэшированных, ни серверных сообщений.
  const showBlockingLoader = messagesLoading && !hasInitialPayload;
  // Что делает: когда данные уже есть, оставляет только неблокирующий overlay-индикатор.
  const showLoadingOverlay =
    !showBlockingLoader && messages.length > 0 && (messagesLoading || isLoadingMore);

  const showInitialLoadError =
    !showBlockingLoader && messages.length === 0 && messagesLoadError === "initial";

  const showRefreshLoadError = messagesLoadError === "refresh" && messages.length > 0;

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

  if (showInitialLoadError) {
    return (
      <div className={`${CHAT_MESSAGE_LIST_STATE_CARD_CLASS} items-center gap-3 text-center`}>
        <p className="text-notice-base">{t("chat.messagesLoadError")}</p>
        <button
          type="button"
          onClick={handleRetryClick}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          {t("chat.retryLoadMessages")}
        </button>
      </div>
    );
  }

  const scrollToBottomKey = isDmView
    ? activeDmUserIds !== null
      ? `dm-${activeDmUserIds.join(",")}`
      : undefined
    : [activeStream ?? "", activeTopic ?? ""].join("|");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {showRefreshLoadError ? (
        <div className="mx-3 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2 text-sm text-notice-base">
          <span className="min-w-0 flex-1">{t("chat.messagesRefreshError")}</span>
          <button
            type="button"
            onClick={handleRetryClick}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black"
          >
            {t("chat.retryLoadMessages")}
          </button>
        </div>
      ) : null}
      {boundaryLoadFailed ? (
        <div className="mx-3 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 py-2 text-sm text-notice-base">
          <span className="min-w-0 flex-1">{t("chat.boundaryPaginationError")}</span>
          <button
            type="button"
            onClick={handleDismissBoundary}
            className="shrink-0 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-primary"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : null}
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
    </div>
  );
});
