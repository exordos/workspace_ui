import React, { useCallback, useSyncExternalStore } from "react";
import { useMessagePresentations } from "~/applications/messenger/features/decrypted-message/message-presentation.hook";
import { EMPTY_MESSAGE_WINDOW } from "~/applications/messenger/model/messages/messages";
import { ChatBackground } from "~/features/chat-background/chat-background.ui";
import { t } from "~/i18n/i18n";
import { FloatingLoadingOverlay, Spinner } from "~/shared/ui/loading";
import { WorkspaceMessageList } from "./workspace-message-list.ui";
import type { ChatPageWorkspaceMessageListSectionProps } from "./chat-page-workspace-message-list-section.types";
import type { WorkspaceMessageListProps } from "./workspace-message-list.types";

const CHAT_MESSAGE_LIST_STATE_CARD_CLASS =
  "m-3 flex min-h-0 flex-1 flex-col justify-center rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";

const noop = () => undefined;

// Рабочий вход ленты. Подписку и подготовку монтируем только вместе со списком.
function TimelineConnected({
  messagesModel,
  conversationId,
  ...props
}: Omit<WorkspaceMessageListProps, "messages"> &
  Pick<ChatPageWorkspaceMessageListSectionProps, "messagesModel">) {
  const getWindow = useCallback(
    () => messagesModel?.getWindow(conversationId) ?? EMPTY_MESSAGE_WINDOW,
    [messagesModel, conversationId],
  );
  const subscribe = useCallback(
    (notify: () => void) => messagesModel?.subscribeWindow(conversationId, notify) ?? noop,
    [messagesModel, conversationId],
  );
  const { messages } = useSyncExternalStore(subscribe, getWindow, getWindow);
  const prepared = useMessagePresentations(messages, conversationId, true);
  return (
    <WorkspaceMessageList
      {...props}
      conversationId={conversationId}
      messages={messages}
      prepared={prepared}
    />
  );
}

