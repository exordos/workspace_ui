import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { createPendingDraft, syncDraftContent } from "~/entities/draft/draft-chat-sync.lib";
import { useDraftStore } from "~/entities/draft/draft.model";
import { canStartMessageContentEdit } from "~/entities/message/message-edit-policy.lib";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { useComposerTypingController } from "~/features/typing-indicator/composer-typing-controller.hook";
import {
  EMPTY_TYPING_USERS,
  useTypingIndicatorStore,
} from "~/features/typing-indicator/typing-indicator.model";
import {
  buildDmTypingChatKey,
  buildStreamTypingChatKey,
} from "~/features/typing-indicator/typing-key";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/messenger-client.internal";
import { fetchMessageById, updateMessage, deleteMessage } from "~/shared/api/messenger-messages";
import type { MockMessage } from "~/shared/api/messenger.types";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { getPresenceState, formatLastSeen } from "~/shared/lib/format";
import { createLogger } from "~/shared/lib/logger";
import { isMessageFromCurrentUser, messageAuthorId } from "~/shared/lib/message-author.lib";
import {
  logMessageFlow,
  logScrollReadFlow,
  summarizeChatContextForLog,
} from "~/shared/lib/message-flow-debug.lib";
import { createMessageId, type MessageId } from "~/shared/lib/message-id.lib";
import { isLikelyRenderedMessageHtml } from "~/shared/lib/message-markdown-display.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { useShortcut } from "~/shared/lib/shortcuts";
import { resolveCanonicalStreamName } from "~/shared/lib/stream-name.lib";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { formatTopicDoneLabel } from "~/shared/lib/topic-resolve";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { userIdStorageKey, userIdsEqual, type UserId } from "~/shared/lib/user-id.lib";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { useSidebarConfigStore } from "~/widgets/sidebar/sidebar-config.model";
import { isFocusedMessageLoadedInRoute } from "./chat-anchor-load.lib";
import { resolveLastOwnMessageForEdit } from "./chat-edit-last-message.lib";
import {
  buildForwardQuote,
  mergeForwardDraftContent,
  resolveForwardDraftTarget,
  setPendingForwardPrefill,
} from "./chat-forward.lib";
import { useChatMessageListCallbacks } from "./chat-message-list-callbacks.hook";
import { resolveNextUnreadTopicRoute } from "./chat-next-unread-topic.lib";
import { normalizeAiContextContent } from "./chat-page-ai.lib";
import { useChatPageCall } from "./chat-page-call.hook";
import { shouldShowTopicPrompt } from "./chat-page-composer-section.lib";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";
import { useChatPageDraftHydration } from "./chat-page-draft-sync.hook";
import { ChatPageFloatingToast } from "./chat-page-floating-toast.ui";
import { useChatForwardHydration } from "./chat-page-forward-hydration.hook";
import { ForwardMessageModalBody } from "./chat-page-forward-modal.ui";
import { useChatPageInitialLoad } from "./chat-page-initial-load.hook";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";
import { useChatPageMarkRead } from "./chat-page-mark-read.hook";
import { ChatPageMessageListSection } from "./chat-page-message-list-section.ui";
import { useChatPartnerProfileHydration } from "./chat-page-partner-profile.hook";
import { useChatPageReaction } from "./chat-page-reaction.hook";
import { ChatPageReadReceiptsDialog } from "./chat-page-read-receipts-dialog.ui";
import { useChatRouteContext } from "./chat-page-route-context.hook";
import { useChatPageRouteMetadataHydrate } from "./chat-page-route-metadata.hook";
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";
import { useChatPageSendMessage } from "./chat-page-send-message.hook";
import { useChatToastAutoClear } from "./chat-page-toast.hook";
import { ChatPageTypingLine } from "./chat-page-typing-line.ui";
import { resolveChatHeaderRightPanelLabel } from "./chat-page.lib";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

const log = createLogger("chat-page");
const AI_CONTEXT_MESSAGES_LIMIT = 30;

interface ComposerEditSessionState {
  messageId: MessageId;
  initialMarkdown: string;
}

