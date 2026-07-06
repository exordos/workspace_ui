import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDownloadStore } from "~/entities/download/download.model";
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
import { toggleMessengerMessageReaction } from "~/entities/messenger/messenger-message-reactions-actions.lib";
import { loadMessengerConversationMessages } from "~/entities/messenger/messenger-messages-loader.lib";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useMessengerStreamBindingsForRoute } from "~/entities/messenger/messenger-stream-bindings-loader.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage, MessengerTopic } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { UsersById } from "~/entities/user/user.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { downloadWorkspaceFile } from "~/shared/api/messenger-files.api";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import type { WorkspaceMessageMentionResolution } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import {
  workspaceMessengerMessageRoute,
  type WorkspaceMessengerRouteMatch,
} from "~/shared/lib/workspace-messenger-route.lib";
import type { ChatHeaderProps } from "~/widgets/chat-view/chat-header.types";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import type {
  ComposerEditSession,
  MessageComposerCapabilities,
  ReplyQuote,
} from "~/widgets/message-composer/message-composer.types";
import { consumePendingForwardPrefill } from "./chat-forward.lib";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";
import { ChatPageWorkspaceMessageListSection } from "./chat-page-workspace-message-list-section.ui";
import {
  deriveWorkspaceDownloadFileName,
  parseWorkspaceDownloadTotalBytes,
  triggerWorkspaceBrowserDownload,
  workspaceFileDownloadKey,
} from "./chat-workspace-file-download.lib";
import type { WorkspaceChatMessagesLoadErrorKind } from "./chat-page-workspace-message-list-section.types";

interface WorkspaceChatPageProps {
  route: WorkspaceMessengerRouteMatch | null;
}

const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_USERS_BY_ID: UsersById = {};
const READ_BATCH_DELAY_MS = 250;
const WORKSPACE_COMPOSER_EDIT_SESSION_ID = 1;

const noop = () => undefined;

