import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageById,
  selectWorkspaceMessageStatusForConversation,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import { selectWorkspaceChatHeaderView } from "~/entities/messenger/messenger-chat-header.lib";
import { selectMessengerConversationFromWorkspaceRoute } from "~/entities/messenger/messenger-ids.lib";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  markMessengerMessageRead,
  sendMessengerMessage,
} from "~/entities/messenger/messenger-message-actions.lib";
import { loadMessengerConversationMessages } from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerStreamBindingsForRoute } from "~/entities/messenger/messenger-stream-bindings-loader.lib";
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
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import type {
  ComposerEditSession,
  MessageComposerCapabilities,
} from "~/widgets/message-composer/message-composer.types";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";
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
  route: WorkspaceMessengerRouteMatch | null;
}

const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_USERS_BY_ID: Record<string, MessengerUser> = {};
const EMPTY_SELECTED_MESSAGE_IDS = new Set<number>();
const READ_BATCH_DELAY_MS = 250;

const noop = () => undefined;

function normalizeWorkspaceActionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function findDefaultTopic(
  topicsById: Readonly<Record<string, MessengerTopic>>,
  streamUuid: string,
): MessengerTopic | null {
  // Stream route has no topicUuid, but the backend requires a topic to create a message.
  // Send only to an explicitly marked default topic and do not guess it here.
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
  // This page is not a new chat layout: it assembles old sections and swaps only the data source.
  useMessengerStreamBindingsForRoute({ route });
  const openSearch = useOpenSearch();
  const rightDrawer = useRightDrawer();
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
  const routeMessages = useWorkspaceMessageStore((state) =>
    conversationId == null
      ? EMPTY_MESSAGES
      : selectWorkspaceMessagesForConversation(state, conversationId),
  );
  const messagesStatus = useWorkspaceMessageStore((state) =>
    conversationId == null
      ? selectWorkspaceMessageStatusForConversation(state, "")
      : selectWorkspaceMessageStatusForConversation(state, conversationId),
  );
  const usersById = useMessengerStore((state) =>
    Object.keys(state.usersById).length > 0 ? state.usersById : EMPTY_USERS_BY_ID,
  );
  const topicsById = useMessengerStore((state) => state.topicsById);
  const streamsById = useMessengerStore((state) => state.streamsById);
  const streamBindingsById = useMessengerStore((state) => state.streamBindingsById);
  const streamBindingIdsByStreamId = useMessengerStore((state) => state.streamBindingIdsByStreamId);
  const conversationsById = useMessengerStore((state) => state.conversationsById);
  const headerView = useMemo(
    () =>
      selectWorkspaceChatHeaderView(
        {
          conversationsById,
          streamsById,
          topicsById,
          streamBindingsById,
          streamBindingIdsByStreamId,
          usersById,
        },
        {
          route,
          fallbackTitle: t("nav.messenger"),
        },
      ),
    [
      conversationsById,
      route,
      streamBindingIdsByStreamId,
      streamBindingsById,
      streamsById,
      topicsById,
      usersById,
    ],
  );
  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  const workspaceComposerCapabilities = useMemo<MessageComposerCapabilities>(
    () => ({
      // The Workspace backend currently supports send/edit/delete/read, but not these extra actions.
      // Buttons remain in the old UI, but show controlled placeholders instead of Zulip requests.
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

    // Message history loads from the Workspace API and applies only while the runtime owner is current.
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

  const topicTitle =
    topic?.name ?? (selection.status === "conversation" ? conversation?.title : undefined);
  const composerReadOnlyReason =
    selection.status === "conversation"
      ? undefined
      : t("workspaceMessenger.routeUnsupportedForSend");
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
      // Every write action gets its own AbortController so org/project switches do not apply old responses.
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
      return messageUuid == null
        ? null
        : selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
    },
    [routeMessages],
  );

  const resolveSendTarget = useCallback(():
    | { status: "ready"; streamUuid: string; topicUuid: string; includeStreamConversation: boolean }
    | { status: "blocked"; error: string } => {
    // Topic routes send to the selected topic; stream routes send only to the default topic.
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
      // Composer remains old, but sending goes only through Workspace POST /messages/.
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
      // The old list gives a numeric id, so first resolve the Workspace message uuid through the adapter.
      const message = resolveMessageByVisualId(messageId);
      if (!message?.isOwn) {
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
      if (!message?.isOwn) {
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
      // Deletion goes directly to the Workspace API; old Zulip delete handlers are not called on this route.
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
    // MessageList reports visible unread messages in batches; the backend accepts them one by one.
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
  }, [conversationId, resolveMessageByVisualId, runWorkspaceAction, runtimeContext]);

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
      // Supported actions are connected to the Workspace API; unsupported actions stay visible as placeholders.
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

  const handleToggleRightPanel = useCallback(() => {
    rightDrawer?.setOpen(!rightDrawer.open);
  }, [rightDrawer]);

  const handleOpenRightPanel = useCallback(() => {
    if (rightDrawer?.openInfo != null) {
      rightDrawer.openInfo();
      return;
    }
    rightDrawer?.setOpen(true);
  }, [rightDrawer]);

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
  } else if (selection.status === "none") {
    body = (
      <WorkspaceChatState
        title={t("workspaceMessenger.invalidRoute")}
        detail={t("workspaceMessenger.invalidRouteHint")}
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
        channelName={headerView.channelName}
        topic={headerView.topic}
        hideTopic={headerView.hideTopic}
        participantsCount={headerView.participantsCount}
        onlineCount={headerView.onlineCount}
        onOpenSearch={openSearch ?? undefined}
        onToggleRightPanel={rightDrawer == null ? undefined : handleToggleRightPanel}
        onOpenRightPanel={rightDrawer == null ? undefined : handleOpenRightPanel}
        rightPanelOpen={rightDrawer?.open ?? false}
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
          readOnlyReason={composerReadOnlyReason}
        />
      </section>
    </div>
  );
};
