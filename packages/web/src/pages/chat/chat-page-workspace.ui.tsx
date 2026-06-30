import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectMessengerConversationFromWorkspaceRoute } from "~/entities/messenger/messenger-ids.lib";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  markMessengerMessageRead,
  sendMessengerMessage,
} from "~/entities/messenger/messenger-message-actions.lib";
import { loadMessengerConversationMessages } from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerMessage,
  MessengerTopic,
  MessengerUser,
} from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";
import type {
  ComposerEditSession,
  MessageComposerCapabilities,
} from "~/widgets/message-composer/message-composer.types";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";
import { ChatPageMessageListSection } from "./chat-page-message-list-section.ui";
import {
  buildWorkspaceChatMessageListViewModel,
  findWorkspaceMessageUuidByVisualId,
  workspaceChatVisualMessageId,
} from "./chat-page-workspace-message.adapter";
import type { ChatMessagesLoadErrorKind } from "./chat-page-message-list-section.types";

interface WorkspaceChatPageProps {
  route: WorkspaceMessengerRouteMatch;
}

const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_USERS_BY_ID: Record<string, MessengerUser> = {};
const EMPTY_SELECTED_MESSAGE_IDS = new Set<number>();
const READ_BATCH_DELAY_MS = 250;

const noop = () => undefined;

const EMPTY_STATUS = {
  loading: false,
  error: null,
  nextPageMarker: null,
  hasMore: false,
};

function normalizeWorkspaceActionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function findDefaultTopic(
  topicsById: Readonly<Record<string, MessengerTopic>>,
  streamUuid: string,
): MessengerTopic | null {
  // Stream route не содержит topicUuid, но backend требует тему для создания сообщения.
  // Поэтому отправляем только в явно помеченную default topic и не угадываем тему сами.
  return (
    Object.values(topicsById).find((candidate) => {
      return candidate.streamUuid === streamUuid && candidate.isDefault;
    }) ?? null
  );
}

function WorkspaceChatState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}): React.ReactElement {
  return (
    <div className="bg-bg-elevated/50 m-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-center text-sm">
      <p className="font-medium text-text-primary">{title}</p>
      {detail != null ? <p className="text-xs text-text-muted">{detail}</p> : null}
    </div>
  );
}