function normalizeWorkspaceMentionLookupText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

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
  const location = useLocation();
  const openSearch = useOpenSearch();
  const rightDrawer = useRightDrawer();
  const [retryNonce, setRetryNonce] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [composerEditSession, setComposerEditSession] = useState<ComposerEditSession | null>(null);
  const [composerEditMessageUuid, setComposerEditMessageUuid] = useState<string | null>(null);
  const [pendingDeleteMessageUuid, setPendingDeleteMessageUuid] = useState<string | null>(null);
  const [replyQuote, setReplyQuote] = useState<ReplyQuote | null>(null);
  const [draftInitialValue, setDraftInitialValue] = useState<string | undefined>(undefined);
  const [scrollToBottomAfterSendNonce, setScrollToBottomAfterSendNonce] = useState(0);
  const composerValueRef = useRef("");
  const pendingReadMessageUuidsRef = useRef<Set<string>>(new Set());
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
  const usersById = useUsersStore((state) =>
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
        },
        {
          route,
          usersById,
          fallbackTitle: t("nav.messenger"),
          missingDirectUserTitle: t("workspaceMessenger.directPrivateUserUnavailable"),
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
  const chatHeaderContentProps = useMemo<ChatHeaderProps>(() => {
    if (headerView.kind === "directPrivate") {
      return {
        channelName: headerView.dmPartner.name,
        hideTopic: true,
        hideParticipants: true,
        dmPartner: headerView.dmPartner,
      };
    }

    return {
      channelName: headerView.channelName,
      topic: headerView.topic,
      hideTopic: headerView.hideTopic,
      participantsCount: headerView.participantsCount,
      onlineCount: headerView.onlineCount,
    };
  }, [headerView]);
  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  const resolveAuthorLabel = useCallback(
    (authorUuid: string): string | null => {
      const user = usersById[authorUuid];

      return user == null ? null : selectUserDisplayName(user, "");
    },
    [usersById],
  );
  const resolveMention = useCallback(
    (displayText: string): WorkspaceMessageMentionResolution | null => {
      const lookupText = normalizeWorkspaceMentionLookupText(displayText);
      if (lookupText.length === 0) {
        return null;
      }

      for (const user of Object.values(usersById)) {
        const displayName = selectUserDisplayName(user, "");
        const candidates = [
          normalizeWorkspaceMentionLookupText(displayName),
          normalizeWorkspaceMentionLookupText(user.username),
        ];
        if (candidates.includes(lookupText)) {
          // Resolver возвращает только Workspace UUID. Здесь нет numeric
          // userId и нет попытки открыть старый DM/profile путь: render core
          // использует UUID только для data-workspace-user-uuid.
          return {
            userUuid: user.uuid,
            displayText: displayName.length > 0 ? displayName : displayText,
          };
        }
      }

      return null;
    },
    [usersById],
  );
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

  useEffect(() => {
    const pendingForwardPrefill = consumePendingForwardPrefill(location.pathname);
    if (pendingForwardPrefill == null) {
      setDraftInitialValue(undefined);
      composerValueRef.current = "";
      return;
    }
    setDraftInitialValue(pendingForwardPrefill);
    composerValueRef.current = pendingForwardPrefill;
  }, [location.pathname]);

  useEffect(() => {
    setPendingDeleteMessageUuid(null);
    setReplyQuote(null);
  }, [conversationId]);

  const topicTitle =
    topic?.name ?? (selection.status === "conversation" ? conversation?.title : undefined);
  const composerReadOnlyReason =
    selection.status === "conversation"
      ? undefined
      : t("workspaceMessenger.routeUnsupportedForSend");
  const currentUserUuid = runtimeContext?.userUuid ?? "";
  const firstUnreadMessage = useMemo(
    () =>
      routeMessages.find((message) => {
        return !message.read && !message.isOwn && message.authorUuid !== currentUserUuid;
      }),
    [currentUserUuid, routeMessages],
  );
  const unreadCount = useMemo(
    () =>
      routeMessages.filter((message) => {
        return !message.read && !message.isOwn && message.authorUuid !== currentUserUuid;
      }).length,
    [currentUserUuid, routeMessages],
  );
  const messagesLoadError: WorkspaceChatMessagesLoadErrorKind | null =
    messagesStatus.error == null ? null : routeMessages.length === 0 ? "initial" : "refresh";

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

  const handleSubmitEdit = useCallback(
    async (_editSessionId: number, markdown: string) => {
      setActionError(null);
      if (runtimeContext == null) {
        const error = t("workspaceMessenger.runtimeUnavailable");
        setActionError(error);
        throw new Error(error);
      }
      const message =
        composerEditMessageUuid == null
          ? null
          : selectWorkspaceMessageById(
              useWorkspaceMessageStore.getState(),
              composerEditMessageUuid,
            );
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
        setComposerEditMessageUuid(null);
      } catch (error) {
        const messageText = normalizeWorkspaceActionError(error, t("message.editFailed"));
        setActionError(messageText);
        throw error instanceof Error ? error : new Error(messageText);
      }
    },
    [composerEditMessageUuid, runWorkspaceAction, runtimeContext],
  );

  const handleEditMessage = useCallback((messageUuid: string) => {
    const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
    if (!message?.isOwn) {
      setActionError(t("message.editUnavailable"));
      return;
    }

    setReplyQuote(null);
    setComposerEditMessageUuid(message.uuid);
    setComposerEditSession({
      messageId: WORKSPACE_COMPOSER_EDIT_SESSION_ID,
      initialMarkdown: message.markdown,
    });
  }, []);

  const handleRequestDeleteMessage = useCallback((messageUuid: string) => {
    const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
    if (!message?.isOwn) {
      setActionError(t("workspaceMessenger.messageActionTargetMissing"));
      return;
    }

    setPendingDeleteMessageUuid(message.uuid);
  }, []);

  const handleCancelDeleteMessage = useCallback(() => {
    setPendingDeleteMessageUuid(null);
  }, []);

  const handleConfirmDeleteMessage = useCallback(() => {
    setActionError(null);
    if (runtimeContext == null) {
      setActionError(t("workspaceMessenger.runtimeUnavailable"));
      return;
    }
    const message =
      pendingDeleteMessageUuid == null
        ? null
        : selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), pendingDeleteMessageUuid);
    if (!message?.isOwn) {
      setActionError(t("workspaceMessenger.messageActionTargetMissing"));
      setPendingDeleteMessageUuid(null);
      return;
    }

    setPendingDeleteMessageUuid(null);
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
  }, [pendingDeleteMessageUuid, runWorkspaceAction, runtimeContext]);

  const handleReplyMessage = useCallback(
    (messageUuid: string, selectedText?: string) => {
      if (
        selection.status !== "conversation" ||
        (route?.kind !== "stream" && route?.kind !== "topic")
      ) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return;
      }

      const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
      if (message == null) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return;
      }

      const quoteSource = selectedText?.trim() || message.markdown.trim();
      if (quoteSource.length === 0) return;
      const authorLabel = resolveAuthorLabel(message.authorUuid) ?? t("message.replyTo");
      setComposerEditMessageUuid(null);
      setComposerEditSession(null);
      setReplyQuote({
        id: message.uuid,
        content: quoteSource,
        sender_full_name: authorLabel,
        permalinkUrl: workspaceMessengerMessageRoute({
          orgId: route.orgId,
          projectId: route.projectId,
          messageUuid: message.uuid,
        }),
        quoteFormat: "workspace",
      });
    },
    [resolveAuthorLabel, route, selection.status],
  );

  const handleClearReply = useCallback(() => {
    setReplyQuote(null);
  }, []);

  const handleCopyMessageText = useCallback((messageUuid: string, text: string) => {
    const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
    if (message == null) {
      setActionError(t("workspaceMessenger.messageActionTargetMissing"));
      return;
    }
    if (typeof navigator === "undefined" || navigator.clipboard == null) {
      setActionError(t("message.copyFailed"));
      return;
    }

    void navigator.clipboard.writeText(text).catch(() => {
      setActionError(t("message.copyFailed"));
    });
  }, []);

  const handleToggleMessageReaction = useCallback(
    (messageUuid: string, emojiName: string) => {
      setActionError(null);
      if (runtimeContext == null) {
        setActionError(t("workspaceMessenger.runtimeUnavailable"));
        return;
      }

      void runWorkspaceAction((signal) =>
        toggleMessengerMessageReaction({
          runtimeContext,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          signal,
          messageUuid,
          emojiName,
        }),
      ).catch((error) => {
        setActionError(normalizeWorkspaceActionError(error, t("message.reactionError")));
      });
    },
    [runWorkspaceAction, runtimeContext],
  );

  const handleDownloadFile = useCallback(
    (file: { fileUuid: string; name?: string }) => {
      setActionError(null);
      if (runtimeContext == null) {
        setActionError(t("workspaceMessenger.runtimeUnavailable"));
        return;
      }

      const downloadKey = workspaceFileDownloadKey(file.fileUuid);
      const initialFileName = deriveWorkspaceDownloadFileName({
        fileUuid: file.fileUuid,
        fileNameHint: file.name,
      });
      const downloadStore = useDownloadStore.getState();
      if (!downloadStore.startDownload(downloadKey, initialFileName)) {
        return;
      }

      void runWorkspaceAction(async (signal) => {
        const result = await downloadWorkspaceFile(
          buildMessengerRequestOptions(runtimeContext, undefined, signal),
          file.fileUuid,
        );
        const fileName = deriveWorkspaceDownloadFileName({
          fileUuid: file.fileUuid,
          fileNameHint: file.name,
          contentDisposition: result.headers.get("content-disposition"),
        });
        const totalBytes =
          parseWorkspaceDownloadTotalBytes(result.headers.get("content-length")) ??
          result.blob.size;
        useDownloadStore.getState().setProgress(downloadKey, {
          receivedBytes: result.blob.size,
          totalBytes,
        });
        triggerWorkspaceBrowserDownload(result.blob, fileName);
        useDownloadStore.getState().finishDownload(downloadKey, true);
      }).catch((error) => {
        useDownloadStore.getState().finishDownload(downloadKey, false);
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setActionError(
            normalizeWorkspaceActionError(error, t("workspaceMessenger.fileDownloadFailed")),
          );
        }
      });
    },
    [runWorkspaceAction, runtimeContext],
  );

  const handleOpenUnsupportedFilePreview = useCallback(() => {
    setActionError(t("workspaceMessenger.mediaViewerUnsupported"));
  }, []);

  const flushReadBatch = useCallback(() => {
    // Новый список сообщает видимые непрочитанные сообщения сразу Workspace uuid.
    // Поэтому тут больше нет шага "числовой id -> messageUuid": read action
    // получает тот же ключ, который лежит в store и в DOM data-message-uuid.
    readBatchTimerRef.current = null;
    if (runtimeContext == null || conversationId == null) {
      pendingReadMessageUuidsRef.current.clear();
      return;
    }

    const messageUuids = [...pendingReadMessageUuidsRef.current];
    pendingReadMessageUuidsRef.current.clear();
    for (const messageUuid of messageUuids) {
      const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
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
  }, [conversationId, runWorkspaceAction, runtimeContext]);

  const scheduleReadBatch = useCallback(
    (messageUuids: string[]) => {
      if (messageUuids.length === 0) return;
      for (const messageUuid of messageUuids) {
        pendingReadMessageUuidsRef.current.add(messageUuid);
      }
      if (readBatchTimerRef.current != null) return;
      readBatchTimerRef.current = window.setTimeout(flushReadBatch, READ_BATCH_DELAY_MS);
    },
    [flushReadBatch],
  );

  const handleLoadOlder = useCallback(() => {
    if (
      runtimeContext == null ||
      conversationId == null ||
      messagesStatus.loading ||
      !messagesStatus.hasMore ||
      messagesStatus.nextPageMarker == null
    ) {
      return;
    }

    void runWorkspaceAction((signal) =>
      loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        pageMarker: messagesStatus.nextPageMarker ?? undefined,
        getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        signal,
      }),
    );
  }, [
    conversationId,
    messagesStatus.hasMore,
    messagesStatus.loading,
    messagesStatus.nextPageMarker,
    runWorkspaceAction,
    runtimeContext,
  ]);

  const handleEditLastMessage = useCallback(() => {
    for (let index = routeMessages.length - 1; index >= 0; index -= 1) {
      const message = routeMessages[index];
      if (message?.isOwn === true) {
        handleEditMessage(message.uuid);
        return;
      }
    }
    setActionError(t("message.editUnavailable"));
  }, [handleEditMessage, routeMessages]);

  const handleCancelEdit = useCallback(() => {
    setComposerEditSession(null);
    setComposerEditMessageUuid(null);
  }, []);

  const handleLoadNewer = useCallback(() => {
    // Workspace store пока не хранит отдельное окно newer around anchor.
    // Поэтому route честно держит пустой callback и hasNewerMessages=false:
    // список уже умеет нижнюю пагинацию, но странице пока нечего загрузить из store.
  }, []);

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
      <ChatPageWorkspaceMessageListSection
        messagesLoading={messagesStatus.loading}
        hasInitialPayload={routeMessages.length > 0}
        messages={routeMessages}
        currentUserUuid={currentUserUuid}
        conversationId={selection.conversationId}
        scrollToBottomKey={selection.conversationId}
        onLoadOlder={handleLoadOlder}
        isLoadingOlder={messagesStatus.loading && routeMessages.length > 0}
        isLoadingNewer={false}
        onLoadNewer={handleLoadNewer}
        hasOlderMessages={messagesStatus.hasMore}
        hasNewerMessages={false}
        firstUnreadUuid={firstUnreadMessage?.uuid}
        unreadCount={unreadCount}
        focusedMessageUuid={null}
        onUnreadMessagesVisible={scheduleReadBatch}
        onUnreadMessagesAtBottom={scheduleReadBatch}
        onReplyMessage={handleReplyMessage}
        onEditMessage={handleEditMessage}
        onRequestDeleteMessage={handleRequestDeleteMessage}
        onCopyMessageText={handleCopyMessageText}
        onToggleMessageReaction={handleToggleMessageReaction}
        onDownloadFile={handleDownloadFile}
        onOpenUnsupportedFilePreview={handleOpenUnsupportedFilePreview}
        messagesLoadError={messagesLoadError}
        onRetryMessagesLoad={retry}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={noop}
        scrollToBottomAfterSendNonce={scrollToBottomAfterSendNonce}
        resolveAuthorLabel={resolveAuthorLabel}
        resolveMention={resolveMention}
      />
    );
  }

  return (
    <div
      className="flex max-h-full min-h-0 min-w-0 max-w-chat-page flex-1 flex-col overflow-hidden"
      data-testid="chat-page"
    >
      <ChatHeader
        {...chatHeaderContentProps}
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
        {pendingDeleteMessageUuid != null ? (
          <ChatPageDeleteConfirmBar
            mode="single"
            onConfirm={handleConfirmDeleteMessage}
            onCancel={handleCancelDeleteMessage}
          />
        ) : null}
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
          replyQuote={replyQuote}
          onClearReply={handleClearReply}
          draftInitialValue={draftInitialValue}
          onComposerValueChange={(value) => {
            composerValueRef.current = value;
          }}
          onEditLastMessage={handleEditLastMessage}
          editSession={composerEditSession}
          onSubmitEdit={handleSubmitEdit}
          onCancelEdit={handleCancelEdit}
          composerCapabilities={workspaceComposerCapabilities}
          aiMessagesContext={[]}
          aiChatContext={undefined}
          readOnlyReason={composerReadOnlyReason}
        />
      </section>
    </div>
  );
};
