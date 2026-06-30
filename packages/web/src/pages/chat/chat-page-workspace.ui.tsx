import React, { useCallback, useEffect, useMemo, useState } from "react";
import { selectMessengerConversationFromWorkspaceRoute } from "~/entities/messenger/messenger-ids.lib";
import { loadMessengerConversationMessages } from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerUser } from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import { ChatPageMessageListSection } from "./chat-page-message-list-section.ui";
import { buildWorkspaceChatMessageListViewModel } from "./chat-page-workspace-message.adapter";
import type { ChatMessagesLoadErrorKind } from "./chat-page-message-list-section.types";

interface WorkspaceChatPageProps {
  route: WorkspaceMessengerRouteMatch;
}

const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_USERS_BY_ID: Record<string, MessengerUser> = {};
const EMPTY_MESSAGE_CALLBACKS: MessageListCallbacks = {};
const EMPTY_SELECTED_MESSAGE_IDS = new Set<number>();

const noop = () => undefined;

const EMPTY_STATUS = {
  loading: false,
  error: null,
  nextPageMarker: null,
  hasMore: false,
};

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
  const [retryNonce, setRetryNonce] = useState(0);
  const selection = useMemo(() => selectMessengerConversationFromWorkspaceRoute(route), [route]);
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const currentSession = useMemo(
    () => sessions.find((session) => session.accountId === currentAccountId) ?? null,
    [currentAccountId, sessions],
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

  useEffect(() => {
    if (selection.status !== "conversation" || runtimeContext == null) return;

    const controller = new AbortController();
    void loadMessengerConversationMessages({
      runtimeContext,
      conversationId: selection.conversationId,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      clientOptions: { devTargetOrigin: currentSession?.organizationOrigin },
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [currentSession?.organizationOrigin, retryNonce, runtimeContext, selection]);

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
        callbacks={EMPTY_MESSAGE_CALLBACKS}
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
        onUnreadMessagesVisible={noop}
        onUnreadMessagesAtBottom={noop}
        messagesLoadError={messagesLoadError}
        onRetryMessagesLoad={retry}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={noop}
        scrollToBottomAfterSendNonce={0}
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
        <ChatPageComposerSection
          isDmView={false}
          activeDmUserIds={null}
          activeStream={stream?.name ?? conversation?.title}
          showTopicPrompt={false}
          streamSlug={undefined}
          onExpandStreamTopics={noop}
          uploadProgress={null}
          onSend={noop}
          onCreateCallLink={undefined}
          onCancelUpload={noop}
          activeTopic={
            selection.status === "conversation" && selection.kind === "topic" ? topicTitle : null
          }
          replyQuote={null}
          onClearReply={noop}
          draftInitialValue={undefined}
          onComposerValueChange={noop}
          onEditLastMessage={noop}
          editSession={null}
          onSubmitEdit={noop}
          onCancelEdit={noop}
          aiMessagesContext={[]}
          aiChatContext={undefined}
          readOnlyReason={t("workspaceMessenger.readOnlyComposer")}
        />
      </section>
    </div>
  );
};