export const ChatPageWorkspaceMessageListSection = React.memo(
  function ChatPageWorkspaceMessageListSection({
    messagesLoading,
    hasInitialPayload,
    initialPositionReady,
    initialPositionCancelled,
    onUserScrollInput,
    messages,
    messagesModel,
    outgoingMessages,
    currentUserUuid,
    conversationId,
    scrollToBottomKey,
    onLoadOlder,
    isLoadingOlder,
    isLoadingNewer,
    onLoadNewer,
    hasOlderMessages,
    hasNewerMessages,
    lastMessageUuid,
    onLoadLatestWindow,
    onCancelLatestWindowLoad,
    onTailNavigationRequested,
    firstUnreadUuid,
    unreadCount,
    focusedMessageTarget,
    anchorHandoffPending = false,
    anchorNavigationActive = false,
    onFocusedMessageApplied,
    onFocusedMessageMissing,
    selectionMode,
    selectedMessageUuids,
    readRequestBoundaryMessageUuids,
    onUnreadMessagesVisible,
    onUnreadMessagesAtBottom,
    onRequestMessageKey,
    onRequestSecretKey,
    requestMessageKeyPending,
    getKeyRequestActions,
    getKeyServiceState,
    onReplySelectedMessages,
    onReplyMessage,
    onAddReplyMessage,
    onForwardMessage,
    onOpenMessageInChat,
    onOpenMessagePermalink,
    messageWebOrigin,
    onOpenWorkspaceReference,
    jitsiServerBaseUrl,
    jitsiLocationName,
    onOpenJitsiCall,
    onOpenMentionUser,
    onToggleMessageSelection,
    onEditMessage,
    onRequestDeleteMessage,
    onCopyMessageText,
    onCopyMessageLink,
    onToggleMessageReaction,
    onDownloadFile,
    downloadOwnerKey,
    onLoadWorkspaceFilePreview,
    onOpenWorkspaceMedia,
    onOpenUnsupportedFilePreview,
    onRetryOutgoingMessage,
    onRemoveOutgoingMessage,
    messagesLoadError,
    onRetryMessagesLoad,
    boundaryLoadFailed,
    onRetryBoundaryLoad,
    scrollToBottomAfterSendNonce,
    resolveAuthorLabel,
    resolveTopicLabel,
    presentation,
    resolveMention,
  }: ChatPageWorkspaceMessageListSectionProps) {
    const handleRetryClick = useCallback(() => {
      onRetryMessagesLoad();
    }, [onRetryMessagesLoad]);

    const handleRetryBoundary = useCallback(() => {
      onRetryBoundaryLoad();
    }, [onRetryBoundaryLoad]);

    const showBlockingLoader = messagesLoading && !hasInitialPayload;
    const showLoadingOverlay =
      !showBlockingLoader && messages.length > 0 && (messagesLoading || isLoadingOlder);
    const showInitialLoadError = !showBlockingLoader && messagesLoadError === "initial";
    const showRefreshLoadError = messagesLoadError === "refresh" && messages.length > 0;
    const messageActions = React.useMemo(
      () => ({
        jitsiServerBaseUrl,
        jitsiLocationName,
        onRequestMessageKey,
        onRequestSecretKey,
        requestMessageKeyPending,
        getKeyRequestActions,
        getKeyServiceState,
        onReplyMessage,
        onForwardMessage,
        onOpenMessageInChat,
        onOpenMessagePermalink,
        messageWebOrigin,
        onOpenWorkspaceReference,
        onOpenAuthorProfile: onOpenMentionUser,
        onOpenJitsiCall,
        onOpenMentionUser,
        onAddReplyMessage,
        onToggleMessageSelection,
        onEditMessage,
        onRequestDeleteMessage,
        onCopyMessageText,
        onCopyMessageLink,
        onToggleMessageReaction,
        onDownloadFile,
        downloadOwnerKey,
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
        onCopyMessageLink,
        onDownloadFile,
        downloadOwnerKey,
        onEditMessage,
        onForwardMessage,
        onOpenMentionUser,
        onLoadWorkspaceFilePreview,
        onOpenMessageInChat,
        onOpenMessagePermalink,
        messageWebOrigin,
        onOpenWorkspaceReference,
        onOpenJitsiCall,
        onOpenWorkspaceMedia,
        onOpenUnsupportedFilePreview,
        onAddReplyMessage,
        onRemoveOutgoingMessage,
        onRequestMessageKey,
        onRequestSecretKey,
        requestMessageKeyPending,
        getKeyRequestActions,
        getKeyServiceState,
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
      <ChatBackground conversationId={conversationId}>
        {showRefreshLoadError ? (
          <div
            className="bg-bg-elevated/50 mx-3 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-notice-base"
            role="alert"
          >
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
          <div
            className="bg-bg-elevated/50 mx-3 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-notice-base"
            role="alert"
          >
            <span className="min-w-0 flex-1">{t("chat.boundaryPaginationError")}</span>
            <button
              type="button"
              onClick={handleRetryBoundary}
              className="shrink-0 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-primary"
            >
              {t("chat.retryLoadMessages")}
            </button>
          </div>
        ) : null}
        <FloatingLoadingOverlay
          visible={showLoadingOverlay}
          label={t("chat.loadingMessages")}
          position="top-left"
        />
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            anchorHandoffPending ? "pointer-events-none invisible" : ""
          }`}
          aria-hidden={anchorHandoffPending ? true : undefined}
          inert={anchorHandoffPending}
          data-message-anchor-list-layer="true"
          data-message-anchor-list-hidden={anchorHandoffPending ? "true" : "false"}
        >
          <TimelineConnected
            messagesModel={messagesModel}
            outgoingMessages={outgoingMessages}
            currentUserUuid={currentUserUuid}
            conversationId={conversationId}
            initialPositionReady={initialPositionReady}
            initialPositionCancelled={initialPositionCancelled}
            onUserScrollInput={onUserScrollInput}
            scrollToBottomKey={scrollToBottomKey}
            scrollToBottomAfterSendNonce={scrollToBottomAfterSendNonce}
            firstUnreadUuid={firstUnreadUuid}
            unreadCount={unreadCount}
            focusedMessageTarget={focusedMessageTarget}
            anchorHandoffPending={anchorHandoffPending}
            anchorNavigationActive={anchorNavigationActive}
            onFocusedMessageApplied={onFocusedMessageApplied}
            onFocusedMessageMissing={onFocusedMessageMissing}
            onReplySelectedMessages={onReplySelectedMessages}
            selectionMode={selectionMode}
            selectedMessageUuids={selectedMessageUuids}
            readRequestBoundaryMessageUuids={readRequestBoundaryMessageUuids}
            isLoadingOlder={isLoadingOlder}
            isLoadingNewer={isLoadingNewer}
            hasOlderMessages={hasOlderMessages}
            hasNewerMessages={hasNewerMessages}
            lastMessageUuid={lastMessageUuid}
            onLoadLatestWindow={onLoadLatestWindow}
            onCancelLatestWindowLoad={onCancelLatestWindowLoad}
            onTailNavigationRequested={onTailNavigationRequested}
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
      </ChatBackground>
    );
  },
);
