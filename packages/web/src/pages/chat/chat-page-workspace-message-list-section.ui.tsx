import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Spinner } from "~/shared/ui/spinner.ui";
import { WorkspaceMessageList } from "~/widgets/workspace-message-list/workspace-message-list.ui";
import type { ChatPageWorkspaceMessageListSectionProps } from "./chat-page-workspace-message-list-section.types";

const CHAT_MESSAGE_LIST_STATE_CARD_CLASS =
  "m-3 flex min-h-0 flex-1 flex-col justify-center rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";

export const ChatPageWorkspaceMessageListSection = React.memo(
  function ChatPageWorkspaceMessageListSection({
    messagesLoading,
    hasInitialPayload,
    initialPositionReady,
    messages,
    outgoingMessages,
    resolveServerMessageRenderKey,
    currentUserUuid,
    conversationId,
    scrollToBottomKey,
    onLoadOlder,
    isLoadingOlder,
    isLoadingNewer,
    onLoadNewer,
    hasOlderMessages,
    hasNewerMessages,
    firstUnreadUuid,
    unreadCount,
    focusedMessageUuid,
    selectionMode,
    selectedMessageUuids,
    onUnreadMessagesVisible,
    onUnreadMessagesAtBottom,
    onReplyMessage,
    onAddReplyMessage,
    onForwardMessage,
    onOpenMessageInChat,
    onOpenWorkspaceReference,
    jitsiServerBaseUrl,
    jitsiLocationName,
    onOpenJitsiCall,
    onOpenMentionUser,
    onToggleMessageSelection,
    onEditMessage,
    onRequestDeleteMessage,
    onCopyMessageText,
    onToggleMessageReaction,
    onDownloadFile,
    onLoadWorkspaceFilePreview,
    onOpenWorkspaceMedia,
    onOpenUnsupportedFilePreview,
    onRetryOutgoingMessage,
    onRemoveOutgoingMessage,
    messagesLoadError,
    onRetryMessagesLoad,
    boundaryLoadFailed,
    onDismissBoundaryLoadFailed,
    scrollToBottomAfterSendNonce,
    resolveAuthorLabel,
    resolveTopicLabel,
    presentation,
    resolveMention,
  }: ChatPageWorkspaceMessageListSectionProps) {
    const handleRetryClick = useCallback(() => {
      onRetryMessagesLoad();
    }, [onRetryMessagesLoad]);

    const handleDismissBoundary = useCallback(() => {
      onDismissBoundaryLoadFailed();
    }, [onDismissBoundaryLoadFailed]);

    const showBlockingLoader = messagesLoading && !hasInitialPayload;
    const showLoadingOverlay =
      !showBlockingLoader && messages.length > 0 && (messagesLoading || isLoadingOlder);
    const showInitialLoadError = !showBlockingLoader && messagesLoadError === "initial";
    const showRefreshLoadError = messagesLoadError === "refresh" && messages.length > 0;
    const messageActions = React.useMemo(
      () => ({
        jitsiServerBaseUrl,
        jitsiLocationName,
        onReplyMessage,
        onForwardMessage,
        onOpenMessageInChat,
        onOpenWorkspaceReference,
        onOpenAuthorProfile: onOpenMentionUser,
        onOpenJitsiCall,
        onOpenMentionUser,
        onAddReplyMessage,
        onToggleMessageSelection,
        onEditMessage,
        onRequestDeleteMessage,
        onCopyMessageText,
        onToggleMessageReaction,
        onDownloadFile,
        onLoadWorkspaceFilePreview,
        onOpenWorkspaceMedia,
        onOpenUnsupportedFilePreview,
        onRetryOutgoingMessage,
        onRemoveOutgoingMessage,
      }),
      [
        jitsiServerBaseUrl,
        jitsiLocationName,
        onCopyMessageText,
        onDownloadFile,
        onEditMessage,
        onForwardMessage,
        onOpenMentionUser,
        onLoadWorkspaceFilePreview,
        onOpenMessageInChat,
        onOpenWorkspaceReference,
        onOpenJitsiCall,
        onOpenWorkspaceMedia,
        onOpenUnsupportedFilePreview,
        onAddReplyMessage,
        onRemoveOutgoingMessage,
        onReplyMessage,
        onRequestDeleteMessage,
        onRetryOutgoingMessage,
        onToggleMessageSelection,
        onToggleMessageReaction,
      ],
    );

    if (showBlockingLoader) {
      return (
        <div
          className="flex min-h-[200px] flex-1 items-center justify-center"
          aria-busy="true"
          aria-label={t("chat.loadingMessages")}
        >
          <Spinner size="lg" />
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

    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {showRefreshLoadError ? (
          <div className="bg-bg-elevated/50 mx-3 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-notice-base">
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
          <div className="bg-bg-elevated/50 mx-3 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-notice-base">
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
        <FloatingLoadingOverlay
          visible={showLoadingOverlay}
          label={t("chat.loadingMessages")}
          position="top-left"
        />
        <WorkspaceMessageList
          key={conversationId}
          messages={messages}
          outgoingMessages={outgoingMessages}
          resolveServerMessageRenderKey={resolveServerMessageRenderKey}
          currentUserUuid={currentUserUuid}
          conversationId={conversationId}
          initialPositionReady={initialPositionReady}
          scrollToBottomKey={scrollToBottomKey}
          scrollToBottomAfterSendNonce={scrollToBottomAfterSendNonce}
          firstUnreadUuid={firstUnreadUuid}
          unreadCount={unreadCount}
          focusedMessageUuid={focusedMessageUuid}
          selectionMode={selectionMode}
          selectedMessageUuids={selectedMessageUuids}
          isLoadingOlder={isLoadingOlder}
          isLoadingNewer={isLoadingNewer}
          hasOlderMessages={hasOlderMessages}
          hasNewerMessages={hasNewerMessages}
          onLoadOlder={onLoadOlder}
          onLoadNewer={onLoadNewer}
          onUnreadMessagesVisible={onUnreadMessagesVisible}
          onUnreadMessagesAtBottom={onUnreadMessagesAtBottom}
          resolveAuthorLabel={resolveAuthorLabel}
          resolveTopicLabel={resolveTopicLabel}
          presentation={presentation}
          resolveMention={resolveMention}
          actions={messageActions}
        />
      </div>
    );
  },
);
