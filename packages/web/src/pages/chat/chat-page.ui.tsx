import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  reconcileCreatedDraftServerId,
  syncExistingDraftDeleteOnCleanup,
  syncExistingDraftDeleteOnClear,
  syncExistingDraftUpdateOnCleanup,
} from "~/entities/draft/draft-chat-sync.lib";
import { resolveDraftTargetIds } from "~/entities/draft/draft-chat-target.lib";
import { createDraft, deleteDraftOnServer, updateDraftOnServer } from "~/entities/draft/draft.api";
import { useDraftStore } from "~/entities/draft/draft.model";
import type { DraftType } from "~/entities/draft/draft.types";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { useComposerTypingController } from "~/features/typing-indicator/composer-typing-controller.hook";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import {
  buildDmTypingChatKey,
  buildStreamTypingChatKey,
} from "~/features/typing-indicator/typing-key";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { fetchMessageById, updateMessage, deleteMessage } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { getPresenceState, formatLastSeen } from "~/shared/lib/format";
import { createLogger } from "~/shared/lib/logger";
import {
  logMessageFlow,
  logScrollReadFlow,
  summarizeChatContextForLog,
} from "~/shared/lib/message-flow-debug.lib";
import { isLikelyRenderedMessageHtml } from "~/shared/lib/message-markdown-display.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { useShortcut } from "~/shared/lib/shortcuts";
import { resolveCanonicalStreamName } from "~/shared/lib/stream-name.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { useSidebarConfigStore } from "~/widgets/sidebar/sidebar-config.model";
import { isFocusedMessageLoadedInRoute } from "./chat-anchor-load.lib";
import { resolveLastOwnMessageForEdit } from "./chat-edit-last-message.lib";
import { countUnreadMessages, resolveFirstUnreadBoundaryMessageId } from "./chat-first-unread.lib";
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
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";
import { useChatPageSendMessage } from "./chat-page-send-message.hook";
import { useChatToastAutoClear } from "./chat-page-toast.hook";
import { ChatPageTypingLine } from "./chat-page-typing-line.ui";
import {
  resolveChatHeaderRightPanelLabel,
  resolveDmGroupParticipantIds,
  resolveDraftType,
} from "./chat-page.lib";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

const log = createLogger("chat-page");
const AI_CONTEXT_MESSAGES_LIMIT = 30;