export const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const location = useLocation();
  const {
    streamSlug,
    topicName,
    dmId: dmIdParam,
  } = useParams<{
    streamSlug?: string;
    topicName?: string;
    dmId?: string;
  }>();
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const dmsFromStore = useChatListStore((s) => s.dms());
  const expandStreamSlug = useSidebarConfigStore((s) => s.expandStreamSlug);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const currentUserMessageEditPolicy = useUsersStore((s) => s.currentUserMessageEditPolicy);
  const route = useChatRouteContext({
    streamSlug,
    topicName,
    dmIdParam,
    location,
    streamsMap,
    dmsFromStore,
    currentUserId,
  });
  const {
    activeTopic,
    activeTopicUuid,
    streamRouteTopic,
    activeStream,
    canonicalStreamName,
    resolvedStreamId,
    dmRecipientIds,
    isDmView,
    dmChat,
    partnerUserId,
    focusedMessageId,
    forwardMessageId,
  } = route;
  const activeDmUserIds = isDmView ? dmRecipientIds : null;
  const activeStreamId = resolvedStreamId;
  const activeStreamEntry = activeStreamId != null ? streamsMap.get(activeStreamId) : undefined;
  useChatPageRouteMetadataHydrate(activeStreamEntry != null ? activeStreamId : null);
  const isPrivateStreamView = !isDmView && activeStreamEntry?.private === true;
  const activeStreamCanonicalName = useMemo(
    () =>
      resolveCanonicalStreamName({
        streamId: activeStreamId,
        streamMapName: activeStreamEntry?.name ?? null,
        metadataName: canonicalStreamName,
      }),
    [activeStreamEntry?.name, activeStreamId, canonicalStreamName],
  );
  const activeStreamUuid = useMemo(() => {
    if (isDmView) {
      return dmChat?.streamUuid ?? null;
    }
    return activeStreamId != null ? (activeStreamEntry?.streamUuid ?? activeStreamId) : null;
  }, [activeStreamEntry?.streamUuid, activeStreamId, dmChat?.streamUuid, isDmView]);
  const topicNamesByUuid = useMemo(() => {
    if (activeStreamEntry == null) return undefined;
    const names = new Map<string, string>();
    for (const topic of activeStreamEntry.topics.values()) {
      const topicUuid = topic.topicUuid?.trim().toLowerCase();
      if (topicUuid != null && topicUuid.length > 0) {
        names.set(topicUuid, topic.subject);
      }
    }
    return names.size > 0 ? names : undefined;
  }, [activeStreamEntry]);
  const effectiveActiveTopicUuid = useMemo(() => {
    if (activeTopicUuid != null) {
      return activeTopicUuid;
    }
    return undefined;
  }, [activeTopicUuid]);
  const partnerUser = useUsersStore((s) =>
    partnerUserId != null ? s.getUser(partnerUserId) : undefined,
  );
  const partnerStoreDisplayName = useUsersStore((s) =>
    partnerUserId != null ? s.getDisplayName(partnerUserId) : "Unknown",
  );
  const isOneToOneDm = isDmView;
  const partnerDeactivated = isOneToOneDm ? partnerUser?.is_active === false : false;
  useChatPartnerProfileHydration({ partnerUserId, isDmView });

  const chatContextForMessages = useCurrentChatMessagesStore((s) => s.context);
  const messages = useCurrentChatMessagesStore((s) => s.messages);
  const isFocusedMessageLoadedInCurrentRoute = useMemo(() => {
    return isFocusedMessageLoadedInRoute({
      focusedMessageId,
      messages,
      isDmView,
      currentUserId,
      dmRecipientIds,
      resolvedStreamId,
      topicName,
      streamRouteTopic,
      activeTopicUuid: effectiveActiveTopicUuid,
    });
  }, [
    focusedMessageId,
    messages,
    isDmView,
    currentUserId,
    dmRecipientIds,
    resolvedStreamId,
    topicName,
    streamRouteTopic,
    effectiveActiveTopicUuid,
  ]);

  useEffect(() => {
    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;
    logMessageFlow("ui:resolved message list", {
      source: "store",
      context: summarizeChatContextForLog(chatContextForMessages),
      effectiveCount: messages.length,
      effectiveFirstId: firstId,
      effectiveLastId: lastId,
    });
  }, [messages.length, messages, chatContextForMessages]);
  const streams = useChatListStore((s) => s.streams());
  const handleDeleteMessagesInChatList = useChatListStore((s) => s.handleDeleteMessages);
  const realmBaseUrl = getRealmBaseUrl();
  const unreadMessages = useMemo(
    () =>
      messages.filter(
        (message) => message.read === false && !isMessageFromCurrentUser(message, currentUserId),
      ),
    [messages, currentUserId],
  );
  const firstUnreadId = unreadMessages[0]?.id;
  const unreadCount = unreadMessages.length;
  const activeTopicIsDone = useMemo(() => {
    if (activeTopic == null || activeStreamEntry == null) return false;
    if (effectiveActiveTopicUuid != null) {
      const normalizedTopicUuid = effectiveActiveTopicUuid.trim().toLowerCase();
      for (const topicEntry of activeStreamEntry.topics.values()) {
        if (topicEntry.topicUuid?.trim().toLowerCase() === normalizedTopicUuid) {
          return topicEntry.isDone === true;
        }
      }
    }
    return activeStreamEntry.topics.get(activeTopic)?.isDone === true;
  }, [activeStreamEntry, activeTopic, effectiveActiveTopicUuid]);
  const activeTopicDisplay = activeTopic != null ? resolveTopicDisplayInfo(activeTopic) : null;
  const activeTopicLabel =
    activeTopicDisplay != null
      ? formatTopicDoneLabel(activeTopicDisplay.label, activeTopicIsDone)
      : undefined;

  useEffect(() => {
    logScrollReadFlow("read:firstUnreadChange", {
      context: summarizeChatContextForLog(chatContextForMessages),
      firstUnreadId: firstUnreadId ?? null,
      unreadCount,
    });
  }, [firstUnreadId, unreadCount, chatContextForMessages]);

  const appendMessageToStore = useCurrentChatMessagesStore((s) => s.appendMessage);
  const commitOutgoingMessageToStore = useCurrentChatMessagesStore((s) => s.commitOutgoingMessage);
  const removeMessageFromStore = useCurrentChatMessagesStore((s) => s.removeMessage);
  const removeMessagesFromStore = useCurrentChatMessagesStore((s) => s.removeMessages);
  const updateMessageFlagsInStore = useCurrentChatMessagesStore((s) => s.updateMessageFlags);
  const applyOptimisticMessageEditInStore = useCurrentChatMessagesStore(
    (s) => s.applyOptimisticMessageEdit,
  );
  const commitOptimisticMessageEditInStore = useCurrentChatMessagesStore(
    (s) => s.commitOptimisticMessageEdit,
  );
  const failOptimisticMessageEditInStore = useCurrentChatMessagesStore(
    (s) => s.failOptimisticMessageEdit,
  );
  const cancelFailedMessageEditInStore = useCurrentChatMessagesStore(
    (s) => s.cancelFailedMessageEdit,
  );
  const isLoadingMore = useCurrentChatMessagesStore((s) => s.isLoadingMore);
  const isLoadingNewer = useCurrentChatMessagesStore((s) => s.isLoadingNewer);
  const hasNewerMessages = useCurrentChatMessagesStore((s) => s.hasNewerMessages);
  const boundaryLoadFailed = useCurrentChatMessagesStore((s) => s.boundaryLoadFailed);
  const clearBoundaryLoadFailed = useCurrentChatMessagesStore((s) => s.clearBoundaryLoadFailed);
  const [uploadProgress, setUploadProgress] = useState<ComposerUploadProgressState | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyQuote, setReplyQuote] = useState<{
    id: MessageId;
    content: string;
    sender_full_name: string;
    sender_id: UserId;
    permalinkUrl: string | null;
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<MessageId>>(new Set());
  const [composerEditSession, setComposerEditSession] = useState<ComposerEditSessionState | null>(
    null,
  );
  const { forwardMessages, setForwardMessages, forwardSelectedText, setForwardSelectedText } =
    useChatForwardHydration({ forwardMessageId, messages });
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [readReceiptsOpen, setReadReceiptsOpen] = useState(false);
  const editRequestTokenRef = useRef(0);
  const [deleteConfirm, setDeleteConfirm] = useState<
    { type: "single"; messageId: MessageId } | { type: "bulk"; messageIds: MessageId[] } | null
  >(null);
  const rightDrawer = useRightDrawer();
  const openJitsiCall = useJitsiCallStore((s) => s.openCall);
  const chatInfo = useChatInfoStore((s) => s.data);

  const readersLoading = useMessageReadersStore((s) => s.loading);
  const readersUserIds = useMessageReadersStore((s) => s.userIds);
  const readersError = useMessageReadersStore((s) => s.error);
  const allUsers = useUsersStore((s) => s.users);
  const drafts = useDraftStore((s) => s.drafts);

  const readerEntries = useMemo(
    () =>
      readersUserIds.map((uid) => {
        const u = allUsers.get(userIdStorageKey(uid));
        const trimmedName = u?.full_name?.trim();
        const name = trimmedName != null && trimmedName.length > 0 ? trimmedName : `User #${uid}`;
        return {
          userId: uid,
          name,
          statusLabel: formatUserStatusLabel(u?.status),
        };
      }),
    [readersUserIds, allUsers],
  );

  const aiMessagesContext = useMemo<AiMessageContext[]>(
    () =>
      messages
        .slice(-AI_CONTEXT_MESSAGES_LIMIT)
        .map((message) => ({
          id: message.id,
          senderId: messageAuthorId(message),
          senderName: message.sender_full_name,
          content: normalizeAiContextContent(message.content),
          timestamp: message.timestamp,
          isOwn: isMessageFromCurrentUser(message, currentUserId),
        }))
        .filter((message) => message.content.length > 0),
    [currentUserId, messages],
  );
  const aiChatContext = useMemo<AiReplyRequest["chatContext"] | undefined>(() => {
    if (isDmView) {
      return {
        type: "dm",
        dmPartnerName: partnerUser?.full_name ?? undefined,
      };
    }

    if (activeStream) {
      return {
        type: "stream",
        streamName: activeStream,
        topic: activeTopic ?? "",
      };
    }

    return undefined;
  }, [isDmView, partnerUser?.full_name, activeStream, activeTopic]);

  // --- Draft persistence ---
  const composerValueRef = useRef("");
  const [draftInitialValue, setDraftInitialValue] = useState<string | undefined>(undefined);
  const activeDraftIdRef = useRef<string | null>(null);
  const pendingForwardPrefillRef = useRef<string | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftTopicUuid = useMemo(() => {
    if (effectiveActiveTopicUuid != null) return effectiveActiveTopicUuid;
    if (activeStreamUuid == null) return null;
    const defaultTopicUuid = streamsMap.get(activeStreamUuid)?.defaultTopicUuid;
    if (defaultTopicUuid != null) return defaultTopicUuid;
    return (
      messages.find(
        (message) => message.stream_uuid === activeStreamUuid && message.topic_uuid != null,
      )?.topic_uuid ?? null
    );
  }, [activeStreamUuid, effectiveActiveTopicUuid, messages, streamsMap]);

  useEffect(() => {
    // On route change close edit session and invalidate in-flight markdown loads.
    editRequestTokenRef.current += 1;
    setComposerEditSession(null);
  }, [location.pathname]);

  useChatPageDraftHydration({
    streamUuid: activeStreamUuid,
    topicUuid: draftTopicUuid,
    drafts,
    composerValueRef,
    activeDraftIdRef,
    pendingForwardPrefillRef,
    setDraftInitialValue,
  });

  const queueDraftSync = useCallback(
    (content: string) => {
      if (activeStreamUuid == null || draftTopicUuid == null) return;
      let draftUuid = activeDraftIdRef.current;
      if (draftUuid == null) {
        if (content.trim().length === 0) return;
        draftUuid = createMessageId();
        activeDraftIdRef.current = draftUuid;
        useDraftStore.getState().upsertDraft(
          createPendingDraft({
            uuid: draftUuid,
            streamUuid: activeStreamUuid,
            topicUuid: draftTopicUuid,
            content,
          }),
        );
      } else {
        useDraftStore.getState().updateDraftPayload(draftUuid, content, "pending");
      }

      const targetUuid = draftUuid;
      draftSyncQueueRef.current = draftSyncQueueRef.current
        .catch(() => {})
        .then(async () => {
          for (;;) {
            const store = useDraftStore.getState();
            const currentContent = composerValueRef.current;
            const result = await syncDraftContent({
              uuid: targetUuid,
              streamUuid: activeStreamUuid,
              topicUuid: draftTopicUuid,
              content: currentContent,
              getDraft: store.getDraft,
              getCurrentContent: () => composerValueRef.current,
              upsertDraft: store.upsertDraft,
              updateDraftPayload: store.updateDraftPayload,
              markDraftConflict: store.markDraftConflict,
              removeDraft: store.removeDraft,
            });
            if (result.status === "deleted" && !result.needsResync) {
              if (activeDraftIdRef.current === targetUuid) {
                activeDraftIdRef.current = null;
              }
            } else if (result.status === "conflict") {
              setActionError(t("draft.conflict"));
            }
            if (!result.needsResync) break;
          }
        })
        .catch((error) => {
          reportUnexpectedError("chat:draftSync", error, { draftUuid: targetUuid });
          setActionError(t("draft.saveError"));
        });
    },
    [activeStreamUuid, draftTopicUuid],
  );

  const scheduleDraftSync = useCallback(
    (content: string) => {
      if (draftSaveTimerRef.current != null) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
      draftSaveTimerRef.current = window.setTimeout(() => {
        draftSaveTimerRef.current = null;
        queueDraftSync(content);
      }, 500);
    },
    [queueDraftSync],
  );

  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current != null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      queueDraftSync(composerValueRef.current);
    };
  }, [queueDraftSync]);

  const typingTarget = useMemo(() => {
    if (isDmView && activeDmUserIds?.length) {
      return { kind: "dm" as const, userIds: activeDmUserIds };
    }
    if (activeStreamId != null && activeTopic) {
      return { kind: "stream" as const, streamId: activeStreamId, topic: activeTopic };
    }
    return null;
  }, [isDmView, activeDmUserIds, activeStreamId, activeTopic]);
  const { onComposerValueChange: onComposerValueChangeTyping, stopNow: stopTypingNow } =
    useComposerTypingController({
      enabled: true,
      target: typingTarget,
      idleStopDelayMs: 3000,
    });

  const { handleUnreadMessagesVisible, handleUnreadMessagesAtBottom } = useChatPageMarkRead({
    currentUserId,
    isDmView,
    activeDmUserIds,
    activeDmStreamId: isDmView ? activeStreamUuid : null,
    activeStreamId,
    activeTopic,
    activeTopicUuid: effectiveActiveTopicUuid ?? null,
    streamSlug,
    topicName,
    dmIdParam,
    messages,
    updateMessageFlagsInStore,
  });

  const isTextInputFocused = useCallback((): boolean => {
    if (typeof document === "undefined") return false;
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return false;
    const tag = activeElement.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || activeElement.isContentEditable;
  }, []);

  const handleOpenNextUnreadTopic = useCallback(() => {
    if (isTextInputFocused() || isDmView || activeStreamId == null) return;
    const currentStream = streams.find((stream) => stream.streamUuid === activeStreamId);
    if (!currentStream) return;
    const route = resolveNextUnreadTopicRoute({
      streamId: currentStream.streamUuid,
      currentTopic: activeTopic,
      topics: currentStream.topics,
    });
    if (!route || route === location.pathname) return;
    void navigate(route);
  }, [
    isTextInputFocused,
    isDmView,
    activeStreamId,
    streams,
    activeTopic,
    location.pathname,
    navigate,
  ]);

  useShortcut("shift+n", handleOpenNextUnreadTopic, { context: "chat", enabled: !isDmView });

  const handleComposerValueChange = useCallback(
    (v: string) => {
      if (composerEditSession != null) {
        return;
      }
      composerValueRef.current = v;
      onComposerValueChangeTyping(v);
      scheduleDraftSync(v);
    },
    [onComposerValueChangeTyping, scheduleDraftSync, composerEditSession],
  );

  useEffect(() => stopTypingNow, [stopTypingNow]);

  const handleExpandCurrentStreamTopics = useCallback(() => {
    if (!streamSlug) return;
    // Composer "pick topic" — expand current stream in sidebar without duplicating slug in store.
    expandStreamSlug(streamSlug);
  }, [expandStreamSlug, streamSlug]);

  useChatToastAutoClear({
    toastMessage,
    clearToast: () => setToastMessage(null),
    timeoutMs: 2000,
  });

  const navigateToDm = useCallback(
    (targetUserId: UserId) => {
      void navigate(withCurrentOrgRoute(`/dm/${targetUserId}`));
    },
    [navigate],
  );

  const {
    messagesLoading,
    hasInitialMessagesPayload,
    messagesLoadError,
    loadOlderMessages,
    loadNewerMessages,
    handleRetryMessagesLoad,
  } = useChatPageInitialLoad({
    streamSlug,
    topicName,
    dmIdParam,
    activeStreamCanonicalName,
    resolvedStreamId,
    streamRouteTopic,
    activeTopicUuid: effectiveActiveTopicUuid,
    focusedMessageId,
    currentUserId,
    isFocusedMessageLoadedInCurrentRoute,
    setActionError,
  });

  const handleDismissBoundaryLoadFailed = useCallback(() => {
    clearBoundaryLoadFailed();
  }, [clearBoundaryLoadFailed]);

  const handleDismissActionError = useCallback(() => {
    setActionError(null);
  }, []);

  const handleDismissSendError = useCallback(() => {
    setSendError(null);
  }, []);

  const { canStartCall, buildCurrentCallLink, handleCallClick } = useChatPageCall({
    isDmView,
    isOneToOneDm,
    partnerDeactivated,
    partnerUserId,
    partnerUserFullName: partnerUser?.full_name,
    activeDmUserIds,
    activeStream: activeStream ?? null,
    activeStreamUuid,
    activeTopic: activeTopic ?? null,
    activeTopicUuid: effectiveActiveTopicUuid ?? null,
    currentUserId,
    setSendError,
    navigateToDm,
  });

  const { handleSend, handleRetryFailedOutgoing, handleRemoveFailedOutgoing, handleCancelUpload } =
    useChatPageSendMessage({
      currentUserId,
      isDmView,
      activeDmUserIds,
      activeStream: activeStream ?? null,
      activeStreamCanonicalName: activeStreamCanonicalName ?? null,
      activeStreamId,
      activeStreamUuid,
      activeTopic,
      activeTopicUuid: effectiveActiveTopicUuid,
      appendMessage: appendMessageToStore,
      commitOutgoingMessage: commitOutgoingMessageToStore,
      removeMessage: removeMessageFromStore,
      clearReplyQuote: () => setReplyQuote(null),
      stopTyping: stopTypingNow,
      setSendError,
      setUploadProgress,
    });

  const { onMessageAddReaction, onMessageRemoveReaction } = useChatPageReaction({
    currentUserId,
    setActionError,
  });

  const resolveEditableMessageMarkdown = useCallback(
    async (message: MockMessage): Promise<string> => {
      // Prefer markdown from the already-loaded message.
      const fromSource = message.markdown_source?.trim();
      if (fromSource != null && fromSource.length > 0) {
        return fromSource;
      }

      // If content looks like markdown, use it without an extra fetch.
      const body = message.content.trim();
      if (body.length > 0 && !isLikelyRenderedMessageHtml(body)) {
        return body;
      }

      // Fallback: fetch message from server for raw markdown.
      const fresh = await fetchMessageById(message.id);
      const freshSource = fresh?.markdown_source?.trim();
      if (freshSource != null && freshSource.length > 0) {
        return freshSource;
      }

      const freshBody = fresh?.content?.trim() ?? "";
      if (freshBody.length > 0 && !isLikelyRenderedMessageHtml(freshBody)) {
        return freshBody;
      }

      return "";
    },
    [],
  );

  const requestMessageEdit = useCallback(
    (message: MockMessage) => {
      if (
        !canStartMessageContentEdit(
          message,
          currentUserId,
          currentUserMessageEditPolicy,
          Math.floor(Date.now() / 1000),
        )
      ) {
        setActionError(t("message.editUnavailable"));
        return;
      }
      // Token prevents edit race — apply only the latest request result.
      const requestToken = editRequestTokenRef.current + 1;
      editRequestTokenRef.current = requestToken;
      setActionError(null);
      void resolveEditableMessageMarkdown(message).then((initialMarkdown) => {
        if (editRequestTokenRef.current !== requestToken) return;
        setComposerEditSession({ messageId: message.id, initialMarkdown });
      });
    },
    [currentUserId, currentUserMessageEditPolicy, resolveEditableMessageMarkdown],
  );

  const persistOptimisticMessageEdit = useCallback(
    async (messageId: MessageId, markdown: string) => {
      let updatedMessage: MockMessage | null;
      try {
        updatedMessage = await updateMessage(messageId, { content: markdown });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t("message.saveError");
        failOptimisticMessageEditInStore(messageId, errorMessage);
        setActionError(errorMessage);
        throw err;
      }

      if (updatedMessage != null) {
        commitOptimisticMessageEditInStore(messageId, updatedMessage);
        return;
      }

      try {
        const fresh = await fetchMessageById(messageId);
        commitOptimisticMessageEditInStore(messageId, fresh);
      } catch (err) {
        log.warn("Fetch edited message failed after successful save", {
          messageId,
          error: String(err),
        });
        commitOptimisticMessageEditInStore(messageId);
      }
    },
    [commitOptimisticMessageEditInStore, failOptimisticMessageEditInStore],
  );

  const handleSubmitComposerEdit = useCallback(
    async (messageId: MessageId, markdown: string) => {
      setActionError(null);
      const message = useCurrentChatMessagesStore
        .getState()
        .messages.find((candidate) => candidate.id === messageId);
      if (
        message != null &&
        !canStartMessageContentEdit(
          message,
          currentUserId,
          currentUserMessageEditPolicy,
          Math.floor(Date.now() / 1000),
        )
      ) {
        const messageEditUnavailable = t("message.editUnavailable");
        setActionError(messageEditUnavailable);
        throw new Error(messageEditUnavailable);
      }
      applyOptimisticMessageEditInStore(messageId, markdown);
      setComposerEditSession(null);
      await persistOptimisticMessageEdit(messageId, markdown);
    },
    [
      currentUserId,
      currentUserMessageEditPolicy,
      applyOptimisticMessageEditInStore,
      persistOptimisticMessageEdit,
    ],
  );

  const handleRetryFailedEdit = useCallback(
    (message: MockMessage) => {
      if (message.edit_status !== "failed") return;
      const markdown = message.pending_edit_markdown?.trim();
      if (markdown == null || markdown.length === 0) return;
      if (
        !canStartMessageContentEdit(
          message,
          currentUserId,
          currentUserMessageEditPolicy,
          Math.floor(Date.now() / 1000),
        )
      ) {
        setActionError(t("message.editUnavailable"));
        return;
      }
      setActionError(null);
      applyOptimisticMessageEditInStore(message.id, markdown);
      void persistOptimisticMessageEdit(message.id, markdown).catch(() => undefined);
    },
    [
      currentUserId,
      currentUserMessageEditPolicy,
      applyOptimisticMessageEditInStore,
      persistOptimisticMessageEdit,
    ],
  );

  const handleCancelFailedEdit = useCallback(
    (message: MockMessage) => {
      if (message.edit_status !== "failed") return;
      cancelFailedMessageEditInStore(message.id);
      setActionError(null);
    },
    [cancelFailedMessageEditInStore],
  );

  const messageCallbacks = useChatMessageListCallbacks({
    selectionMode,
    currentUserId,
    realmBaseUrl,
    streams,
    locationPathname: location.pathname,
    locationSearch: location.search,
    isDmView,
    dmRecipientIds,
    resolvedStreamId,
    topicName,
    streamRouteTopic,
    navigate,
    rightDrawer,
    setReplyQuote,
    requestMessageEdit,
    setDeleteConfirm,
    setToastMessage,
    setForwardMessages,
    setForwardSelectedText,
    setActionError,
    setSelectedMessageIds,
    setSelectionMode,
    updateMessageFlagsInStore,
    onMessageAddReaction,
    onMessageRemoveReaction,
    openJitsiCall: (url, locationName) => openJitsiCall({ meetingUrl: url, locationName }),
    setReadReceiptsOpen,
    onRetryFailedOutgoing: handleRetryFailedOutgoing,
    onRemoveFailedOutgoing: handleRemoveFailedOutgoing,
    onRetryFailedEdit: handleRetryFailedEdit,
    onCancelFailedEdit: handleCancelFailedEdit,
  });

  const handleEditLastMessage = useCallback(() => {
    const lastOwnMessageForEdit = resolveLastOwnMessageForEdit(
      useCurrentChatMessagesStore.getState().messages,
      currentUserId,
      currentUserMessageEditPolicy,
      Math.floor(Date.now() / 1000),
    );
    if (lastOwnMessageForEdit == null) return;
    requestMessageEdit(lastOwnMessageForEdit);
  }, [currentUserId, currentUserMessageEditPolicy, requestMessageEdit]);

  const handleForwardTo = useCallback(
    (stream: string, topic: string, to?: number[]) => {
      if (forwardMessages.length === 0) return;
      setSendError(null);
      const quoted = buildForwardQuote(forwardMessages, forwardSelectedText, {
        realmBaseUrl,
        wroteLabel: t("message.replyQuoteWrote"),
        resolveStreamName: (streamId, message) =>
          streams.find((candidate) => candidate.streamUuid === streamId)?.name ??
          message.channel ??
          (typeof message.display_recipient === "string" ? message.display_recipient : undefined),
      });
      const target = resolveForwardDraftTarget(stream, topic, to, streams);
      if (target == null) {
        setSendError(t("message.forwardError"));
        return;
      }

      const mergedForwardContent = mergeForwardDraftContent(quoted, undefined);

      setForwardMessages([]);
      setForwardSelectedText(undefined);
      setReplyQuote(null);
      if (selectionMode) {
        setSelectionMode(false);
        setSelectedMessageIds(new Set());
      }
      if (target.route !== location.pathname) {
        setPendingForwardPrefill(target.route, mergedForwardContent);
        void navigate(target.route, { replace: true });
      } else {
        pendingForwardPrefillRef.current = mergedForwardContent;
        setDraftInitialValue(mergedForwardContent);
        composerValueRef.current = mergedForwardContent;
        scheduleDraftSync(mergedForwardContent);
      }
    },
    [
      forwardMessages,
      selectionMode,
      streams,
      forwardSelectedText,
      location.pathname,
      navigate,
      realmBaseUrl,
      scheduleDraftSync,
      t,
    ],
  );

  const handleToggleRightPanel = useCallback(() => {
    rightDrawer?.setOpen(!rightDrawer.open);
  }, [rightDrawer]);

  const handleOpenRightPanel = useCallback(() => {
    // Header click returns to current chat info and clears nested user profile overlay.
    rightDrawer?.openInfo?.();
    if (rightDrawer?.openInfo == null) {
      rightDrawer?.setOpen(true);
    }
  }, [rightDrawer]);

  const handleOpenDmPartnerProfile = useCallback(() => {
    if (partnerUserId == null) return;
    rightDrawer?.openUserProfile?.(partnerUserId);
  }, [partnerUserId, rightDrawer]);

  const typingChatKey = useMemo(() => {
    if (isDmView && activeDmUserIds?.length && currentUserId != null) {
      return buildDmTypingChatKey(activeDmUserIds, currentUserId);
    }
    if (activeStreamId != null && activeTopic) {
      return buildStreamTypingChatKey(activeStreamId, activeTopic);
    }
    return null;
  }, [isDmView, activeDmUserIds, currentUserId, activeStreamId, activeTopic]);

  const typingUsers = useTypingIndicatorStore((s) =>
    typingChatKey ? s.getTypingUsers(typingChatKey) : EMPTY_TYPING_USERS,
  );
  const dmPartnerIsTyping = useMemo(
    () =>
      isOneToOneDm &&
      partnerUserId != null &&
      typingUsers.some((typingUser) => userIdsEqual(typingUser.userId, partnerUserId)),
    [isOneToOneDm, partnerUserId, typingUsers],
  );

  const typingText = useMemo(() => {
    if (typingUsers.length === 0) return null;
    const names = typingUsers
      .filter((tu) => currentUserId == null || !userIdsEqual(tu.userId, currentUserId))
      .map((tu) => useUsersStore.getState().getDisplayName(tu.userId))
      .filter((n) => n !== "Unknown");
    if (names.length === 0) return null;
    if (names.length === 1) return t("chat.typingUser", { name: names[0]! });
    return t("chat.typingUsers", { names: names.join(", ") });
  }, [typingUsers, currentUserId]);

  const deletableSelectedMessageIds = useMemo(
    () =>
      messages
        .filter((m) => selectedMessageIds.has(m.id) && isMessageFromCurrentUser(m, currentUserId))
        .map((m) => m.id),
    [currentUserId, messages, selectedMessageIds],
  );

  const forwardableSelectedMessages = useMemo(
    () => messages.filter((m) => selectedMessageIds.has(m.id)),
    [messages, selectedMessageIds],
  );

  const dmPartner = useMemo(() => {
    if (!isDmView || partnerUserId == null) return undefined;
    const resolvedName = resolvePersonalDmSidebarTitle({
      chatName: dmChat?.name ?? "",
      userFullName: partnerUser?.full_name,
      storeDisplayName: partnerStoreDisplayName,
    });
    return {
      avatarUrl: partnerUser?.avatar_url ?? undefined,
      name: resolvedName,
      presenceState:
        partnerUser?.presence != null
          ? getPresenceState(partnerUser.presence.timestamp, partnerUser.presence.status)
          : null,
      lastSeen:
        partnerUser?.presence != null
          ? formatLastSeen(partnerUser.presence.timestamp, partnerUser.presence.status)
          : undefined,
      customStatus: formatUserStatusLabel(partnerUser?.status) ?? undefined,
      status: partnerUser?.status,
      isAccountDeactivated: partnerDeactivated,
      isTyping: dmPartnerIsTyping,
    };
  }, [
    isDmView,
    partnerUserId,
    partnerUser,
    dmPartnerIsTyping,
    partnerDeactivated,
    dmChat?.name,
    partnerStoreDisplayName,
  ]);

  const handleSelectionForward = useCallback(() => {
    if (forwardableSelectedMessages.length === 0) return;
    setForwardMessages(forwardableSelectedMessages);
    setForwardSelectedText(undefined);
  }, [forwardableSelectedMessages, setForwardMessages, setForwardSelectedText]);

  const handleSelectionDelete = useCallback(() => {
    if (deletableSelectedMessageIds.length === 0) return;
    setDeleteConfirm({ type: "bulk", messageIds: deletableSelectedMessageIds });
  }, [deletableSelectedMessageIds]);

  const handleSelectionCancel = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    setActionError(null);
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "single") {
      const messageId = deleteConfirm.messageId;
      deleteMessage(messageId)
        .then(() => {
          handleDeleteMessagesInChatList([messageId], {
            replacementMessages: useCurrentChatMessagesStore.getState().messages,
          });
          removeMessageFromStore(messageId);
        })
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : t("message.deleteError")),
        );
    } else {
      const ids = deleteConfirm.messageIds;
      Promise.all(ids.map((id) => deleteMessage(id)))
        .then(() => {
          handleDeleteMessagesInChatList(ids, {
            replacementMessages: useCurrentChatMessagesStore.getState().messages,
          });
          removeMessagesFromStore(ids);
          setSelectedMessageIds(new Set());
          setSelectionMode(false);
        })
        .catch((err) => setActionError(err instanceof Error ? err.message : t("app.error")));
    }
    setDeleteConfirm(null);
  }, [
    deleteConfirm,
    handleDeleteMessagesInChatList,
    removeMessageFromStore,
    removeMessagesFromStore,
    t,
  ]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-chat-page flex-1 flex-col overflow-hidden">
      {/* Forward message modal */}
      <AppDialogShell
        open={forwardMessages.length > 0}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setForwardMessages([]);
            setForwardSelectedText(undefined);
          }
        }}
        contentClassName={`${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex max-h-[70vh] max-w-md -translate-y-1/2 flex-col p-0`}
      >
        {forwardMessages.length > 0 && (
          <ForwardMessageModalBody
            streams={streams}
            onForward={handleForwardTo}
            onClose={() => {
              setForwardMessages([]);
              setForwardSelectedText(undefined);
            }}
          />
        )}
      </AppDialogShell>

      <ChatPageReadReceiptsDialog
        open={readReceiptsOpen}
        onOpenChange={setReadReceiptsOpen}
        readersLoading={readersLoading}
        readersError={readersError}
        readerEntries={readerEntries}
      />

      <ChatHeader
        channelName={activeStream ? `#${activeStream}` : t("channel.channelName")}
        topic={activeTopicLabel}
        systemTopic={activeTopicDisplay?.isSystem ?? false}
        hideTopic={activeTopic == null}
        participantsCount={chatInfo?.memberCount ?? 0}
        onlineCount={chatInfo?.onlineCount ?? 0}
        onOpenSearch={openSearch ?? undefined}
        onToggleRightPanel={rightDrawer ? handleToggleRightPanel : undefined}
        onOpenRightPanel={rightDrawer ? handleOpenRightPanel : undefined}
        rightPanelOpen={rightDrawer?.open ?? false}
        rightPanelLabel={resolveChatHeaderRightPanelLabel(isDmView)}
        hideParticipants={isDmView}
        onCallClick={canStartCall ? handleCallClick : undefined}
        dmPartner={dmPartner}
        onDmPartnerClick={handleOpenDmPartnerProfile}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatPageMessageListSection
          messagesLoading={messagesLoading}
          hasInitialPayload={hasInitialMessagesPayload}
          isDmView={isDmView}
          activeDmUserIds={activeDmUserIds}
          activeStreamId={activeStreamId}
          activeStream={activeStream}
          activeTopicUuid={effectiveActiveTopicUuid}
          activeTopic={activeTopic}
          topicNamesByUuid={topicNamesByUuid}
          messages={messages}
          currentUserId={currentUserId ?? undefined}
          callbacks={messageCallbacks}
          selectionMode={selectionMode}
          selectedMessageIds={selectedMessageIds}
          onLoadMore={loadOlderMessages}
          isLoadingMore={isLoadingMore}
          isLoadingNewer={isLoadingNewer}
          onLoadNewer={loadNewerMessages}
          hasNewerMessages={hasNewerMessages}
          firstUnreadId={firstUnreadId}
          unreadCount={unreadCount}
          focusedMessageId={focusedMessageId}
          onUnreadMessagesVisible={handleUnreadMessagesVisible}
          onUnreadMessagesAtBottom={handleUnreadMessagesAtBottom}
          messagesLoadError={messagesLoadError}
          onRetryMessagesLoad={handleRetryMessagesLoad}
          boundaryLoadFailed={boundaryLoadFailed}
          onDismissBoundaryLoadFailed={handleDismissBoundaryLoadFailed}
        />
        {selectionMode && selectedMessageIds.size > 0 && (
          <ChatPageSelectionBar
            selectedCount={selectedMessageIds.size}
            forwardDisabled={forwardableSelectedMessages.length === 0}
            deleteDisabled={deletableSelectedMessageIds.length === 0}
            onForward={handleSelectionForward}
            onDelete={handleSelectionDelete}
            onCancel={handleSelectionCancel}
          />
        )}
        {deleteConfirm && (
          <ChatPageDeleteConfirmBar
            mode={deleteConfirm.type}
            bulkCount={deleteConfirm.type === "bulk" ? deleteConfirm.messageIds.length : undefined}
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
          />
        )}
        <ChatPageInlineAlerts
          actionError={actionError}
          sendError={sendError}
          onDismissActionError={handleDismissActionError}
          onDismissSendError={handleDismissSendError}
        />
        <ChatPageFloatingToast message={toastMessage} />
        <ChatPageTypingLine
          text={typingText}
          visible={Boolean(typingText && !(isOneToOneDm && dmPartnerIsTyping))}
        />
        <ChatPageComposerSection
          isDmView={isDmView}
          activeStreamUuid={activeStreamUuid}
          dmPartnerDeactivated={partnerDeactivated}
          activeStream={activeStream}
          showTopicPrompt={shouldShowTopicPrompt({
            isDmView,
            isPrivateStreamView,
            activeTopic,
          })}
          streamSlug={streamSlug}
          onExpandStreamTopics={handleExpandCurrentStreamTopics}
          uploadProgress={uploadProgress}
          onSend={handleSend}
          onCreateCallLink={canStartCall ? buildCurrentCallLink : undefined}
          onCancelUpload={handleCancelUpload}
          activeTopic={activeTopic}
          replyQuote={replyQuote}
          onClearReply={() => setReplyQuote(null)}
          draftInitialValue={draftInitialValue}
          onComposerValueChange={handleComposerValueChange}
          onEditLastMessage={handleEditLastMessage}
          editSession={composerEditSession}
          onSubmitEdit={handleSubmitComposerEdit}
          onCancelEdit={() => setComposerEditSession(null)}
          aiMessagesContext={aiMessagesContext}
          aiChatContext={aiChatContext}
        />
      </section>
    </div>
  );
};
