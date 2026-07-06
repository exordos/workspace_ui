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
import {
  conversationIdForStream,
  conversationIdForTopic,
  selectMessengerConversationFromWorkspaceRoute,
} from "~/entities/messenger/messenger-ids.lib";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  markMessengerMessageRead,
  sendMessengerMessage,
} from "~/entities/messenger/messenger-message-actions.lib";
import { toggleMessengerMessageReaction } from "~/entities/messenger/messenger-message-reactions-actions.lib";
import { loadMessengerConversationMessages } from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerOutboxStore } from "~/entities/messenger/messenger-outbox.model";
import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
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
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import { t } from "~/i18n/i18n";
import { downloadWorkspaceFile, uploadWorkspaceFile } from "~/shared/api/messenger-files.api";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolution,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
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
import type { WorkspaceMessageMediaGalleryOpenRequest } from "~/widgets/workspace-message-list/workspace-message-list.types";
import { consumePendingForwardPrefill } from "./chat-forward.lib";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";
import { ChatPageWorkspaceMessageListSection } from "./chat-page-workspace-message-list-section.ui";
import {
  appendComposerMarkdownLinks,
  uploadWorkspaceComposerFiles,
  type ComposerUploadProgressState,
} from "./chat-upload.lib";
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
const EMPTY_OUTGOING_MESSAGES: MessengerOutgoingMessage[] = [];
const EMPTY_OUTGOING_MESSAGE_LOCAL_IDS: readonly string[] = [];
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

function isWorkspaceImageMediaReference(file: WorkspaceMessageFileReference): boolean {
  return file.kind === "media" && file.mediaKind === "image" && file.fileUuid.trim().length > 0;
}