interface ComposerEditSessionState {
  messageId: number;
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
    streamRouteTopic,
    activeStream,
    canonicalStreamName,
    resolvedStreamId,
    dmRecipientIds,
    isDmView,
    dmChat,
    isGroupDmView,
    partnerUserId,
    focusedMessageId,
    forwardMessageId,
  } = route;
  const activeDmUserIds = isDmView ? dmRecipientIds : null;
  const activeStreamId = resolvedStreamId;
  const activeStreamCanonicalName = useMemo(
    () =>
      resolveCanonicalStreamName({
        streamId: activeStreamId,
        streamMapName: activeStreamId != null ? streamsMap.get(activeStreamId)?.name : null,
        metadataName: canonicalStreamName,
      }),
    [activeStreamId, canonicalStreamName, streamsMap],
  );
  const partnerUser = useUsersStore((s) =>
    partnerUserId != null ? s.getUser(partnerUserId) : undefined,
  );
  const partnerStoreDisplayName = useUsersStore((s) =>
    partnerUserId != null ? s.getDisplayName(partnerUserId) : "Unknown",
  );
  const isOneToOneDm = isDmView && !isGroupDmView;
  const partnerDeactivated = isOneToOneDm ? partnerUser?.is_active === false : false;
  useChatPartnerProfileHydration({ partnerUserId, isDmView, isGroupDmView });

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
  const firstUnreadId = useMemo(
    () => resolveFirstUnreadBoundaryMessageId(messages, currentUserId),
    [messages, currentUserId],
  );
  const unreadCount = useMemo(
    () => countUnreadMessages(messages, currentUserId),
    [messages, currentUserId],
  );

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
  const updateMessageReactionInStore = useCurrentChatMessagesStore((s) => s.updateMessageReaction);
  const updateMessageContentInStore = useCurrentChatMessagesStore((s) => s.updateMessageContent);
  const isLoadingMore = useCurrentChatMessagesStore((s) => s.isLoadingMore);
  const isLoadingNewer = useCurrentChatMessagesStore((s) => s.isLoadingNewer);
  const hasNewerMessages = useCurrentChatMessagesStore((s) => s.hasNewerMessages);
  const boundaryLoadFailed = useCurrentChatMessagesStore((s) => s.boundaryLoadFailed);
  const clearBoundaryLoadFailed = useCurrentChatMessagesStore((s) => s.clearBoundaryLoadFailed);
  const [uploadProgress, setUploadProgress] = useState<ComposerUploadProgressState | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyQuote, setReplyQuote] = useState<{
    id: number;
    content: string;
    sender_full_name: string;
    sender_id: number;
    permalinkUrl: string | null;
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set());
  const [composerEditSession, setComposerEditSession] = useState<ComposerEditSessionState | null>(
    null,
  );
  const { forwardMessages, setForwardMessages, forwardSelectedText, setForwardSelectedText } =
    useChatForwardHydration({ forwardMessageId, messages });
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [readReceiptsOpen, setReadReceiptsOpen] = useState(false);
  const [scrollToBottomAfterSendNonce, setScrollToBottomAfterSendNonce] = useState(0);
  const requestScrollToBottomAfterSend = useCallback(() => {
    setScrollToBottomAfterSendNonce((nonce) => nonce + 1);
  }, []);
  const editRequestTokenRef = useRef(0);
  const [deleteConfirm, setDeleteConfirm] = useState<
    { type: "single"; messageId: number } | { type: "bulk"; messageIds: number[] } | null
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
        const u = allUsers.get(uid);
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
          senderId: message.sender_id,
          senderName: message.sender_full_name,
          content: normalizeAiContextContent(message.content),
          timestamp: message.timestamp,
          isOwn: currentUserId != null && message.sender_id === currentUserId,
        }))
        .filter((message) => message.content.length > 0),
    [messages, currentUserId],
  );
  const lastOwnMessageForEdit = useMemo(
    () => resolveLastOwnMessageForEdit(messages, currentUserId),
    [messages, currentUserId],
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
  const activeDraftIdRef = useRef<number | null>(null);
  const pendingForwardPrefillRef = useRef<string | null>(null);

  const draftType: DraftType | null = resolveDraftType(isDmView, activeStream);
  const draftTo: number[] = useMemo(() => {
    const ctx = useCurrentChatMessagesStore.getState().context;
    return resolveDraftTargetIds({
      isDmView,
      activeDmUserIds,
      activeStreamId: resolvedStreamId,
      fallbackStreamId: ctx?.type === "stream" ? ctx.streamId : null,
    });
  }, [isDmView, activeDmUserIds, resolvedStreamId]);
  const draftTopic = activeTopic ?? "";

  useEffect(() => {
    // On route change close edit session and invalidate in-flight markdown loads.
    editRequestTokenRef.current += 1;
    setComposerEditSession(null);
  }, [location.pathname]);

  useChatPageDraftHydration({
    draftType,
    draftTo,
    draftTopic,
    drafts,
    composerValueRef,
    activeDraftIdRef,
    pendingForwardPrefillRef,
    setDraftInitialValue,
  });

  useEffect(() => {
    return () => {
      const val = composerValueRef.current.trim();
      const draftStore = useDraftStore.getState();
      const existingDraft =
        draftType && draftTo.length > 0
          ? draftStore.getDraftForChat(draftType, draftTo, draftTopic)
          : undefined;
      const existingId = existingDraft?.id ?? activeDraftIdRef.current;

      if (!val) {
        if (draftType && draftTo.length > 0 && (existingDraft != null || existingId != null)) {
          void syncExistingDraftDeleteOnCleanup({
            draft: existingDraft,
            existingId,
            draftType,
            draftTo,
            draftTopic,
            deleteDraftOnServer,
            removeDraftForChat: draftStore.removeDraftForChat,
            restoreDraft: draftStore.setLocalDraft,
            setActiveDraftId: (id) => {
              activeDraftIdRef.current = id;
            },
          }).then((deleted) => {
            if (!deleted && existingId != null) {
              log.error("Failed to delete draft during cleanup", { draftId: existingId });
            }
          });
        }
        return;
      }

      if (!draftType || draftTo.length === 0) return;

      if (existingId != null) {
        void syncExistingDraftUpdateOnCleanup({
          draft: existingDraft,
          existingId,
          draftType,
          draftTo,
          draftTopic,
          nextContent: val,
          updateDraft: draftStore.updateDraft,
          restoreDraft: draftStore.setLocalDraft,
          updateDraftOnServer,
        }).then((updated) => {
          if (!updated) {
            log.error("Failed to update draft during cleanup", { draftId: existingId });
          }
        });
      } else {
        draftStore.setLocalDraft({
          id: null,
          type: draftType,
          to: draftTo,
          topic: draftTopic,
          content: val,
          timestamp: Math.floor(Date.now() / 1000),
        });
        createDraft({ type: draftType, to: draftTo, topic: draftTopic, content: val })
          .then((serverId) => {
            if (serverId == null) return;
            activeDraftIdRef.current = serverId;
            const draftStoreState = useDraftStore.getState();
            void reconcileCreatedDraftServerId({
              serverId,
              draftType,
              draftTo,
              draftTopic,
              getDraftForChat: draftStoreState.getDraftForChat,
              linkDraftToServerId: draftStoreState.linkDraftToServerId,
              deleteDraftOnServer,
            });
          })
          .catch((err) =>
            reportUnexpectedError("chat:draftSync", err, { phase: "linkDraftToServerId" }),
          );
      }
    };
  }, [draftType, draftTo, draftTopic]);

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
    messages,
    currentUserId,
    isDmView,
    activeDmUserIds,
    activeStreamId,
    activeTopic,
    streamSlug,
    topicName,
    dmIdParam,
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
    const currentStream = streams.find((stream) => stream.stream_id === activeStreamId);
    if (!currentStream) return;
    const route = resolveNextUnreadTopicRoute({
      streamId: currentStream.stream_id,
      streamName: currentStream.name,
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

      const draftStore = useDraftStore.getState();
      const existingDraft =
        draftType && draftTo.length > 0
          ? draftStore.getDraftForChat(draftType, draftTo, draftTopic)
          : undefined;
      const existingId = existingDraft?.id ?? activeDraftIdRef.current;
      if (draftType && draftTo.length > 0 && (existingDraft != null || existingId != null)) {
        void syncExistingDraftDeleteOnClear({
          draft: existingDraft,
          existingId,
          draftType,
          draftTo,
          draftTopic,
          deleteDraftOnServer,
          removeDraftForChat: draftStore.removeDraftForChat,
          restoreDraft: draftStore.setLocalDraft,
          setActiveDraftId: (id) => {
            activeDraftIdRef.current = id;
          },
          shouldRestoreDraft: () => composerValueRef.current.trim() === "",
        }).then((deleted) => {
          if (!deleted && existingId != null && composerValueRef.current.trim() === "") {
            log.error("Failed to delete draft after composer clear", { draftId: existingId });
          }
        });
      }
    },
    [onComposerValueChangeTyping, draftType, draftTo, draftTopic, composerEditSession],
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
    (targetUserId: number) => {
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
    focusedMessageId,
    currentUserId,
    isFocusedMessageLoadedInCurrentRoute,
    setActionError,
  });

  const handleDismissBoundaryLoadFailed = useCallback(() => {
    clearBoundaryLoadFailed();
  }, [clearBoundaryLoadFailed]);

  const { canStartCall, buildCurrentCallLink, handleCallClick } = useChatPageCall({
    isDmView,
    isGroupDmView,
    isOneToOneDm,
    partnerDeactivated,
    partnerUserId,
    partnerUserFullName: partnerUser?.full_name,
    activeDmUserIds,
    activeStream: activeStream ?? null,
    activeStreamId,
    activeTopic: activeTopic ?? null,
    dmChatName: dmChat?.name,
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
      activeTopic,
      appendMessage: appendMessageToStore,
      commitOutgoingMessage: commitOutgoingMessageToStore,
      removeMessage: removeMessageFromStore,
      requestScrollToBottom: requestScrollToBottomAfterSend,
      clearReplyQuote: () => setReplyQuote(null),
      stopTyping: stopTypingNow,
      setSendError,
      setUploadProgress,
    });

  const { onMessageAddReaction, onMessageRemoveReaction } = useChatPageReaction({
    currentUserId,
    setActionError,
    updateMessageReactionInStore,
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
      if (message.id <= 0) return;
      // Token prevents edit race — apply only the latest request result.
      const requestToken = editRequestTokenRef.current + 1;
      editRequestTokenRef.current = requestToken;
      setActionError(null);
      void resolveEditableMessageMarkdown(message).then((initialMarkdown) => {
        if (editRequestTokenRef.current !== requestToken) return;
        setComposerEditSession({ messageId: message.id, initialMarkdown });
      });
    },
    [resolveEditableMessageMarkdown],
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
  });

  const handleSubmitComposerEdit = useCallback(
    async (messageId: number, markdown: string) => {
      setActionError(null);
      try {
        // Persist to server and sync local store immediately.
        await updateMessage(messageId, { content: markdown });
        const fresh = await fetchMessageById(messageId);
        if (fresh) {
          updateMessageContentInStore(fresh.id, fresh.content, fresh.markdown_source);
        }
        setComposerEditSession(null);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t("message.saveError"));
        throw err;
      }
    },
    [updateMessageContentInStore, t],
  );

  const handleEditLastMessage = useCallback(() => {
    if (lastOwnMessageForEdit == null) return;
    requestMessageEdit(lastOwnMessageForEdit);
  }, [lastOwnMessageForEdit, requestMessageEdit]);

  const handleForwardTo = useCallback(
    (stream: string, topic: string, to?: number[]) => {
      if (forwardMessages.length === 0) return;
      setSendError(null);
      const quoted = buildForwardQuote(forwardMessages, forwardSelectedText, {
        realmBaseUrl,
        wroteLabel: t("message.replyQuoteWrote"),
        resolveStreamName: (streamId, message) =>
          streams.find((candidate) => candidate.stream_id === streamId)?.name ??
          message.channel ??
          (typeof message.display_recipient === "string" ? message.display_recipient : undefined),
      });
      const target = resolveForwardDraftTarget(stream, topic, to, streams);
      if (target == null) {
        setSendError(t("message.forwardError"));
        return;
      }

      const draftStore = useDraftStore.getState();
      const existingTargetDraft = draftStore.getDraftForChat(
        target.draftType,
        target.draftTo,
        target.draftTopic,
      );
      const mergedForwardContent = mergeForwardDraftContent(quoted, existingTargetDraft?.content);
      draftStore.setLocalDraft({
        id: existingTargetDraft?.id ?? null,
        type: target.draftType,
        to: target.draftTo,
        topic: target.draftTopic,
        content: mergedForwardContent,
        timestamp: Math.floor(Date.now() / 1000),
      });

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
    typingChatKey ? s.getTypingUsers(typingChatKey) : [],
  );
  const dmPartnerIsTyping = useMemo(
    () =>
      isOneToOneDm &&
      partnerUserId != null &&
      typingUsers.some((typingUser) => typingUser.userId === partnerUserId),
    [isOneToOneDm, partnerUserId, typingUsers],
  );

  const typingText = useMemo(() => {
    if (typingUsers.length === 0) return null;
    const names = typingUsers
      .filter((tu) => tu.userId !== currentUserId)
      .map((tu) => useUsersStore.getState().getDisplayName(tu.userId))
      .filter((n) => n !== "Unknown");
    if (names.length === 0) return null;
    if (names.length === 1) return t("chat.typingUser", { name: names[0]! });
    return t("chat.typingUsers", { names: names.join(", ") });
  }, [typingUsers, currentUserId]);

  const deletableSelectedMessageIds = useMemo(
    () =>
      messages
        .filter((m) => selectedMessageIds.has(m.id) && m.sender_id === currentUserId)
        .map((m) => m.id),
    [messages, selectedMessageIds, currentUserId],
  );

  const forwardableSelectedMessages = useMemo(
    () => messages.filter((m) => selectedMessageIds.has(m.id)),
    [messages, selectedMessageIds],
  );

  const dmPartner = useMemo(() => {
    if (!isDmView || isGroupDmView || partnerUserId == null) return undefined;
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
      isAccountDeactivated: partnerDeactivated,
      isTyping: dmPartnerIsTyping,
    };
  }, [
    isDmView,
    isGroupDmView,
    partnerUserId,
    partnerUser,
    dmPartnerIsTyping,
    partnerDeactivated,
    dmChat?.name,
    partnerStoreDisplayName,
  ]);

  const dmGroup = useMemo(() => {
    if (!isGroupDmView || !dmChat) return undefined;
    const participantIds = resolveDmGroupParticipantIds({
      dmUserIds: dmChat.userIds,
      currentUserId,
      dmRecipientIds,
    });
    const rawName = dmChat.name?.trim() ?? "";
    const resolvedName =
      rawName.length === 0 || rawName === t("dm.privateChat") ? t("dm.groupChat") : rawName;
    return {
      name: resolvedName,
      participantsCount: participantIds.length,
    };
  }, [isGroupDmView, dmChat, currentUserId, dmRecipientIds]);

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
        topic={activeTopic}
        hideTopic={activeTopic == null || activeTopic.trim() === ""}
        participantsCount={chatInfo?.memberCount ?? 0}
        onlineCount={chatInfo?.onlineCount ?? 0}
        onOpenSearch={openSearch ?? undefined}
        onToggleRightPanel={rightDrawer ? handleToggleRightPanel : undefined}
        onOpenRightPanel={rightDrawer ? handleOpenRightPanel : undefined}
        rightPanelOpen={rightDrawer?.open ?? false}
        rightPanelLabel={resolveChatHeaderRightPanelLabel(isGroupDmView, isDmView)}
        hideParticipants={isDmView}
        onCallClick={canStartCall ? handleCallClick : undefined}
        dmPartner={dmPartner}
        dmGroup={dmGroup}
        onDmPartnerClick={handleOpenDmPartnerProfile}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatPageMessageListSection
          messagesLoading={messagesLoading}
          hasInitialPayload={hasInitialMessagesPayload}
          isDmView={isDmView}
          activeDmUserIds={activeDmUserIds}
          activeStream={activeStream}
          activeTopic={activeTopic}
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
          scrollToBottomAfterSendNonce={scrollToBottomAfterSendNonce}
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
        <ChatPageInlineAlerts actionError={actionError} sendError={sendError} />
        <ChatPageFloatingToast message={toastMessage} />
        <ChatPageTypingLine
          text={typingText}
          visible={Boolean(typingText && !(isOneToOneDm && dmPartnerIsTyping))}
        />
        <ChatPageComposerSection
          isDmView={isDmView}
          activeDmUserIds={activeDmUserIds}
          dmPartnerDeactivated={partnerDeactivated}
          activeStream={activeStream}
          showTopicPrompt={!isDmView && !activeTopic}
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
