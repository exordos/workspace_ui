import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { resolveHydratedDraftBootstrap } from "~/entities/draft/draft-chat-bootstrap.lib";
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
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext } from "~/entities/message/message-chat-context.lib";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
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
import {
  fetchMessageById,
  getRealmBaseUrl,
  sendMessage,
  markMessagesAsRead,
  updateMessage,
  deleteMessage,
  markDmAsRead,
  markTopicAsRead,
  uploadFile,
  type MockMessage,
} from "~/shared/api/zulip";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import { getPresenceState, formatLastSeen } from "~/shared/lib/format";
import { buildJitsiMeetingUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { createLogger } from "~/shared/lib/logger";
import { logMessageFlow, summarizeChatContextForLog } from "~/shared/lib/message-flow-debug.lib";
import { isLikelyRenderedMessageHtml } from "~/shared/lib/message-markdown-display.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { useShortcut } from "~/shared/lib/shortcuts";
import { resolveCanonicalStreamName } from "~/shared/lib/stream-name.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { useSidebarConfigStore } from "~/widgets/sidebar/sidebar-config.model";
import { parseDmSlugToUserIds } from "~/widgets/sidebar/sidebar.lib";
import { isFocusedMessageLoadedInRoute } from "./chat-anchor-load.lib";
import { startCallFromHeader } from "./chat-call-start.lib";
import {
  buildCallRoomName,
  canStartCallFromHeader,
  resolveCallMessageTargetParams,
} from "./chat-call.lib";
import { resolveLastOwnMessageForEdit } from "./chat-edit-last-message.lib";
import { countUnreadMessages, resolveFirstUnreadBoundaryMessageId } from "./chat-first-unread.lib";
import {
  buildForwardQuote,
  consumePendingForwardPrefill,
  mergeForwardDraftContent,
  resolveForwardDraftTarget,
  setPendingForwardPrefill,
} from "./chat-forward.lib";
import {
  collectUnreadMessageIds,
  filterMessageIdsStillUnreadForOptimisticApply,
  resolveMarkAllAsReadTarget,
} from "./chat-mark-all-read.lib";
import { createMarkAsReadBatcher } from "./chat-mark-as-read.lib";
import { useChatMessageListCallbacks } from "./chat-message-list-callbacks.hook";
import { resolveNextUnreadTopicRoute } from "./chat-next-unread-topic.lib";
import { isAbortLikeError, normalizeAiContextContent } from "./chat-page-ai.lib";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";
import { ChatPageFloatingToast } from "./chat-page-floating-toast.ui";
import { useChatForwardHydration } from "./chat-page-forward-hydration.hook";
import { ForwardMessageModalBody } from "./chat-page-forward-modal.ui";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";
import { ChatPageMessageListSection } from "./chat-page-message-list-section.ui";
import { useChatPartnerProfileHydration } from "./chat-page-partner-profile.hook";
import { ChatPageReadReceiptsDialog } from "./chat-page-read-receipts-dialog.ui";
import { useChatRouteContext } from "./chat-page-route-context.hook";
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";
import { useChatToastAutoClear } from "./chat-page-toast.hook";
import { ChatPageTypingLine } from "./chat-page-typing-line.ui";
import { shouldLoadBoundaryPage } from "./chat-pagination.lib";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
} from "./chat-send-delivery.lib";
import { uploadComposerFiles, type ComposerUploadProgressState } from "./chat-upload.lib";

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
  const realmBaseUrl = getRealmBaseUrl();
  const firstUnreadId = useMemo(
    () => resolveFirstUnreadBoundaryMessageId(messages, currentUserId),
    [messages, currentUserId],
  );
  const unreadCount = useMemo(
    () => countUnreadMessages(messages, currentUserId),
    [messages, currentUserId],
  );
  const setContext = useCurrentChatMessagesStore((s) => s.setContext);
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
  const loadInitialMessagesForContext = useCurrentChatMessagesStore(
    (s) => s.loadInitialMessagesForContext,
  );
  const loadOlderBoundaryPage = useCurrentChatMessagesStore((s) => s.loadOlderBoundaryPage);
  const loadNewerBoundaryPage = useCurrentChatMessagesStore((s) => s.loadNewerBoundaryPage);
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
  const [messagesLoading, setMessagesLoading] = useState(false);
  // Что делает: отделяет "данные уже есть" от "network refresh всё ещё идёт".
  // Зачем: показывать blocking-loader только на реальном cold-start/cold-switch.
  const [hasInitialMessagesPayload, setHasInitialMessagesPayload] = useState(false);
  const [messagesLoadError, setMessagesLoadError] = useState<"initial" | "refresh" | null>(null);
  const [messagesReloadNonce, setMessagesReloadNonce] = useState(0);
  const cacheHydratedBeforeApiRef = useRef(false);
  const markAsReadBatcherRef = useRef<ReturnType<typeof createMarkAsReadBatcher> | null>(null);
  const optimisticMessageIdRef = useRef(-1);
  const jitsiHeaderCallInFlightRef = useRef(false);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
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

  const draftType: DraftType | null = isDmView ? "private" : activeStream ? "stream" : null;
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
    // При смене маршрута закрываем edit-сессию и инвалидируем незавершённые загрузки markdown.
    editRequestTokenRef.current += 1;
    setComposerEditSession(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!draftType || draftTo.length === 0) return;
    const pendingForwardPrefill = consumePendingForwardPrefill(location.pathname);
    if (pendingForwardPrefill != null) {
      pendingForwardPrefillRef.current = pendingForwardPrefill;
      setDraftInitialValue(pendingForwardPrefill);
      composerValueRef.current = pendingForwardPrefill;
      activeDraftIdRef.current = null;
      return;
    }

    const existing = useDraftStore.getState().getDraftForChat(draftType, draftTo, draftTopic);
    if (existing) {
      setDraftInitialValue(existing.content);
      composerValueRef.current = existing.content;
      activeDraftIdRef.current = existing.id;
    } else {
      setDraftInitialValue("");
      composerValueRef.current = "";
      activeDraftIdRef.current = null;
    }
  }, [draftType, draftTo, draftTopic, location.pathname]);

  useEffect(() => {
    if (!draftType || draftTo.length === 0) return;
    if (pendingForwardPrefillRef.current != null) {
      pendingForwardPrefillRef.current = null;
      return;
    }
    const existing = useDraftStore.getState().getDraftForChat(draftType, draftTo, draftTopic);
    const bootstrap = resolveHydratedDraftBootstrap(composerValueRef.current, existing);
    if (!bootstrap) return;
    setDraftInitialValue(bootstrap.initialValue);
    composerValueRef.current = bootstrap.initialValue;
    activeDraftIdRef.current = bootstrap.activeDraftId;
  }, [draftType, draftTo, draftTopic, drafts]);

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
          .catch(() => {});
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

  type ReadFallbackContext =
    | { type: "stream"; streamId: number; topic: string }
    | { type: "dm"; dmKey: string };

  const applyReadMessagesOptimistically = useCallback(
    (messageIds: number[], fallbackContext?: ReadFallbackContext) => {
      if (messageIds.length === 0) return;

      const storeMessages = useCurrentChatMessagesStore.getState().messages;
      const effectiveMessages = messages;
      const unreadMessageIds = filterMessageIdsStillUnreadForOptimisticApply(messageIds, {
        storeMessages,
        effectiveMessages,
      });
      if (unreadMessageIds.length === 0) {
        const missingFromBothLists = messageIds.filter(
          (id) =>
            !storeMessages.some((m) => m.id === id) && !effectiveMessages.some((m) => m.id === id),
        );
        if (missingFromBothLists.length > 0) {
          log.warn("markAsRead optimistic: ids missing from store and effective message lists", {
            missingCount: missingFromBothLists.length,
            requestedCount: messageIds.length,
          });
        }
        return;
      }

      updateMessageFlagsInStore(unreadMessageIds, "read", "add");

      const chatListState = useChatListStore.getState();
      const locationIndex = chatListState.messageIdToLocation;
      let knownIdsCount = 0;
      for (const messageId of unreadMessageIds) {
        if (locationIndex.has(messageId)) {
          knownIdsCount += 1;
        }
      }

      chatListState.decrementUnreadForMessages(unreadMessageIds);

      const missingIdsCount = unreadMessageIds.length - knownIdsCount;
      if (missingIdsCount <= 0) return;

      const context = fallbackContext ?? useCurrentChatMessagesStore.getState().context;
      if (context?.type === "stream") {
        chatListState.decrementUnreadForTopic(context.streamId, context.topic, missingIdsCount);
      } else if (context?.type === "dm") {
        chatListState.decrementUnreadForDmKey(context.dmKey, missingIdsCount);
      }
    },
    [messages, updateMessageFlagsInStore],
  );

  const handleUnreadMessagesVisible = useCallback(
    (messageIds: number[]) => {
      if (!isDmView && activeTopic == null) return;
      markAsReadBatcherRef.current?.schedule(messageIds);
    },
    [isDmView, activeTopic],
  );

  const handleUnreadMessagesAtBottom = useCallback(
    (messageIds: number[]) => {
      if (!isDmView && activeTopic == null) return;
      markAsReadBatcherRef.current?.schedule(messageIds);
    },
    [isDmView, activeTopic],
  );

  useEffect(() => {
    const batchFallbackContext: ReadFallbackContext | undefined = isDmView
      ? activeDmUserIds != null && activeDmUserIds.length > 0
        ? { type: "dm", dmKey: dmRouteKey(activeDmUserIds, currentUserId) }
        : undefined
      : activeStreamId != null
        ? { type: "stream", streamId: activeStreamId, topic: activeTopic ?? "" }
        : undefined;

    const batcher = createMarkAsReadBatcher({
      debounceMs: 250,
      markAsRead: markMessagesAsRead,
      onMarked: (messageIds) => {
        applyReadMessagesOptimistically(messageIds, batchFallbackContext);
      },
    });
    markAsReadBatcherRef.current = batcher;
    return () => {
      batcher.cancel();
      if (markAsReadBatcherRef.current === batcher) {
        markAsReadBatcherRef.current = null;
      }
    };
  }, [
    streamSlug,
    topicName,
    dmIdParam,
    isDmView,
    activeDmUserIds,
    currentUserId,
    activeStreamId,
    activeTopic,
    applyReadMessagesOptimistically,
  ]);

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

  const handleMarkAllAsRead = useCallback(() => {
    const target = resolveMarkAllAsReadTarget({
      isDmView,
      activeDmUserIds,
      activeStreamId,
      activeTopic,
    });
    if (!target) return;

    const unreadIds = collectUnreadMessageIds(messages);
    const request =
      target.type === "dm"
        ? markDmAsRead(target.userIds)
        : markTopicAsRead(target.streamId, target.topic);

    const markFallbackContext: ReadFallbackContext | undefined =
      target.type === "dm"
        ? { type: "dm", dmKey: dmRouteKey(target.userIds, currentUserId) }
        : { type: "stream", streamId: target.streamId, topic: target.topic };

    request
      .then((ok) => {
        if (ok && unreadIds.length > 0) {
          applyReadMessagesOptimistically(unreadIds, markFallbackContext);
        }
      })
      .catch(() => {});
  }, [
    isDmView,
    activeDmUserIds,
    activeStreamId,
    activeTopic,
    messages,
    currentUserId,
    applyReadMessagesOptimistically,
  ]);

  useShortcut("mod+shift+m", handleMarkAllAsRead, {
    context: "chat",
    enabled: isDmView
      ? (activeDmUserIds?.length ?? 0) > 0
      : activeStreamId != null && activeTopic != null,
  });

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

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
      uploadAbortControllerRef.current = null;
    };
  }, []);

  const handleExpandCurrentStreamTopics = useCallback(() => {
    if (!streamSlug) return;
    // Используется кнопкой "выбрать топик" в композере:
    // раскрывает текущий stream в sidebar без дублирования slug в store.
    expandStreamSlug(streamSlug);
  }, [expandStreamSlug, streamSlug]);

  useChatToastAutoClear({
    toastMessage,
    clearToast: () => setToastMessage(null),
    timeoutMs: 2000,
  });

  // Синхронизируем stream-контекст с маршрутом без загрузки сообщений.
  useEffect(() => {
    if (!streamSlug) {
      if (!dmIdParam || dmIdParam === "") {
        logMessageFlow("ui:stream route effect → setContext(null)", { reason: "no stream slug" });
        setContext(null);
      }
      return;
    }
    if (!activeStreamCanonicalName || resolvedStreamId == null) {
      logMessageFlow("ui:stream route effect → setContext(null)", {
        reason: "stream name/id not resolved",
      });
      setContext(null);
      return;
    }
    const streamWideView = topicName == null;
    logMessageFlow("ui:stream route effect → setContext(stream)", {
      streamId: resolvedStreamId,
      topic: streamRouteTopic,
      streamWideView,
    });
    setContext({
      type: "stream",
      streamId: resolvedStreamId,
      streamName: activeStreamCanonicalName,
      topic: streamRouteTopic,
      streamWideView,
    });
  }, [
    dmIdParam,
    streamSlug,
    setContext,
    resolvedStreamId,
    activeStreamCanonicalName,
    streamRouteTopic,
    topicName,
  ]);

  // Загружаем стартовую порцию stream-сообщений только по параметрам маршрута и фокусу.
  useEffect(() => {
    if (!streamSlug) {
      setHasInitialMessagesPayload(false);
      setMessagesLoading(false);
      return;
    }
    if (!activeStreamCanonicalName) {
      setHasInitialMessagesPayload(false);
      setMessagesLoading(false);
      return;
    }
    if (resolvedStreamId == null) {
      setHasInitialMessagesPayload(false);
      setMessagesLoading(false);
      return;
    }
    if (focusedMessageId != null && isFocusedMessageLoadedInCurrentRoute) {
      setHasInitialMessagesPayload(true);
      setMessagesLoading(false);
      return;
    }

    // Что делает: каждый route-switch стартует с чистого признака initial payload.
    // Далее он поднимется через onCacheHydrated или после успешного API.
    cacheHydratedBeforeApiRef.current = false;
    setMessagesLoadError(null);
    setHasInitialMessagesPayload(false);
    if (focusedMessageId != null) {
      setActionError(null);
    }
    setMessagesLoading(true);
    const initialLoadController = new AbortController();
    logMessageFlow("ui:stream loadInitial effect → invoke store.loadInitialMessagesForContext", {
      streamId: resolvedStreamId,
      topic: streamRouteTopic,
      focusedMessageId,
    });
    loadInitialMessagesForContext({
      context: {
        type: "stream",
        streamId: resolvedStreamId,
        streamName: activeStreamCanonicalName,
        topic: streamRouteTopic,
        streamWideView: topicName == null,
      },
      focusedMessageId,
      currentUserId,
      signal: initialLoadController.signal,
      // Что делает: фиксирует момент cache-first гидрации для UI-флагов.
      onCacheHydrated: () => {
        if (!initialLoadController.signal.aborted) {
          cacheHydratedBeforeApiRef.current = true;
          setHasInitialMessagesPayload(true);
        }
      },
    })
      .then(() => {
        if (!initialLoadController.signal.aborted) {
          logMessageFlow("ui:stream loadInitial effect → fulfilled", { cancelled: false });
          setMessagesLoadError(null);
          setHasInitialMessagesPayload(true);
          if (
            focusedMessageId != null &&
            useCurrentChatMessagesStore.getState().messages.length === 0
          ) {
            setActionError(t("message.anchorAccessDenied"));
          }
          setMessagesLoading(false);
        } else {
          logMessageFlow("ui:stream loadInitial effect → fulfilled (ignored, unmounted)", {
            cancelled: true,
          });
        }
      })
      .catch((e) => {
        if (isAbortLikeError(e) || initialLoadController.signal.aborted) {
          return;
        }
        logMessageFlow("ui:stream loadInitial rejected", { error: String(e) });
        if (focusedMessageId != null) {
          setActionError(t("message.anchorAccessDenied"));
        }
        const hadCachedMessages = useCurrentChatMessagesStore.getState().messages.length > 0;
        setMessagesLoadError(
          cacheHydratedBeforeApiRef.current && hadCachedMessages ? "refresh" : "initial",
        );
        setMessagesLoading(false);
      });
    return () => {
      initialLoadController.abort();
    };
  }, [
    streamSlug,
    activeStreamCanonicalName,
    resolvedStreamId,
    streamRouteTopic,
    topicName,
    focusedMessageId,
    currentUserId,
    loadInitialMessagesForContext,
    isFocusedMessageLoadedInCurrentRoute,
    messagesReloadNonce,
    setActionError,
    t,
  ]);

  // Синхронизируем контекст активного DM с маршрутом и текущим пользователем.
  useEffect(() => {
    if (!dmIdParam || dmIdParam === "") {
      if (!streamSlug) {
        logMessageFlow("ui:dm route effect → setContext(null)", { reason: "empty dm param" });
        setContext(null);
      }
      return;
    }
    if (currentUserId == null) return;

    const routeUserIds = parseDmSlugToUserIds(dmIdParam);
    const userIds = normalizeDmRouteUserIds(routeUserIds, currentUserId);
    if (userIds.length === 0) return;

    const dmKey = dmRouteKey(userIds, currentUserId);
    logMessageFlow("ui:dm route effect → setContext(dm)", { dmKey });
    setContext({ type: "dm", dmKey });
  }, [dmIdParam, streamSlug, currentUserId, setContext]);

  // Загружаем сообщения DM при изменении маршрута или фокуса на сообщении.
  useEffect(() => {
    if (!dmIdParam || dmIdParam === "") return;

    const routeUserIds = parseDmSlugToUserIds(dmIdParam);
    const userIds = Array.from(new Set(routeUserIds)).filter(
      (userId) => Number.isSafeInteger(userId) && userId > 0,
    );
    if (userIds.length === 0) return;
    if (focusedMessageId != null && isFocusedMessageLoadedInCurrentRoute) {
      setHasInitialMessagesPayload(true);
      setMessagesLoading(false);
      return;
    }

    // Что делает: для нового DM-роута заново ожидаем initial payload.
    cacheHydratedBeforeApiRef.current = false;
    setMessagesLoadError(null);
    setHasInitialMessagesPayload(false);
    if (focusedMessageId != null) {
      setActionError(null);
    }
    setMessagesLoading(true);
    const initialLoadController = new AbortController();
    const dmKey = dmRouteKey(userIds, currentUserId);
    logMessageFlow("ui:dm loadInitial effect → invoke store.loadInitialMessagesForContext", {
      dmKey,
      focusedMessageId,
    });
    loadInitialMessagesForContext({
      context: { type: "dm", dmKey },
      focusedMessageId,
      currentUserId,
      signal: initialLoadController.signal,
      // Что делает: фиксирует момент cache-first гидрации для UI-флагов.
      onCacheHydrated: () => {
        if (!initialLoadController.signal.aborted) {
          cacheHydratedBeforeApiRef.current = true;
          setHasInitialMessagesPayload(true);
        }
      },
    })
      .then(() => {
        if (!initialLoadController.signal.aborted) {
          logMessageFlow("ui:dm loadInitial effect → fulfilled", { cancelled: false });
          setMessagesLoadError(null);
          setHasInitialMessagesPayload(true);
          if (
            focusedMessageId != null &&
            useCurrentChatMessagesStore.getState().messages.length === 0
          ) {
            setActionError(t("message.anchorAccessDenied"));
          }
          setMessagesLoading(false);
        } else {
          logMessageFlow("ui:dm loadInitial effect → fulfilled (ignored, unmounted)", {
            cancelled: true,
          });
        }
      })
      .catch((e) => {
        if (isAbortLikeError(e) || initialLoadController.signal.aborted) {
          return;
        }
        logMessageFlow("ui:dm loadInitial rejected", { error: String(e) });
        if (focusedMessageId != null) {
          setActionError(t("message.anchorAccessDenied"));
        }
        const hadCachedMessages = useCurrentChatMessagesStore.getState().messages.length > 0;
        setMessagesLoadError(
          cacheHydratedBeforeApiRef.current && hadCachedMessages ? "refresh" : "initial",
        );
        setMessagesLoading(false);
      });
    return () => {
      initialLoadController.abort();
    };
  }, [
    dmIdParam,
    focusedMessageId,
    currentUserId,
    loadInitialMessagesForContext,
    isFocusedMessageLoadedInCurrentRoute,
    messagesReloadNonce,
    setActionError,
    t,
  ]);

  const PAGE_SIZE = 50;

  const loadOlderMessages = useCallback(() => {
    const store = useCurrentChatMessagesStore.getState();
    const messagesLength = store.messages.length;
    const gate = {
      isLoadingMore: store.isLoadingMore,
      hasBoundaryMessages: store.hasOlderMessages,
      messagesLength,
    };
    if (!shouldLoadBoundaryPage(gate)) {
      logMessageFlow("ui:loadOlder skipped", {
        ...gate,
        context: summarizeChatContextForLog(store.context),
      });
      return;
    }
    logMessageFlow("ui:loadOlder invoke", {
      pageSize: PAGE_SIZE,
      messagesLength,
      context: summarizeChatContextForLog(store.context),
      storeHasOlderMessages: store.hasOlderMessages,
      storeMessageCount: store.messages.length,
      storeFirstId: store.messages[0]?.id,
      storeLastId: store.messages[store.messages.length - 1]?.id,
    });
    void loadOlderBoundaryPage({ pageSize: PAGE_SIZE, currentUserId });
  }, [PAGE_SIZE, currentUserId, loadOlderBoundaryPage]);

  const loadNewerMessages = useCallback(() => {
    const store = useCurrentChatMessagesStore.getState();
    const messagesLength = store.messages.length;
    const gate = {
      isLoadingMore: store.isLoadingMore,
      hasBoundaryMessages: store.hasNewerMessages,
      messagesLength,
    };
    if (!shouldLoadBoundaryPage(gate)) {
      logMessageFlow("ui:loadNewer skipped", {
        ...gate,
        context: summarizeChatContextForLog(store.context),
      });
      return;
    }
    logMessageFlow("ui:loadNewer invoke", {
      pageSize: PAGE_SIZE,
      messagesLength,
      context: summarizeChatContextForLog(store.context),
      storeFirstId: store.messages[0]?.id,
      storeLastId: store.messages[store.messages.length - 1]?.id,
    });
    void loadNewerBoundaryPage({ pageSize: PAGE_SIZE, currentUserId });
  }, [PAGE_SIZE, currentUserId, loadNewerBoundaryPage]);

  const handleRetryMessagesLoad = useCallback(() => {
    setMessagesReloadNonce((n) => n + 1);
  }, []);

  const handleDismissBoundaryLoadFailed = useCallback(() => {
    clearBoundaryLoadFailed();
  }, [clearBoundaryLoadFailed]);

  const callTarget = useMemo(
    () =>
      resolveCallMessageTargetParams({
        isDmView,
        activeDmUserIds,
        activeStream: activeStream ?? null,
        activeStreamId,
        activeTopic: activeTopic ?? null,
      }),
    [isDmView, activeDmUserIds, activeStream, activeStreamId, activeTopic],
  );

  const canStartCall = useMemo(
    () =>
      canStartCallFromHeader({
        target: callTarget,
        currentUserId,
      }),
    [callTarget, currentUserId],
  );

  const callRoomChatLabel = useMemo(() => {
    if (callTarget?.mode !== "dm") {
      return null;
    }

    if (isGroupDmView) {
      const trimmedGroupName = dmChat?.name?.trim();
      return trimmedGroupName != null && trimmedGroupName.length > 0
        ? trimmedGroupName
        : t("dm.groupChat");
    }

    const trimmedPartnerName = partnerUser?.full_name?.trim();
    return trimmedPartnerName != null && trimmedPartnerName.length > 0
      ? trimmedPartnerName
      : t("dm.partner");
  }, [callTarget, isGroupDmView, dmChat, partnerUser, t]);
  const isOneToOneDm = isDmView && !isGroupDmView;

  const jitsiMeetBaseUrl = useInstancesStore((s) => s.jitsiMeetBaseUrl);
  const jitsiLinkOptions = useMemo<JitsiLinkOptions>(
    () => ({ serverBaseUrl: jitsiMeetBaseUrl }),
    [jitsiMeetBaseUrl],
  );

  const buildCurrentCallLink = useCallback(() => {
    if (!canStartCallFromHeader({ target: callTarget, currentUserId }) || callTarget == null) {
      return null;
    }
    const roomName = buildCallRoomName({
      target: callTarget,
      currentUserId,
      chatLabel: callRoomChatLabel,
    });
    return buildJitsiMeetingUrl(roomName, jitsiLinkOptions);
  }, [callTarget, currentUserId, callRoomChatLabel, jitsiLinkOptions]);

  const appendMessageIfContextMatches = useCallback(
    (msg: MockMessage) => {
      const state = useCurrentChatMessagesStore.getState();
      if (isMessageForContext(msg, state.context, currentUserId)) {
        state.appendMessage(msg);
      }
    },
    [currentUserId],
  );

  const performStartCallFromHeader = useCallback(async () => {
    if (!canStartCallFromHeader({ target: callTarget, currentUserId }) || callTarget == null)
      return;
    if (jitsiHeaderCallInFlightRef.current) {
      return;
    }
    jitsiHeaderCallInFlightRef.current = true;
    setSendError(null);
    try {
      const result = await startCallFromHeader({
        target: callTarget,
        currentUserId,
        buildCurrentCallLink,
        isOneToOneDm,
        callRoomChatLabel,
        fallbackDmPartnerLabel: t("dm.partner"),
        currentUserLabel: t("common.you"),
        sendMessage,
        appendMessageToStore: appendMessageIfContextMatches,
        openModal: (url, locationName) => {
          openJitsiCall({ meetingUrl: url, locationName });
        },
        resolveErrorMessage: (error) =>
          error instanceof Error ? error.message : t("call.createFailed"),
      });
      if (!result.ok && result.error != null) {
        setSendError(result.error);
      }
    } finally {
      jitsiHeaderCallInFlightRef.current = false;
    }
  }, [
    callTarget,
    currentUserId,
    buildCurrentCallLink,
    t,
    sendMessage,
    appendMessageIfContextMatches,
    openJitsiCall,
    isOneToOneDm,
    callRoomChatLabel,
  ]);

  const handleCallClick = performStartCallFromHeader;

  const invokeDmCallFromProfileHandler = useCallback(
    (targetUserId: number) => {
      if (currentUserId == null || targetUserId === currentUserId) return;
      const inOneToOneWithPartner =
        isDmView && !isGroupDmView && partnerUserId != null && partnerUserId === targetUserId;
      if (inOneToOneWithPartner) {
        void performStartCallFromHeader();
        return;
      }
      useChatDmCallBridgeStore.getState().setPendingDmCallPartnerUserId(targetUserId);
      void navigate(withCurrentOrgRoute(`/dm/${targetUserId}`));
    },
    [currentUserId, isDmView, isGroupDmView, partnerUserId, navigate, performStartCallFromHeader],
  );

  useEffect(() => {
    useChatDmCallBridgeStore
      .getState()
      .setInvokeDmCallFromProfileHandler(invokeDmCallFromProfileHandler);
    return () => {
      useChatDmCallBridgeStore.getState().setInvokeDmCallFromProfileHandler(null);
    };
  }, [invokeDmCallFromProfileHandler]);

  useEffect(() => {
    return () => {
      useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    };
  }, []);

  const pendingDmCallPartnerUserId = useChatDmCallBridgeStore((s) => s.pendingDmCallPartnerUserId);

  useEffect(() => {
    if (pendingDmCallPartnerUserId == null) return;
    if (!isDmView || isGroupDmView) return;
    if (partnerUserId !== pendingDmCallPartnerUserId) return;
    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    void performStartCallFromHeader();
  }, [
    pendingDmCallPartnerUserId,
    isDmView,
    isGroupDmView,
    partnerUserId,
    performStartCallFromHeader,
  ]);

  const handleSend = async (content: string, subjectOverride?: string, files?: File[]) => {
    setSendError(null);
    let body = content;
    setUploadProgress(null);

    if (files && files.length > 0) {
      const uploadController = new AbortController();
      uploadAbortControllerRef.current = uploadController;
      setUploadProgress({
        completed: 0,
        total: files.length,
        activeFileName: files[0]?.name ?? null,
      });
      try {
        const uploadedLinks = await uploadComposerFiles(files, uploadFile, {
          onProgress: setUploadProgress,
          signal: uploadController.signal,
        });
        body = body + "\n" + uploadedLinks.join("\n");
      } catch (err) {
        const wasCancelled = isAbortLikeError(err) || uploadController.signal.aborted;
        const errorMessage = wasCancelled
          ? t("composer.uploadCancelled")
          : err instanceof Error
            ? err.message
            : t("message.sendFailed");
        setSendError(errorMessage);
        setUploadProgress(null);
        throw new Error(errorMessage, { cause: err });
      } finally {
        if (uploadAbortControllerRef.current === uploadController) {
          uploadAbortControllerRef.current = null;
        }
      }
    }

    const stopTypingAfterSend = () => {
      stopTypingNow();
    };

    if (isDmView && activeDmUserIds?.length) {
      const optimisticMessageId = optimisticMessageIdRef.current;
      optimisticMessageIdRef.current -= 1;
      const optimisticMessage = buildOptimisticOutgoingMessage({
        id: optimisticMessageId,
        senderId: currentUserId ?? 0,
        senderFullName: t("common.you"),
        content: body,
        target: { mode: "dm", recipientIds: activeDmUserIds },
      });
      appendMessageToStore(optimisticMessage);
      try {
        const newMsg = await sendMessage({
          to: activeDmUserIds,
          content: body,
          sender_id: currentUserId ?? 0,
          sender_full_name: t("common.you"),
        });
        commitOutgoingMessageToStore(optimisticMessageId, newMsg);
        setReplyQuote(null);
        stopTypingAfterSend();
      } catch (err) {
        appendMessageToStore(markOutgoingMessageFailed(optimisticMessage));
        setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        throw err instanceof Error ? err : new Error(t("message.sendFailed"));
      } finally {
        setUploadProgress(null);
      }
      return;
    }
    if (activeStream) {
      if (!activeStreamCanonicalName) {
        log.warn("Blocked stream send without canonical stream name", {
          streamId: activeStreamId ?? undefined,
          displayName: activeStream,
        });
        const error = t("message.sendFailed");
        setSendError(error);
        setUploadProgress(null);
        throw new Error(error);
      }
      const subject = normalizeTopicForIdentity(subjectOverride ?? activeTopic ?? "");
      const optimisticMessageId = optimisticMessageIdRef.current;
      optimisticMessageIdRef.current -= 1;
      const optimisticMessage = buildOptimisticOutgoingMessage({
        id: optimisticMessageId,
        senderId: currentUserId ?? 0,
        senderFullName: t("common.you"),
        content: body,
        target: {
          mode: "stream",
          stream: activeStreamCanonicalName,
          streamId: activeStreamId ?? undefined,
          subject,
        },
      });
      appendMessageToStore(optimisticMessage);
      try {
        const newMsg = await sendMessage({
          stream: activeStreamCanonicalName,
          streamId: activeStreamId ?? undefined,
          subject,
          content: body,
          sender_id: currentUserId ?? 0,
          sender_full_name: t("common.you"),
        });
        commitOutgoingMessageToStore(optimisticMessageId, newMsg);
        setReplyQuote(null);
        stopTypingAfterSend();
      } catch (err) {
        appendMessageToStore(markOutgoingMessageFailed(optimisticMessage));
        setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        throw err instanceof Error ? err : new Error(t("message.sendFailed"));
      } finally {
        setUploadProgress(null);
      }
    }

    setUploadProgress(null);
  };

  const handleRemoveFailedOutgoing = useCallback(
    (msg: MockMessage) => {
      if (msg.delivery_status !== "failed" || msg.id >= 0) return;
      removeMessageFromStore(msg.id);
      setSendError(null);
    },
    [removeMessageFromStore],
  );

  const handleRetryFailedOutgoing = useCallback(
    async (msg: MockMessage) => {
      if (msg.delivery_status !== "failed" || msg.id >= 0) return;
      setSendError(null);
      const body = msg.content;
      removeMessageFromStore(msg.id);

      const stopTypingAfterSend = () => {
        stopTypingNow();
      };

      if (isDmView && activeDmUserIds?.length) {
        const optimisticMessageId = optimisticMessageIdRef.current;
        optimisticMessageIdRef.current -= 1;
        const optimisticMessage = buildOptimisticOutgoingMessage({
          id: optimisticMessageId,
          senderId: currentUserId ?? 0,
          senderFullName: t("common.you"),
          content: body,
          target: { mode: "dm", recipientIds: activeDmUserIds },
        });
        appendMessageToStore(optimisticMessage);
        try {
          const newMsg = await sendMessage({
            to: activeDmUserIds,
            content: body,
            sender_id: currentUserId ?? 0,
            sender_full_name: t("common.you"),
          });
          commitOutgoingMessageToStore(optimisticMessageId, newMsg);
          setReplyQuote(null);
          stopTypingAfterSend();
        } catch (err) {
          appendMessageToStore(markOutgoingMessageFailed(optimisticMessage));
          setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        } finally {
          setUploadProgress(null);
        }
        return;
      }
      if (activeStream) {
        if (!activeStreamCanonicalName) {
          log.warn("Blocked retry for failed stream message without canonical stream name", {
            streamId: activeStreamId ?? undefined,
            displayName: activeStream,
            failedMessageId: msg.id,
          });
          setSendError(t("message.sendFailed"));
          return;
        }
        const subject = normalizeTopicForIdentity(msg.subject ?? activeTopic ?? "");
        const optimisticMessageId = optimisticMessageIdRef.current;
        optimisticMessageIdRef.current -= 1;
        const optimisticMessage = buildOptimisticOutgoingMessage({
          id: optimisticMessageId,
          senderId: currentUserId ?? 0,
          senderFullName: t("common.you"),
          content: body,
          target: {
            mode: "stream",
            stream: activeStreamCanonicalName,
            streamId: activeStreamId ?? undefined,
            subject,
          },
        });
        appendMessageToStore(optimisticMessage);
        try {
          const newMsg = await sendMessage({
            stream: activeStreamCanonicalName,
            streamId: activeStreamId ?? undefined,
            subject,
            content: body,
            sender_id: currentUserId ?? 0,
            sender_full_name: t("common.you"),
          });
          commitOutgoingMessageToStore(optimisticMessageId, newMsg);
          setReplyQuote(null);
          stopTypingAfterSend();
        } catch (err) {
          appendMessageToStore(markOutgoingMessageFailed(optimisticMessage));
          setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        } finally {
          setUploadProgress(null);
        }
      }
    },
    [
      activeDmUserIds,
      activeStream,
      activeStreamCanonicalName,
      activeStreamId,
      activeTopic,
      appendMessageToStore,
      commitOutgoingMessageToStore,
      currentUserId,
      isDmView,
      removeMessageFromStore,
      stopTypingNow,
      t,
    ],
  );

  const handleCancelUpload = useCallback(() => {
    const controller = uploadAbortControllerRef.current;
    if (controller == null || controller.signal.aborted) return;
    controller.abort();
  }, []);

  const resolveEditableMessageMarkdown = useCallback(
    async (message: MockMessage): Promise<string> => {
      // 1) Берём markdown из уже загруженного сообщения.
      const fromSource = message.markdown_source?.trim();
      if (fromSource != null && fromSource.length > 0) {
        return fromSource;
      }

      // 2) Если контент выглядит как markdown, используем его без дополнительного запроса.
      const body = message.content.trim();
      if (body.length > 0 && !isLikelyRenderedMessageHtml(body)) {
        return body;
      }

      // 3) Fallback: догружаем сообщение с сервера, чтобы получить raw markdown.
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
      // Токен защищает от race: применяем результат только последнего запроса на редактирование.
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
    updateMessageReactionInStore,
    openJitsiCall: (url, locationName) => openJitsiCall({ meetingUrl: url, locationName }),
    setReadReceiptsOpen,
    onRetryFailedOutgoing: handleRetryFailedOutgoing,
    onRemoveFailedOutgoing: handleRemoveFailedOutgoing,
  });

  const handleSubmitComposerEdit = useCallback(
    async (messageId: number, markdown: string) => {
      setActionError(null);
      try {
        // Сохраняем изменения на сервере и сразу синхронизируем локальный store.
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
      isTyping: dmPartnerIsTyping,
    };
  }, [
    isDmView,
    isGroupDmView,
    partnerUserId,
    partnerUser,
    dmPartnerIsTyping,
    dmChat?.name,
    partnerStoreDisplayName,
  ]);

  const dmGroup = useMemo(() => {
    if (!isGroupDmView || !dmChat) return undefined;
    const participantIds =
      dmChat.userIds != null && dmChat.userIds.length > 0
        ? dmChat.userIds
        : currentUserId != null
          ? Array.from(new Set([...dmRecipientIds, currentUserId]))
          : dmRecipientIds;
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
        .then(() => removeMessageFromStore(messageId))
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : t("message.deleteError")),
        );
    } else {
      const ids = deleteConfirm.messageIds;
      Promise.all(ids.map((id) => deleteMessage(id)))
        .then(() => {
          removeMessagesFromStore(ids);
          setSelectedMessageIds(new Set());
          setSelectionMode(false);
        })
        .catch((err) => setActionError(err instanceof Error ? err.message : t("app.error")));
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, removeMessageFromStore, removeMessagesFromStore, t]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      {/* Forward message modal */}
      <Dialog.Root
        open={forwardMessages.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setForwardMessages([]);
            setForwardSelectedText(undefined);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content
            className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal flex max-h-[70vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
            onCloseAutoFocus={(e) => e.preventDefault()}
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
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
        rightPanelOpen={rightDrawer?.open ?? false}
        rightPanelLabel={
          isGroupDmView ? t("dm.groupChat") : isDmView ? t("info.partnerInfo") : undefined
        }
        hideParticipants={isDmView}
        onCallClick={canStartCall ? handleCallClick : undefined}
        dmPartner={dmPartner}
        dmGroup={dmGroup}
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