function resolveWorkspaceMediaOpenFiles(
  file: WorkspaceMessageFileReference,
  gallery: WorkspaceMessageMediaGalleryOpenRequest | undefined,
): { files: readonly WorkspaceMessageFileReference[]; startIndex: number } | null {
  const files = (gallery?.items.map((item) => item.file) ?? [file]).filter(
    isWorkspaceImageMediaReference,
  );
  if (files.length === 0) {
    return null;
  }

  const clickedFileUuid = file.fileUuid.trim();
  const clickedIndex = files.findIndex(
    (candidate) => candidate.fileUuid.trim() === clickedFileUuid,
  );
  if (clickedIndex >= 0) {
    return { files, startIndex: clickedIndex };
  }

  const fallbackStartIndex =
    gallery == null ? 0 : Math.max(0, Math.min(gallery.startIndex, files.length - 1));

  return { files, startIndex: fallbackStartIndex };
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

function buildWorkspaceOutgoingPreviewMarkdown(
  content: string,
  files: readonly File[] | undefined,
): string {
  const trimmedContent = content.trim();
  if (trimmedContent.length > 0) return content;
  if (files == null || files.length === 0) return "";

  // Пока файлы еще не загружены, серверных workspace-file ссылок нет.
  // В локальной строке показываем имена файлов, чтобы пользователь видел,
  // какая именно отправка стоит в очереди или упала.
  return files
    .map((file) => file.name.trim())
    .filter((name) => name.length > 0)
    .join("\n");
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
  const [selectedMessageUuids, setSelectedMessageUuids] = useState<Set<string>>(() => new Set());
  const [replyQuote, setReplyQuote] = useState<ReplyQuote | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ComposerUploadProgressState | null>(null);
  const [draftInitialValue, setDraftInitialValue] = useState<string | undefined>(undefined);
  const [scrollToBottomAfterSendNonce, setScrollToBottomAfterSendNonce] = useState(0);
  const composerValueRef = useRef("");
  const pendingReadMessageUuidsRef = useRef<Set<string>>(new Set());
  const readRequestedMessageUuidsRef = useRef<Set<string>>(new Set());
  const readBatchTimerRef = useRef<number | null>(null);
  const actionAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const selection = useMemo(() => selectMessengerConversationFromWorkspaceRoute(route), [route]);
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const ownerKey = useMemo(
    () => (runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext)),
    [runtimeContext],
  );
  const conversationId = selection.status === "conversation" ? selection.conversationId : null;
  const selectionMode = selectedMessageUuids.size > 0;
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
  const outgoingMessagesByLocalId = useMessengerOutboxStore(
    (state) => state.outgoingMessagesByLocalId,
  );
  const outgoingMessageLocalIds = useMessengerOutboxStore((state) =>
    conversationId == null
      ? EMPTY_OUTGOING_MESSAGE_LOCAL_IDS
      : (state.outgoingMessageLocalIdsByConversationId[conversationId] ??
        EMPTY_OUTGOING_MESSAGE_LOCAL_IDS),
  );
  const outgoingMessages = useMemo(() => {
    if (ownerKey == null || outgoingMessageLocalIds.length === 0) return EMPTY_OUTGOING_MESSAGES;

    const messages = outgoingMessageLocalIds
      .map((localId) => outgoingMessagesByLocalId[localId])
      .filter((message): message is MessengerOutgoingMessage => message?.ownerKey === ownerKey);

    return messages.length === 0 ? EMPTY_OUTGOING_MESSAGES : messages;
  }, [outgoingMessageLocalIds, outgoingMessagesByLocalId, ownerKey]);
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
        rightPanelLabel: t("info.partnerInfo"),
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
        mode: "enabled",
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
      uploadAbortControllerRef.current = null;
      if (readBatchTimerRef.current != null) {
        window.clearTimeout(readBatchTimerRef.current);
        readBatchTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setUploadProgress(null);

    return () => {
      for (const controller of actionAbortControllersRef.current) {
        controller.abort();
      }
      actionAbortControllersRef.current.clear();
      uploadAbortControllerRef.current = null;
    };
  }, [conversationId, runtimeContext]);

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
    setSelectedMessageUuids(new Set());
    setReplyQuote(null);
  }, [conversationId]);

  useEffect(() => {
    return () => {
      const mediaViewerState = useMediaViewerStore.getState();
      if (mediaViewerState.items.some((item) => item.workspaceFile != null)) {
        mediaViewerState.close();
      }
    };
  }, [conversationId, runtimeContext]);

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
    async <T,>(
      action: (signal: AbortSignal) => Promise<T>,
      options: { onController?: (controller: AbortController) => void } = {},
    ): Promise<T> => {
      // Every write action gets its own AbortController so org/project switches do not apply old responses.
      const controller = new AbortController();
      actionAbortControllersRef.current.add(controller);
      options.onController?.(controller);
      try {
        return await action(controller.signal);
      } finally {
        actionAbortControllersRef.current.delete(controller);
        if (uploadAbortControllerRef.current === controller) {
          uploadAbortControllerRef.current = null;
        }
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

  const deliverOutgoingMessage = useCallback(
    (localId: string) => {
      const outgoing = useMessengerOutboxStore.getState().outgoingMessagesByLocalId[localId];
      if (outgoing == null) return;

      if (runtimeContext == null || ownerKey == null || outgoing.ownerKey !== ownerKey) {
        useMessengerOutboxStore
          .getState()
          .markOutgoingMessageFailed(localId, t("workspaceMessenger.runtimeUnavailable"));
        return;
      }

      const files = outgoing.files;
      const hasFiles = files != null && files.length > 0;
      if (hasFiles) {
        useMessengerOutboxStore.getState().markOutgoingMessageUploading(localId);
      } else {
        useMessengerOutboxStore.getState().markOutgoingMessageSending(localId);
      }

      void runWorkspaceAction(
        async (signal) => {
          try {
            const uploadedLinks = hasFiles
              ? await uploadWorkspaceComposerFiles(
                  [...files],
                  (file, uploadOptions) =>
                    uploadWorkspaceFile(
                      buildMessengerRequestOptions(
                        runtimeContext,
                        undefined,
                        uploadOptions?.signal,
                      ),
                      {
                        file,
                        streamUuid: outgoing.streamUuid,
                      },
                    ),
                  {
                    onProgress: setUploadProgress,
                    signal,
                  },
                )
              : [];
            const markdown = appendComposerMarkdownLinks(outgoing.sourceMarkdown, uploadedLinks);
            if (markdown.trim().length === 0) {
              useMessengerOutboxStore.getState().removeOutgoingMessage(localId);
              return;
            }

            // После успешной загрузки файлов retry больше не должен грузить их
            // повторно: локальная строка уже содержит итоговый markdown с
            // workspace-file ссылками, а следующий риск - только POST /messages.
            useMessengerOutboxStore.getState().markOutgoingMessageSending(localId, {
              markdown,
              sourceMarkdown: markdown,
              files: null,
            });

            const result = await sendMessengerMessage({
              runtimeContext,
              getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
              signal,
              streamUuid: outgoing.streamUuid,
              topicUuid: outgoing.topicUuid,
              markdown,
              includeStreamConversation: outgoing.includeStreamConversation,
            });

            if (result.status === "applied") {
              useMessengerOutboxStore
                .getState()
                .resolveOutgoingMessage(localId, result.message?.uuid);
              return;
            }

            useMessengerOutboxStore
              .getState()
              .markOutgoingMessageFailed(localId, t("message.sendFailed"));
          } catch (error) {
            useMessengerOutboxStore
              .getState()
              .markOutgoingMessageFailed(
                localId,
                normalizeWorkspaceActionError(error, t("message.sendFailed")),
              );
          } finally {
            setUploadProgress(null);
          }
        },
        {
          onController: (controller) => {
            if (hasFiles) {
              uploadAbortControllerRef.current = controller;
            }
          },
        },
      );
    },
    [ownerKey, runWorkspaceAction, runtimeContext],
  );

  const handleSend = useCallback(
    (content: string, _subjectOverride?: string, files?: File[]) => {
      // Composer remains old, but sending goes only through Workspace POST /messages/.
      setSendError(null);
      setUploadProgress(null);
      if (runtimeContext == null) {
        const error = t("workspaceMessenger.runtimeUnavailable");
        setSendError(error);
        throw new Error(error);
      }

      const target = resolveSendTarget();
      if (target.status === "blocked") {
        setSendError(target.error);
        throw new Error(target.error);
      }

      const previewMarkdown = buildWorkspaceOutgoingPreviewMarkdown(content, files);
      if (previewMarkdown.trim().length === 0) return;

      const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
        ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
        conversationId: target.includeStreamConversation
          ? conversationIdForStream(target.streamUuid)
          : conversationIdForTopic(target.streamUuid, target.topicUuid),
        projectId: runtimeContext.projectId,
        streamUuid: target.streamUuid,
        topicUuid: target.topicUuid,
        authorUuid: runtimeContext.userUuid,
        markdown: previewMarkdown,
        sourceMarkdown: content,
        status: files != null && files.length > 0 ? "uploading" : "sending",
        includeStreamConversation: target.includeStreamConversation,
        files,
      });

      // Скроллим сразу после локальной строки. Серверный snapshot позже может
      // переехать по backend created_at, но пользователь уже видит факт отправки.
      setScrollToBottomAfterSendNonce((value) => value + 1);
      deliverOutgoingMessage(outgoing.localId);
    },
    [deliverOutgoingMessage, resolveSendTarget, runtimeContext],
  );

  const handleCancelUpload = useCallback(() => {
    const controller = uploadAbortControllerRef.current;
    if (controller == null || controller.signal.aborted) return;
    controller.abort();
  }, []);

  const handleRetryOutgoingMessage = useCallback(
    (localId: string) => {
      deliverOutgoingMessage(localId);
      setScrollToBottomAfterSendNonce((value) => value + 1);
    },
    [deliverOutgoingMessage],
  );

  const handleRemoveOutgoingMessage = useCallback((localId: string) => {
    useMessengerOutboxStore.getState().removeOutgoingMessage(localId);
  }, []);

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

  const handleToggleMessageSelection = useCallback((messageUuid: string) => {
    setSelectedMessageUuids((current) => {
      const next = new Set(current);
      if (next.has(messageUuid)) {
        next.delete(messageUuid);
      } else {
        next.add(messageUuid);
      }
      return next;
    });
  }, []);

  const handleCancelMessageSelection = useCallback(() => {
    setSelectedMessageUuids(new Set());
  }, []);

  const handleForwardMessage = useCallback((messageUuid: string, selectedText?: string) => {
    const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
    if (message == null || selectedText?.trim().length === 0) {
      setActionError(t("workspaceMessenger.messageActionTargetMissing"));
      return;
    }

    setActionError(t("workspaceMessenger.forwardUnsupported"));
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

  const handleLoadWorkspaceFilePreview = useCallback(
    async (file: { fileUuid: string }, signal: AbortSignal): Promise<Blob> => {
      if (runtimeContext == null) {
        throw new Error(t("workspaceMessenger.runtimeUnavailable"));
      }

      const result = await downloadWorkspaceFile(
        buildMessengerRequestOptions(runtimeContext, undefined, signal),
        file.fileUuid,
      );
      return result.blob;
    },
    [runtimeContext],
  );

  const handleOpenWorkspaceMedia = useCallback(
    (file: WorkspaceMessageFileReference, gallery?: WorkspaceMessageMediaGalleryOpenRequest) => {
      setActionError(null);
      if (runtimeContext == null) {
        setActionError(t("workspaceMessenger.runtimeUnavailable"));
        return;
      }

      const mediaOpen = resolveWorkspaceMediaOpenFiles(file, gallery);
      if (mediaOpen == null) {
        setActionError(t("workspaceMessenger.mediaViewerUnsupported"));
        return;
      }

      void runWorkspaceAction(async (signal) => {
        const createdObjectUrls: string[] = [];
        try {
          const items: MediaItem[] = [];

          for (const mediaFile of mediaOpen.files) {
            const result = await downloadWorkspaceFile(
              buildMessengerRequestOptions(runtimeContext, undefined, signal),
              mediaFile.fileUuid,
            );
            if (signal.aborted) {
              return;
            }

            const objectUrl = URL.createObjectURL(result.blob);
            createdObjectUrls.push(objectUrl);
            if (signal.aborted) {
              return;
            }

            const fileName = deriveWorkspaceDownloadFileName({
              fileUuid: mediaFile.fileUuid,
              fileNameHint: mediaFile.name,
              contentDisposition: result.headers.get("content-disposition"),
            });
            const blobContentType = result.blob.type.trim();
            const contentType =
              mediaFile.contentType ?? (blobContentType.length > 0 ? blobContentType : undefined);
            const workspaceFile =
              contentType == null
                ? {
                    fileUuid: mediaFile.fileUuid,
                    name: fileName,
                    objectUrl,
                    onDownload: handleDownloadFile,
                  }
                : {
                    fileUuid: mediaFile.fileUuid,
                    name: fileName,
                    contentType,
                    objectUrl,
                    onDownload: handleDownloadFile,
                  };

            items.push({
              url: objectUrl,
              type: "image",
              previewUrl: objectUrl,
              alt: mediaFile.name ?? fileName,
              downloadFileName: fileName,
              workspaceFile,
            });
          }

          if (items.length === 0 || signal.aborted) {
            return;
          }

          useMediaViewerStore.getState().open(items, mediaOpen.startIndex);
          createdObjectUrls.length = 0;
        } finally {
          for (const objectUrl of createdObjectUrls) {
            URL.revokeObjectURL(objectUrl);
          }
        }
      }).catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setActionError(
            normalizeWorkspaceActionError(error, t("workspaceMessenger.mediaViewerUnsupported")),
          );
        }
      });
    },
    [handleDownloadFile, runWorkspaceAction, runtimeContext],
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
        outgoingMessages={outgoingMessages}
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
        selectionMode={selectionMode}
        selectedMessageUuids={selectedMessageUuids}
        onUnreadMessagesVisible={scheduleReadBatch}
        onUnreadMessagesAtBottom={scheduleReadBatch}
        onReplyMessage={handleReplyMessage}
        onForwardMessage={handleForwardMessage}
        onToggleMessageSelection={handleToggleMessageSelection}
        onEditMessage={handleEditMessage}
        onRequestDeleteMessage={handleRequestDeleteMessage}
        onCopyMessageText={handleCopyMessageText}
        onToggleMessageReaction={handleToggleMessageReaction}
        onDownloadFile={handleDownloadFile}
        onLoadWorkspaceFilePreview={handleLoadWorkspaceFilePreview}
        onOpenWorkspaceMedia={handleOpenWorkspaceMedia}
        onOpenUnsupportedFilePreview={handleOpenUnsupportedFilePreview}
        onRetryOutgoingMessage={handleRetryOutgoingMessage}
        onRemoveOutgoingMessage={handleRemoveOutgoingMessage}
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
        <ChatPageSelectionBar
          selectedCount={selectedMessageUuids.size}
          forwardDisabled
          deleteDisabled
          onForward={() => setActionError(t("workspaceMessenger.forwardUnsupported"))}
          onDelete={noop}
          onCancel={handleCancelMessageSelection}
        />
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
          uploadProgress={uploadProgress}
          onSend={handleSend}
          onCreateCallLink={undefined}
          onCancelUpload={handleCancelUpload}
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