export const WorkspaceChatPage: React.FC<WorkspaceChatPageProps> = ({ route }) => {
  // Эта страница не новая верстка чата: она собирает старые секции и подменяет только источник данных.
  const [retryNonce, setRetryNonce] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [composerEditSession, setComposerEditSession] = useState<ComposerEditSession | null>(null);
  const [scrollToBottomAfterSendNonce, setScrollToBottomAfterSendNonce] = useState(0);
  const pendingReadVisualIdsRef = useRef<Set<number>>(new Set());
  const readRequestedMessageUuidsRef = useRef<Set<string>>(new Set());
  const readBatchTimerRef = useRef<number | null>(null);
  const actionAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const selection = useMemo(() => selectMessengerConversationFromWorkspaceRoute(route), [route]);
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const conversationId = selection.status === "conversation" ? selection.conversationId : null;
  const streamUuid = selection.status === "conversation" ? selection.streamUuid : null;
  const topicUuid =
    selection.status === "conversation" && selection.kind === "topic" ? selection.topicUuid : null;
  const conversation = useMessengerStore((state) =>
    conversationId != null ? state.conversationsById[conversationId] : undefined,
  );
  const stream = useMessengerStore((state) =>
    streamUuid != null ? state.streamsById[streamUuid] : undefined,
  );
  const topic = useMessengerStore((state) =>
    topicUuid != null ? state.topicsById[topicUuid] : undefined,
  );
  const messagesById = useMessengerStore((state) => state.messagesById);
  const messageIdsByConversationId = useMessengerStore((state) => state.messageIdsByConversationId);
  const messagesLoadingByConversationId = useMessengerStore(
    (state) => state.messagesLoadingByConversationId,
  );
  const messagesErrorByConversationId = useMessengerStore(
    (state) => state.messagesErrorByConversationId,
  );
  const nextPageMarkerByConversationId = useMessengerStore(
    (state) => state.nextPageMarkerByConversationId,
  );
  const hasMoreByConversationId = useMessengerStore((state) => state.hasMoreByConversationId);
  const usersById = useMessengerStore((state) =>
    Object.keys(state.usersById).length > 0 ? state.usersById : EMPTY_USERS_BY_ID,
  );
  const topicsById = useMessengerStore((state) => state.topicsById);
  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  const workspaceComposerCapabilities = useMemo<MessageComposerCapabilities>(
    () => ({
      // Workspace backend в текущем срезе умеет send/edit/delete/read, но не эти дополнительные действия.
      // Кнопки остаются в старом UI, однако вместо Zulip-запросов показывают контролируемую заглушку.
      upload: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.uploadsUnsupported"),
      },
      savedSnippets: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.savedSnippetsUnsupported"),
      },
      preview: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.previewUnsupported"),
      },
      mentions: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.mentionsUnsupported"),
      },
      scheduledSend: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.scheduledSendUnsupported"),
      },
      customEmojis: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.customEmojisUnsupported"),
      },
    }),
    [],
  );

  useEffect(() => {
    if (selection.status !== "conversation" || runtimeContext == null) return;

    // История сообщений грузится из Workspace API и применяется только пока runtime owner не устарел.
    const controller = new AbortController();
    void loadMessengerConversationMessages({
      runtimeContext,
      conversationId: selection.conversationId,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [retryNonce, runtimeContext, selection]);

  useEffect(() => {
    return () => {
      for (const controller of actionAbortControllersRef.current) {
        controller.abort();
      }
      actionAbortControllersRef.current.clear();
      if (readBatchTimerRef.current != null) {
        window.clearTimeout(readBatchTimerRef.current);
        readBatchTimerRef.current = null;
      }
    };
  }, []);

  const routeMessages = useMemo(() => {
    if (conversationId == null) return EMPTY_MESSAGES;
    const ids = messageIdsByConversationId[conversationId] ?? [];
    return ids
      .map((messageId) => messagesById[messageId])
      .filter((message): message is MessengerMessage => message != null);
  }, [conversationId, messageIdsByConversationId, messagesById]);
  const messagesStatus = useMemo(() => {
    if (conversationId == null) return EMPTY_STATUS;
    return {
      loading: messagesLoadingByConversationId[conversationId] === true,
      error: messagesErrorByConversationId[conversationId] ?? null,
      nextPageMarker: nextPageMarkerByConversationId[conversationId] ?? null,
      hasMore: hasMoreByConversationId[conversationId] === true,
    };
  }, [
    conversationId,
    hasMoreByConversationId,
    messagesErrorByConversationId,
    messagesLoadingByConversationId,
    nextPageMarkerByConversationId,
  ]);
  const title = stream?.name ?? conversation?.title ?? t("nav.messenger");
  const topicTitle =
    topic?.name ?? (selection.status === "conversation" ? conversation?.title : undefined);
  const viewModel = useMemo(
    () =>
      buildWorkspaceChatMessageListViewModel({
        messages: routeMessages,
        usersById,
        conversation: conversation ?? null,
        streamName: stream?.name ?? null,
        topicsById,
      }),
    [conversation, routeMessages, stream?.name, topicsById, usersById],
  );
  const messagesLoadError: ChatMessagesLoadErrorKind | null =
    messagesStatus.error == null ? null : viewModel.messages.length === 0 ? "initial" : "refresh";

  const runWorkspaceAction = useCallback(
    async <T,>(action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      // Все write-действия получают свой AbortController, чтобы смена org/project не применяла старый ответ.
      const controller = new AbortController();
      actionAbortControllersRef.current.add(controller);
      try {
        return await action(controller.signal);
      } finally {
        actionAbortControllersRef.current.delete(controller);
      }
    },
    [],
  );

  const resolveMessageByVisualId = useCallback(
    (visualMessageId: number): MessengerMessage | null => {
      const messageUuid = findWorkspaceMessageUuidByVisualId(routeMessages, visualMessageId);
      return messageUuid == null ? null : (messagesById[messageUuid] ?? null);
    },
    [messagesById, routeMessages],
  );

  const resolveSendTarget = useCallback(():
    | { status: "ready"; streamUuid: string; topicUuid: string; includeStreamConversation: boolean }
    | { status: "blocked"; error: string } => {
    // Topic route отправляет в выбранную тему, stream route — только в default topic.
    if (selection.status !== "conversation") {
      return { status: "blocked", error: t("workspaceMessenger.routeUnsupportedForSend") };
    }
    if (selection.kind === "topic") {
      return {
        status: "ready",
        streamUuid: selection.streamUuid,
        topicUuid: selection.topicUuid,
        includeStreamConversation: false,
      };
    }

    const defaultTopic = findDefaultTopic(topicsById, selection.streamUuid);
    if (defaultTopic == null) {
      return { status: "blocked", error: t("workspaceMessenger.defaultTopicMissing") };
    }

    return {
      status: "ready",
      streamUuid: selection.streamUuid,
      topicUuid: defaultTopic.uuid,
      includeStreamConversation: true,
    };
  }, [selection, topicsById]);

  const handleSend = useCallback(
    async (content: string, _subjectOverride?: string, files?: File[]) => {
      // Composer остаётся старым, но отправка идёт только через Workspace POST /messages/.
      setSendError(null);
      if (runtimeContext == null) {
        const error = t("workspaceMessenger.runtimeUnavailable");
        setSendError(error);
        throw new Error(error);
      }
      if (files != null && files.length > 0) {
        const error = t("workspaceMessenger.uploadsUnsupported");
        setSendError(error);
        throw new Error(error);
      }

      const markdown = content.trim();
      if (markdown.length === 0) return;

      const target = resolveSendTarget();
      if (target.status === "blocked") {
        setSendError(target.error);
        throw new Error(target.error);
      }

      try {
        const result = await runWorkspaceAction((signal) =>
          sendMessengerMessage({
            runtimeContext,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            signal,
            streamUuid: target.streamUuid,
            topicUuid: target.topicUuid,
            markdown,
            includeStreamConversation: target.includeStreamConversation,
          }),
        );
        if (result.status === "applied") {
          setScrollToBottomAfterSendNonce((value) => value + 1);
        }
      } catch (error) {
        const message = normalizeWorkspaceActionError(error, t("message.sendFailed"));
        setSendError(message);
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [resolveSendTarget, runWorkspaceAction, runtimeContext],
  );

  const requestMessageEdit = useCallback(
    (messageId: number) => {
      // Старый список отдаёт числовой id, поэтому сначала ищем Workspace message uuid через adapter.
      const message = resolveMessageByVisualId(messageId);
      if (message == null || !message.isOwn) {
        setActionError(t("message.editUnavailable"));
        return;
      }

      setActionError(null);
      setComposerEditSession({
        messageId: workspaceChatVisualMessageId(message.uuid),
        initialMarkdown: message.markdown,
      });
    },
    [resolveMessageByVisualId],
  );

  const handleSubmitEdit = useCallback(
    async (visualMessageId: number, markdown: string) => {
      setActionError(null);
      if (runtimeContext == null) {
        const error = t("workspaceMessenger.runtimeUnavailable");
        setActionError(error);
        throw new Error(error);
      }
      const message = resolveMessageByVisualId(visualMessageId);
      if (message == null || !message.isOwn) {
        const error = t("message.editUnavailable");
        setActionError(error);
        throw new Error(error);
      }

      try {
        await runWorkspaceAction((signal) =>
          editMessengerMessage({
            runtimeContext,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            signal,
            messageUuid: message.uuid,
            markdown,
          }),
        );
        setComposerEditSession(null);
      } catch (error) {
        const messageText = normalizeWorkspaceActionError(error, t("message.editFailed"));
        setActionError(messageText);
        throw error instanceof Error ? error : new Error(messageText);
      }
    },
    [resolveMessageByVisualId, runWorkspaceAction, runtimeContext],
  );

  const handleDeleteMessage = useCallback(
    (visualMessageId: number) => {
      // Удаление идёт сразу в Workspace API; старые Zulip delete handlers на этом route не вызываются.
      setActionError(null);
      if (runtimeContext == null) {
        setActionError(t("workspaceMessenger.runtimeUnavailable"));
        return;
      }
      const message = resolveMessageByVisualId(visualMessageId);
      if (message == null) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return;
      }

      void runWorkspaceAction((signal) =>
        deleteMessengerMessage({
          runtimeContext,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          signal,
          messageUuid: message.uuid,
          streamUuid: message.streamUuid,
          topicUuid: message.topicUuid,
        }),
      ).catch((error) => {
        setActionError(normalizeWorkspaceActionError(error, t("message.deleteError")));
      });
    },
    [resolveMessageByVisualId, runWorkspaceAction, runtimeContext],
  );

  const flushReadBatch = useCallback(() => {
    // MessageList сообщает о видимых непрочитанных сообщениях пачкой, backend принимает их по одному.
    readBatchTimerRef.current = null;
    if (runtimeContext == null || conversationId == null) {
      pendingReadVisualIdsRef.current.clear();
      return;
    }

    const visualIds = [...pendingReadVisualIdsRef.current];
    pendingReadVisualIdsRef.current.clear();
    for (const visualMessageId of visualIds) {
      const message = resolveMessageByVisualId(visualMessageId);
      if (message == null || message.isOwn || message.read) continue;
      if (readRequestedMessageUuidsRef.current.has(message.uuid)) continue;
      readRequestedMessageUuidsRef.current.add(message.uuid);

      void runWorkspaceAction((signal) =>
        markMessengerMessageRead({
          runtimeContext,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          signal,
          messageUuid: message.uuid,
          conversationIds: [conversationId],
        }),
      ).catch(() => {
        readRequestedMessageUuidsRef.current.delete(message.uuid);
      });
    }
  }, [
    conversationId,
    resolveMessageByVisualId,
    runWorkspaceAction,
    runtimeContext,
  ]);

  const scheduleReadBatch = useCallback(
    (messageIds: number[]) => {
      if (messageIds.length === 0) return;
      for (const messageId of messageIds) {
        pendingReadVisualIdsRef.current.add(messageId);
      }
      if (readBatchTimerRef.current != null) return;
      readBatchTimerRef.current = window.setTimeout(flushReadBatch, READ_BATCH_DELAY_MS);
    },
    [flushReadBatch],
  );

  const messageCallbacks = useMemo<MessageListCallbacks>(
    () => ({
      // Поддержанные действия подключены к Workspace API, неподдержанные остаются видимыми как заглушки.
      onMessageEdit: (message) => requestMessageEdit(message.id),
      onMessageDelete: (message) => handleDeleteMessage(message.id),
      onMessageAddReaction: () => setActionError(t("workspaceMessenger.reactionsUnsupported")),
      onMessageRemoveReaction: () => setActionError(t("workspaceMessenger.reactionsUnsupported")),
      onMessageForward: () => setActionError(t("workspaceMessenger.forwardUnsupported")),
      onMessageViews: () => setActionError(t("workspaceMessenger.readReceiptsUnsupported")),
      onMessagePermalinkClick: () => {
        setActionError(t("workspaceMessenger.permalinkUnsupported"));
        return true;
      },
      onRetryFailedOutgoing: () => setActionError(t("workspaceMessenger.retryUnsupported")),
      onRemoveFailedOutgoing: () => setActionError(t("workspaceMessenger.retryUnsupported")),
      onRetryFailedEdit: () => setActionError(t("workspaceMessenger.retryUnsupported")),
      onCancelFailedEdit: () => setActionError(t("workspaceMessenger.retryUnsupported")),
    }),
    [handleDeleteMessage, requestMessageEdit],
  );

  const handleEditLastMessage = useCallback(() => {
    for (let index = routeMessages.length - 1; index >= 0; index -= 1) {
      const message = routeMessages[index];
      if (message?.isOwn === true) {
        requestMessageEdit(workspaceChatVisualMessageId(message.uuid));
        return;
      }
    }
  }, [requestMessageEdit, routeMessages]);

  let body: React.ReactNode;
  if (selection.status === "invalid-route") {
    body = (
      <WorkspaceChatState
        title={t("workspaceMessenger.invalidRoute")}
        detail={t("workspaceMessenger.invalidRouteHint")}
      />
    );
  } else if (selection.status === "unsupported-message") {
    body = (
      <WorkspaceChatState
        title={t("workspaceMessenger.messageRouteUnsupported")}
        detail={t("workspaceMessenger.messageRouteUnsupportedHint")}
      />
    );
  } else {
    body = (
      <ChatPageMessageListSection
        messagesLoading={messagesStatus.loading}
        hasInitialPayload={viewModel.messages.length > 0}
        isDmView={false}
        activeDmUserIds={null}
        activeStream={stream?.name ?? conversation?.title}
        activeTopic={
          selection.status === "conversation" && selection.kind === "topic" ? topicTitle : null
        }
        messages={viewModel.messages}
        currentUserId={viewModel.currentUserId}
        callbacks={messageCallbacks}
        selectionMode={false}
        selectedMessageIds={EMPTY_SELECTED_MESSAGE_IDS}
        onLoadMore={noop}
        isLoadingMore={false}
        isLoadingNewer={false}
        onLoadNewer={noop}
        hasNewerMessages={false}
        firstUnreadId={viewModel.firstUnreadId}
        unreadCount={viewModel.unreadCount}
        focusedMessageId={null}
        onUnreadMessagesVisible={scheduleReadBatch}
        onUnreadMessagesAtBottom={scheduleReadBatch}
        messagesLoadError={messagesLoadError}
        onRetryMessagesLoad={retry}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={noop}
        scrollToBottomAfterSendNonce={scrollToBottomAfterSendNonce}
      />
    );
  }

  return (
    <div
      className="flex max-h-full min-h-0 min-w-0 max-w-chat-page flex-1 flex-col overflow-hidden"
      data-testid="chat-page"
    >
      <ChatHeader
        channelName={`#${title}`}
        topic={
          selection.status === "conversation" && selection.kind === "topic" ? topicTitle : undefined
        }
        hideTopic={selection.status !== "conversation" || selection.kind !== "topic"}
        participantsCount={0}
        onlineCount={0}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {body}
        <ChatPageInlineAlerts
          routeResolveError={null}
          actionError={actionError}
          sendError={sendError}
          onDismissRouteResolveError={noop}
          onDismissActionError={() => setActionError(null)}
          onDismissSendError={() => setSendError(null)}
        />
        <ChatPageComposerSection
          isDmView={false}
          activeDmUserIds={null}
          activeStream={stream?.name ?? conversation?.title}
          showTopicPrompt={false}
          streamSlug={undefined}
          onExpandStreamTopics={noop}
          uploadProgress={null}
          onSend={handleSend}
          onCreateCallLink={undefined}
          onCancelUpload={noop}
          activeTopic={
            selection.status === "conversation" && selection.kind === "topic" ? topicTitle : null
          }
          replyQuote={null}
          onClearReply={noop}
          draftInitialValue={undefined}
          onComposerValueChange={noop}
          onEditLastMessage={handleEditLastMessage}
          editSession={composerEditSession}
          onSubmitEdit={handleSubmitEdit}
          onCancelEdit={() => setComposerEditSession(null)}
          composerCapabilities={workspaceComposerCapabilities}
          aiMessagesContext={[]}
          aiChatContext={undefined}
        />
      </section>
    </div>
  );
};
