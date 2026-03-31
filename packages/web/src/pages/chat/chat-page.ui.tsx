import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  reconcileCreatedDraftServerId,
  syncExistingDraftDeleteOnCleanup,
  syncExistingDraftDeleteOnClear,
  syncExistingDraftUpdateOnCleanup,
} from "~/entities/draft/draft-chat-sync.lib";
import { resolveDraftTargetIds } from "~/entities/draft/draft-chat-target.lib";
import { resolveHydratedDraftBootstrap } from "~/entities/draft/draft-chat-bootstrap.lib";
import { createDraft, deleteDraftOnServer, updateDraftOnServer } from "~/entities/draft/draft.api";
import { useDraftStore } from "~/entities/draft/draft.model";
import type { DraftType } from "~/entities/draft/draft.types";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { JitsiCallModal } from "~/features/jitsi-call/jitsi-call.ui";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { useComposerTypingController } from "~/features/typing-indicator/composer-typing-controller.hook";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { buildDmTypingChatKey, buildStreamTypingChatKey } from "~/features/typing-indicator/typing-key";
import { t } from "~/i18n/i18n";
import {
  fetchMessages,
  fetchMessagesWithNarrow,
  fetchDmMessages,
  fetchMessageById,
  fetchUser,
  sendMessage,
  markMessagesAsRead,
  updateMessage,
  deleteMessage,
  addReaction,
  markDmAsRead,
  removeReaction,
  markStreamAsRead,
  markTopicAsRead,
  uploadFile,
  addMessageFlag,
  removeMessageFlag,
  type MockMessage,
} from "~/shared/api/zulip";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { getPresenceState, formatLastSeen } from "~/shared/lib/format";
import { stripHtml } from "~/shared/lib/html";
import { buildJitsiMeetingUrl } from "~/shared/lib/jitsi";
import { createLogger } from "~/shared/lib/logger";
import { useShortcut } from "~/shared/lib/shortcuts";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { MessageComposer } from "~/widgets/message-composer/message-composer.ui";
import { MessageList, type MessageListCallbacks } from "~/widgets/message-list/message-list.ui";
import {
  getDmById,
  parseStreamSlug,
  parseDmSlugToUserIds,
  slugForStream,
} from "~/widgets/sidebar/sidebar.lib";
import { useSidebarConfigStore } from "~/widgets/sidebar/sidebar-config.model";
import type { StreamWithLast } from "~/widgets/sidebar/sidebar.types";
import {
  buildCallRoomName,
  canStartCallFromHeader,
  resolveCallMessageTargetParams,
} from "./chat-call.lib";
import { useChatForwardHydration } from "./chat-page-forward-hydration.hook";
import { useChatPartnerProfileHydration } from "./chat-page-partner-profile.hook";
import { useChatRouteContext } from "./chat-page-route-context.hook";
import { useChatToastAutoClear } from "./chat-page-toast.hook";
import { normalizeDmRouteUserIds } from "./chat-dm-route.lib";
import { resolveLastOwnMessageForEdit } from "./chat-edit-last-message.lib";
import { countUnreadMessages, resolveFirstUnreadBoundaryMessageId } from "./chat-first-unread.lib";
import {
  buildForwardQuote,
  consumePendingForwardPrefill,
  mergeForwardDraftContent,
  resolveForwardDraftTarget,
  setPendingForwardPrefill,
  toggleForwardRecipient,
} from "./chat-forward.lib";
import { collectUnreadMessageIds, resolveMarkAllAsReadTarget } from "./chat-mark-all-read.lib";
import { createMarkAsReadBatcher } from "./chat-mark-as-read.lib";
import { resolveNextUnreadTopicRoute } from "./chat-next-unread-topic.lib";
import { shouldLoadBoundaryPage } from "./chat-pagination.lib";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
  markOutgoingMessageSent,
} from "./chat-send-delivery.lib";
import {
  TOPIC_PROMPT_BUTTON_CLASS_NAME,
  TOPIC_PROMPT_ICON_HOVER_MODE,
} from "./chat-topic-prompt-button.lib";
import { uploadComposerFiles, type ComposerUploadProgressState } from "./chat-upload.lib";
import { EditMessageModalBody } from "./chat-page-edit-message-modal.ui";
import { ForwardMessageModalBody } from "./chat-page-forward-modal.ui";

const log = createLogger("chat-page");
const AI_CONTEXT_MESSAGES_LIMIT = 30;
const AI_CONTEXT_MESSAGE_MAX_CHARS = 500;

function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function normalizeAiContextContent(content: string): string {
  return stripHtml(content).replace(/\s+/g, " ").trim().slice(0, AI_CONTEXT_MESSAGE_MAX_CHARS);
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
  const setExpandedStreamSlug = useSidebarConfigStore((s) => s.setExpandedStreamSlug);
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
    resolvedStreamName,
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
  const partnerUser = useUsersStore((s) =>
    partnerUserId != null ? s.getUser(partnerUserId) : undefined,
  );
  useChatPartnerProfileHydration({ partnerUserId, isDmView, isGroupDmView });

  const messages = useCurrentChatMessagesStore((s) => s.messages);
  const streams = useChatListStore((s) => s.streams());
  const firstUnreadId = useMemo(
    () => resolveFirstUnreadBoundaryMessageId(messages, currentUserId),
    [messages, currentUserId],
  );
  const unreadCount = useMemo(() => countUnreadMessages(messages), [messages]);
  const setContext = useCurrentChatMessagesStore((s) => s.setContext);
  const setMessagesInStore = useCurrentChatMessagesStore((s) => s.setMessages);
  const appendMessageToStore = useCurrentChatMessagesStore((s) => s.appendMessage);
  const appendMessagesToStore = useCurrentChatMessagesStore((s) => s.appendMessages);
  const prependMessagesToStore = useCurrentChatMessagesStore((s) => s.prependMessages);
  const removeMessageFromStore = useCurrentChatMessagesStore((s) => s.removeMessage);
  const removeMessagesFromStore = useCurrentChatMessagesStore((s) => s.removeMessages);
  const updateMessageFlagsInStore = useCurrentChatMessagesStore((s) => s.updateMessageFlags);
  const updateMessageReactionInStore = useCurrentChatMessagesStore((s) => s.updateMessageReaction);
  const updateMessageContentInStore = useCurrentChatMessagesStore((s) => s.updateMessageContent);
  const isLoadingMore = useCurrentChatMessagesStore((s) => s.isLoadingMore);
  const hasNewerMessages = useCurrentChatMessagesStore((s) => s.hasNewerMessages);
  const setIsLoadingMore = useCurrentChatMessagesStore((s) => s.setIsLoadingMore);
  const setHasOlderMessages = useCurrentChatMessagesStore((s) => s.setHasOlderMessages);
  const setHasNewerMessages = useCurrentChatMessagesStore((s) => s.setHasNewerMessages);
  const loadInitialMessagesForContext = useCurrentChatMessagesStore(
    (s) => s.loadInitialMessagesForContext,
  );
  const loadOlderBoundaryPage = useCurrentChatMessagesStore((s) => s.loadOlderBoundaryPage);
  const loadNewerBoundaryPage = useCurrentChatMessagesStore((s) => s.loadNewerBoundaryPage);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<ComposerUploadProgressState | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyQuote, setReplyQuote] = useState<{
    id: number;
    content: string;
    sender_full_name: string;
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set());
  const [editingMessage, setEditingMessage] = useState<MockMessage | null>(null);
  const { forwardMessages, setForwardMessages, forwardSelectedText, setForwardSelectedText } =
    useChatForwardHydration({ forwardMessageId, messages });
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [jitsiModalUrl, setJitsiModalUrl] = useState<string | null>(null);
  const [jitsiLocationName, setJitsiLocationName] = useState("");
  const [readReceiptsOpen, setReadReceiptsOpen] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const markAsReadBatcherRef = useRef<ReturnType<typeof createMarkAsReadBatcher> | null>(null);
  const optimisticMessageIdRef = useRef(-1);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<
    { type: "single"; messageId: number } | { type: "bulk"; messageIds: number[] } | null
  >(null);
  const rightDrawer = useRightDrawer();
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
        topic: activeTopic ?? "general",
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
  const draftTopic = activeTopic ?? "general";

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

  const activeStreamId = resolvedStreamId;

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

      const unreadMessageIds = messageIds.filter((messageId) => {
        const message = useCurrentChatMessagesStore
          .getState()
          .messages.find((m) => m.id === messageId);
        return message != null && !(message.flags ?? []).includes("read");
      });
      if (unreadMessageIds.length === 0) return;

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
    [updateMessageFlagsInStore],
  );

  const handleUnreadMessagesAtBottom = useCallback(
    (messageIds: number[]) => {
      const target = resolveMarkAllAsReadTarget({
        isDmView,
        activeDmUserIds,
        activeStreamId,
        activeTopic,
      });
      if (!target) return;

      const bottomFallbackContext: ReadFallbackContext =
        target.type === "dm"
          ? { type: "dm", dmKey: dmRouteKey(target.userIds, currentUserId) }
          : target.type === "topic"
            ? { type: "stream", streamId: target.streamId, topic: target.topic }
            : { type: "stream", streamId: target.streamId, topic: activeTopic ?? "general" };

      const request =
        target.type === "dm"
          ? markDmAsRead(target.userIds)
          : target.type === "topic"
            ? markTopicAsRead(target.streamId, target.topic)
            : markStreamAsRead(target.streamId);

      request
        .then((ok) => {
          if (!ok) return;
          applyReadMessagesOptimistically(messageIds, bottomFallbackContext);
        })
        .catch(() => {});
    },
    [
      isDmView,
      activeDmUserIds,
      activeStreamId,
      activeTopic,
      currentUserId,
      applyReadMessagesOptimistically,
    ],
  );

  const handleUnreadMessagesVisible = useCallback((messageIds: number[]) => {
    markAsReadBatcherRef.current?.schedule(messageIds);
  }, []);

  useEffect(() => {
    const batchFallbackContext: ReadFallbackContext | undefined = isDmView
      ? activeDmUserIds != null && activeDmUserIds.length > 0
        ? { type: "dm", dmKey: dmRouteKey(activeDmUserIds, currentUserId) }
        : undefined
      : activeStreamId != null
        ? { type: "stream", streamId: activeStreamId, topic: activeTopic ?? "general" }
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
      void batcher.flush();
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
        : target.type === "topic"
          ? markTopicAsRead(target.streamId, target.topic)
          : markStreamAsRead(target.streamId);

    const markFallbackContext: ReadFallbackContext | undefined =
      target.type === "dm"
        ? { type: "dm", dmKey: dmRouteKey(target.userIds, currentUserId) }
        : target.type === "topic"
          ? { type: "stream", streamId: target.streamId, topic: target.topic }
          : { type: "stream", streamId: target.streamId, topic: activeTopic ?? "general" };

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
    enabled: isDmView ? (activeDmUserIds?.length ?? 0) > 0 : activeStreamId != null,
  });

  const handleComposerValueChange = useCallback(
    (v: string) => {
      composerValueRef.current = v;
      onComposerValueChangeTyping(v);

      const draftStore = useDraftStore.getState();
      const existingDraft =
        draftType && draftTo.length > 0 ? draftStore.getDraftForChat(draftType, draftTo, draftTopic) : undefined;
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
    [onComposerValueChangeTyping, draftType, draftTo, draftTopic],
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
    setExpandedStreamSlug(streamSlug);
  }, [setExpandedStreamSlug, streamSlug]);

  useChatToastAutoClear({
    toastMessage,
    clearToast: () => setToastMessage(null),
    timeoutMs: 2000,
  });

  // Синхронизируем stream-контекст с маршрутом без загрузки сообщений.
  useEffect(() => {
    if (!streamSlug) {
      if (!dmIdParam || dmIdParam === "") {
        setContext(null);
      }
      return;
    }
    if (!resolvedStreamName || resolvedStreamId == null) {
      setContext(null);
      return;
    }
    setContext({
      type: "stream",
      streamId: resolvedStreamId,
      streamName: resolvedStreamName,
      topic: streamRouteTopic,
    });
  }, [dmIdParam, streamSlug, setContext, resolvedStreamId, resolvedStreamName, streamRouteTopic]);

  // Загружаем стартовую порцию stream-сообщений только по параметрам маршрута и фокусу.
  useEffect(() => {
    if (!streamSlug) {
      setMessagesLoading(false);
      return;
    }
    if (!resolvedStreamName) {
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    let cancelled = false;
    loadInitialMessagesForContext({
      context: {
        type: "stream",
        streamId: resolvedStreamId ?? 0,
        streamName: resolvedStreamName,
        topic: streamRouteTopic,
      },
      focusedMessageId,
      currentUserId,
    })
      .then(() => {
        if (!cancelled) setMessagesLoading(false);
      })
      .catch(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    streamSlug,
    resolvedStreamName,
    resolvedStreamId,
    streamRouteTopic,
    focusedMessageId,
    currentUserId,
    loadInitialMessagesForContext,
  ]);

  // Синхронизируем контекст активного DM с маршрутом и текущим пользователем.
  useEffect(() => {
    if (!dmIdParam || dmIdParam === "") {
      if (!streamSlug) setContext(null);
      return;
    }
    if (currentUserId == null) return;

    const routeUserIds = parseDmSlugToUserIds(dmIdParam);
    const userIds = normalizeDmRouteUserIds(routeUserIds, currentUserId);
    if (userIds.length === 0) return;

    const dmKey = dmRouteKey(userIds, currentUserId);
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

    setMessagesLoading(true);
    let cancelled = false;
    const dmKey = dmRouteKey(userIds, currentUserId);
    loadInitialMessagesForContext({
      context: { type: "dm", dmKey },
      focusedMessageId,
      currentUserId,
    })
      .then(() => {
        if (!cancelled) setMessagesLoading(false);
      })
      .catch(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dmIdParam, focusedMessageId, currentUserId, loadInitialMessagesForContext]);

  const PAGE_SIZE = 50;

  const loadOlderMessages = useCallback(() => {
    const store = useCurrentChatMessagesStore.getState();
    if (
      !shouldLoadBoundaryPage({
        isLoadingMore: store.isLoadingMore,
        hasBoundaryMessages: store.hasOlderMessages,
        messagesLength: store.messages.length,
      })
    ) {
      return;
    }
    void loadOlderBoundaryPage({ pageSize: PAGE_SIZE, currentUserId });
  }, [PAGE_SIZE, currentUserId, loadOlderBoundaryPage]);

  const loadNewerMessages = useCallback(() => {
    const store = useCurrentChatMessagesStore.getState();
    if (
      !shouldLoadBoundaryPage({
        isLoadingMore: store.isLoadingMore,
        hasBoundaryMessages: store.hasNewerMessages,
        messagesLength: store.messages.length,
      })
    ) {
      return;
    }
    void loadNewerBoundaryPage({ pageSize: PAGE_SIZE, currentUserId });
  }, [PAGE_SIZE, currentUserId, loadNewerBoundaryPage]);

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

  const buildCurrentCallLink = useCallback(() => {
    if (!canStartCallFromHeader({ target: callTarget, currentUserId }) || callTarget == null) {
      return null;
    }
    const roomName = buildCallRoomName({
      target: callTarget,
      currentUserId,
      chatLabel: callRoomChatLabel,
    });
    return buildJitsiMeetingUrl(roomName);
  }, [callTarget, currentUserId, callRoomChatLabel]);

  const handleCallClick = useCallback(async () => {
    if (!canStartCallFromHeader({ target: callTarget, currentUserId }) || callTarget == null)
      return;
    const senderUserId = currentUserId!;
    setSendError(null);
    setSending(true);
    try {
      const url = buildCurrentCallLink();
      if (url == null) {
        return;
      }
      const newMsg =
        callTarget.mode === "dm"
          ? await sendMessage({
              to: callTarget.to,
              content: url,
              sender_id: senderUserId,
              sender_full_name: t("common.you"),
            })
          : await sendMessage({
              stream: callTarget.stream,
              streamId: callTarget.streamId,
              subject: callTarget.subject,
              content: url,
              sender_id: senderUserId,
              sender_full_name: t("common.you"),
            });
      appendMessageToStore(newMsg);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("call.createFailed"));
    } finally {
      setSending(false);
    }
  }, [callTarget, currentUserId, buildCurrentCallLink, appendMessageToStore, t]);

  const handleSend = async (content: string, subjectOverride?: string, files?: File[]) => {
    setSendError(null);
    let body = content;
    setUploadProgress(null);

    if (files && files.length > 0) {
      const uploadController = new AbortController();
      uploadAbortControllerRef.current = uploadController;
      setSending(true);
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
        setSending(false);
        setUploadProgress(null);
        throw new Error(errorMessage, { cause: err });
      } finally {
        if (uploadAbortControllerRef.current === uploadController) {
          uploadAbortControllerRef.current = null;
        }
      }
    }

    const clearDraftAfterSend = () => {
      composerValueRef.current = "";
    };

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
      setSending(true);
      try {
        const newMsg = await sendMessage({
          to: activeDmUserIds,
          content: body,
          sender_id: currentUserId ?? 0,
          sender_full_name: t("common.you"),
        });
        removeMessageFromStore(optimisticMessageId);
        appendMessageToStore(
          newMsg.id > 0 ? markOutgoingMessageSent(newMsg) : markOutgoingMessageFailed(newMsg),
        );
        setReplyQuote(null);
        clearDraftAfterSend();
        stopTypingAfterSend();
      } catch (err) {
        appendMessageToStore(markOutgoingMessageFailed(optimisticMessage));
        setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        throw err instanceof Error ? err : new Error(t("message.sendFailed"));
      } finally {
        setSending(false);
        setUploadProgress(null);
      }
      return;
    }
    if (activeStream) {
      const subject = subjectOverride ?? activeTopic ?? "general";
      const optimisticMessageId = optimisticMessageIdRef.current;
      optimisticMessageIdRef.current -= 1;
      const optimisticMessage = buildOptimisticOutgoingMessage({
        id: optimisticMessageId,
        senderId: currentUserId ?? 0,
        senderFullName: t("common.you"),
        content: body,
        target: {
          mode: "stream",
          stream: activeStream,
          streamId: activeStreamId ?? undefined,
          subject,
        },
      });
      appendMessageToStore(optimisticMessage);
      setSending(true);
      try {
        const newMsg = await sendMessage({
          stream: activeStream,
          streamId: activeStreamId ?? undefined,
          subject,
          content: body,
          sender_id: currentUserId ?? 0,
          sender_full_name: t("common.you"),
        });
        removeMessageFromStore(optimisticMessageId);
        appendMessageToStore(
          newMsg.id > 0 ? markOutgoingMessageSent(newMsg) : markOutgoingMessageFailed(newMsg),
        );
        setReplyQuote(null);
        clearDraftAfterSend();
        stopTypingAfterSend();
      } catch (err) {
        appendMessageToStore(markOutgoingMessageFailed(optimisticMessage));
        setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        throw err instanceof Error ? err : new Error(t("message.sendFailed"));
      } finally {
        setSending(false);
        setUploadProgress(null);
      }
    }

    setUploadProgress(null);
  };

  const handleCancelUpload = useCallback(() => {
    const controller = uploadAbortControllerRef.current;
    if (controller == null || controller.signal.aborted) return;
    controller.abort();
  }, []);

  const messageCallbacks: MessageListCallbacks = useMemo(
    () => ({
      onMessageReply(msg, selectedText) {
        const trimmedSelectedText = selectedText?.trim();
        setReplyQuote({
          id: msg.id,
          content:
            trimmedSelectedText != null && trimmedSelectedText.length > 0
              ? trimmedSelectedText
              : msg.content,
          sender_full_name: msg.sender_full_name,
        });
      },
      onMessageEdit(msg) {
        setEditingMessage(msg);
      },
      onMessageDelete(msg) {
        setDeleteConfirm({ type: "single", messageId: msg.id });
      },
      onMessageCopy(msg) {
        const text = stripHtml(msg.content);
        navigator.clipboard.writeText(text).then(
          () => setToastMessage(t("message.copied")),
          () => setToastMessage(t("message.copyFailed")),
        );
      },
      onMessageForward(msg, selectedText) {
        setForwardMessages([msg]);
        const normalizedSelectedText = selectedText?.trim();
        setForwardSelectedText(
          normalizedSelectedText != null && normalizedSelectedText.length > 0
            ? normalizedSelectedText
            : undefined,
        );
      },
      onMessageStar(msg) {
        const hasStar = msg.flags?.includes("starred");
        setActionError(null);
        (hasStar ? removeMessageFlag([msg.id], "starred") : addMessageFlag([msg.id], "starred"))
          .then(() => {
            updateMessageFlagsInStore([msg.id], "starred", hasStar ? "remove" : "add");
          })
          .catch((err) => setActionError(err instanceof Error ? err.message : t("app.error")));
      },
      onMessageSelect(msg) {
        setSelectedMessageIds((prev) => {
          const next = new Set(prev);
          if (next.has(msg.id)) next.delete(msg.id);
          else next.add(msg.id);
          return next;
        });
        if (!selectionMode) setSelectionMode(true);
      },
      onMessageAddReaction(messageId, emojiName) {
        setActionError(null);
        addReaction(messageId, emojiName)
          .then(() => {
            updateMessageReactionInStore(
              messageId,
              {
                emoji_name: emojiName,
                emoji_code: "",
                reaction_type: "unicode_emoji",
                user_id: currentUserId ?? 0,
              },
              "add",
            );
          })
          .catch((err) =>
            setActionError(err instanceof Error ? err.message : t("message.reactionError")),
          );
      },
      onMessageRemoveReaction(messageId, emojiName) {
        setActionError(null);
        removeReaction(messageId, emojiName)
          .then(() => {
            updateMessageReactionInStore(
              messageId,
              {
                emoji_name: emojiName,
                emoji_code: "",
                reaction_type: "unicode_emoji",
                user_id: currentUserId ?? 0,
              },
              "remove",
            );
          })
          .catch((err) =>
            setActionError(err instanceof Error ? err.message : t("message.reactionError")),
          );
      },
      onOpenJitsiCall(url: string, locationName?: string) {
        setJitsiModalUrl(url);
        setJitsiLocationName(locationName?.trim() ?? "");
      },
      onMessageViews(msg) {
        void useMessageReadersStore.getState().fetchReadReceipts(msg.id);
        setReadReceiptsOpen(true);
      },
      onTopicSeparatorClick(msg) {
        if (msg.stream_id == null || msg.subject == null) return;
        const topic = msg.subject.trim();
        if (topic.length === 0) return;
        const streamName =
          streams.find((stream) => stream.stream_id === msg.stream_id)?.name ??
          (typeof msg.display_recipient === "string" ? msg.display_recipient : undefined);
        if (!streamName) return;
        const route = `/stream/${slugForStream({ stream_id: msg.stream_id, name: streamName })}/topic/${encodeURIComponent(topic)}`;
        if (route === location.pathname) return;
        void navigate(route);
      },
      onMessageAuthorClick(userId) {
        rightDrawer?.openUserProfile?.(userId);
      },
    }),
    [
      selectionMode,
      currentUserId,
      updateMessageFlagsInStore,
      updateMessageReactionInStore,
      streams,
      location.pathname,
      navigate,
      rightDrawer,
    ],
  );

  const handleSaveEdit = useCallback(
    (content: string) => {
      if (!editingMessage) return;
      setActionError(null);
      updateMessage(editingMessage.id, { content })
        .then(() => {
          updateMessageContentInStore(editingMessage.id, content);
          setEditingMessage(null);
        })
        .catch((err) =>
          setActionError(err instanceof Error ? err.message : t("message.saveError")),
        );
    },
    [editingMessage, updateMessageContentInStore],
  );
  const handleEditLastMessage = useCallback(() => {
    if (lastOwnMessageForEdit == null) return;
    setEditingMessage(lastOwnMessageForEdit);
  }, [lastOwnMessageForEdit]);

  const handleForwardTo = useCallback(
    (stream: string, topic: string, to?: number[]) => {
      if (forwardMessages.length === 0) return;
      setSendError(null);
      const quoted = buildForwardQuote(forwardMessages, forwardSelectedText);
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
    [forwardMessages, selectionMode, streams, forwardSelectedText, location.pathname, navigate],
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
  const isOneToOneDm = isDmView && !isGroupDmView;
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
    const trimmedPartnerName = partnerUser?.full_name?.trim();
    return {
      avatarUrl: partnerUser?.avatar_url ?? undefined,
      name:
        trimmedPartnerName != null && trimmedPartnerName.length > 0
          ? trimmedPartnerName
          : t("dm.partner"),
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
  }, [isDmView, isGroupDmView, partnerUserId, partnerUser, dmPartnerIsTyping]);

  const dmGroup = useMemo(() => {
    if (!isGroupDmView || !dmChat) return undefined;
    const participantIds =
      dmChat.userIds != null && dmChat.userIds.length > 0
        ? dmChat.userIds
        : currentUserId != null
          ? Array.from(new Set([...dmRecipientIds, currentUserId]))
          : dmRecipientIds;
    const resolvedName =
      dmChat.name?.trim() != null && dmChat.name.trim().length > 0
        ? dmChat.name.trim()
        : t("dm.groupChat");
    return {
      name: resolvedName,
      participantsCount: participantIds.length,
    };
  }, [isGroupDmView, dmChat, currentUserId, dmRecipientIds]);

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-[1199px] flex-1 flex-col overflow-hidden">
      {/* Edit message modal */}
      <Dialog.Root
        open={!!editingMessage}
        onOpenChange={(open) => !open && setEditingMessage(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content
            className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal flex max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {editingMessage && (
              <EditMessageModalBody
                initialContent={editingMessage.content}
                onSave={handleSaveEdit}
                onClose={() => setEditingMessage(null)}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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

      {/* Read receipts modal */}
      <Dialog.Root
        open={readReceiptsOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReadReceiptsOpen(false);
            useMessageReadersStore.getState().clear();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content
            className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal flex max-h-[60vh] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <Dialog.Title className="text-sm font-semibold text-text-primary">
                {t("message.readBy")}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="hover:bg-bg/50 rounded p-1 text-text-muted"
                  aria-label={t("common.close")}
                >
                  <Icon name="close" size={18} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {readersLoading && (
                <div className="flex items-center justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
                </div>
              )}
              {readersError && (
                <p className="py-4 text-center text-sm text-notice-base">
                  {t("message.readReceiptsError")}
                </p>
              )}
              {!readersLoading && !readersError && readerEntries.length === 0 && (
                <p className="py-4 text-center text-sm text-text-muted">
                  {t("message.noReadReceipts")}
                </p>
              )}
              {!readersLoading && !readersError && readerEntries.length > 0 && (
                <ul className="space-y-2">
                  {readerEntries.map((entry) => (
                    <li
                      key={entry.userId}
                      className="flex items-start gap-2 text-sm text-text-primary"
                    >
                      <span className="bg-accent/20 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-accent">
                        {entry.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{entry.name}</span>
                        {entry.statusLabel != null && entry.statusLabel.length > 0 ? (
                          <span className="block truncate text-[11px] text-text-secondary">
                            {entry.statusLabel}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ChatHeader
        channelName={activeStream ? `#${activeStream}` : t("channel.channelName")}
        participantsCount={chatInfo?.memberCount ?? 0}
        onlineCount={chatInfo?.onlineCount ?? 0}
        onOpenSearch={openSearch ?? undefined}
        onToggleRightPanel={rightDrawer ? handleToggleRightPanel : undefined}
        rightPanelOpen={rightDrawer?.open ?? false}
        rightPanelLabel={
          isGroupDmView ? t("dm.groupChat") : isDmView ? t("info.partnerInfo") : undefined
        }
        hideTopic
        hideParticipants={isDmView}
        onCallClick={canStartCall ? handleCallClick : undefined}
        dmPartner={dmPartner}
        dmGroup={dmGroup}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {messagesLoading ? (
          <div
            className="flex min-h-[200px] flex-1 items-center justify-center"
            aria-busy="true"
            aria-label={t("chat.loadingMessages")}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
          </div>
        ) : isDmView ? (
          <MessageList
            messages={messages}
            currentUserId={currentUserId ?? undefined}
            scrollToBottomKey={
              activeDmUserIds !== null ? `dm-${activeDmUserIds.join(",")}` : undefined
            }
            callbacks={messageCallbacks}
            selectionMode={selectionMode}
            selectedMessageIds={selectedMessageIds}
            onLoadMore={loadOlderMessages}
            isLoadingMore={isLoadingMore}
            onLoadNewer={loadNewerMessages}
            hasNewerMessages={hasNewerMessages}
            firstUnreadId={firstUnreadId}
            unreadCount={unreadCount}
            focusedMessageId={focusedMessageId}
            onUnreadMessagesVisible={handleUnreadMessagesVisible}
            onUnreadMessagesAtBottom={handleUnreadMessagesAtBottom}
          />
        ) : (
          <MessageList
            messages={messages}
            currentUserId={currentUserId ?? undefined}
            scrollToBottomKey={[activeStream ?? "", activeTopic ?? ""].join("|")}
            callbacks={messageCallbacks}
            selectionMode={selectionMode}
            selectedMessageIds={selectedMessageIds}
            onLoadMore={loadOlderMessages}
            isLoadingMore={isLoadingMore}
            onLoadNewer={loadNewerMessages}
            hasNewerMessages={hasNewerMessages}
            firstUnreadId={firstUnreadId}
            unreadCount={unreadCount}
            focusedMessageId={focusedMessageId}
            onUnreadMessagesVisible={handleUnreadMessagesVisible}
            onUnreadMessagesAtBottom={handleUnreadMessagesAtBottom}
          />
        )}
        {selectionMode && selectedMessageIds.size > 0 && (
          <div className="flex items-center justify-between border-t border-border-subtle bg-bg-elevated px-4 py-2">
            <span className="text-sm text-text-muted">
              {t("message.selected", { count: selectedMessageIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-bg px-3 py-1.5 text-sm text-text-muted"
                disabled={forwardableSelectedMessages.length === 0}
                onClick={() => {
                  if (forwardableSelectedMessages.length === 0) return;
                  setForwardMessages(forwardableSelectedMessages);
                  setForwardSelectedText(undefined);
                }}
              >
                {t("message.forward")}
              </button>
              <button
                type="button"
                disabled={deletableSelectedMessageIds.length === 0}
                className="bg-notice-base/10 rounded-lg px-3 py-1.5 text-sm text-notice-base disabled:opacity-50"
                onClick={() => {
                  if (deletableSelectedMessageIds.length === 0) return;
                  setDeleteConfirm({ type: "bulk", messageIds: deletableSelectedMessageIds });
                }}
              >
                {t("common.delete")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-bg px-3 py-1.5 text-sm text-text-muted"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedMessageIds(new Set());
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
        {deleteConfirm && (
          <div
            className="bg-notice-base/10 flex flex-shrink-0 items-center gap-3 border-t border-border-subtle px-4 py-2"
            role="alertdialog"
            aria-label={t("message.deleteConfirm")}
          >
            <span className="flex-1 text-sm text-text-primary">
              {deleteConfirm.type === "bulk"
                ? t("message.deleteSelectedConfirm", { count: deleteConfirm.messageIds.length })
                : t("message.deleteConfirm")}
            </span>
            <button
              type="button"
              className="hover:bg-notice-base/90 text-badge-text rounded-lg bg-notice-base px-3 py-1 text-sm"
              onClick={() => {
                setActionError(null);
                if (deleteConfirm.type === "single") {
                  deleteMessage(deleteConfirm.messageId)
                    .then(() => removeMessageFromStore(deleteConfirm.messageId))
                    .catch((err) =>
                      setActionError(err instanceof Error ? err.message : t("message.deleteError")),
                    );
                } else {
                  Promise.all(deleteConfirm.messageIds.map((id) => deleteMessage(id)))
                    .then(() => {
                      removeMessagesFromStore(deleteConfirm.messageIds);
                      setSelectedMessageIds(new Set());
                      setSelectionMode(false);
                    })
                    .catch((err) =>
                      setActionError(err instanceof Error ? err.message : t("app.error")),
                    );
                }
                setDeleteConfirm(null);
              }}
            >
              {t("message.delete")}
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1 text-sm text-text-muted hover:text-text-primary"
              onClick={() => setDeleteConfirm(null)}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
        {actionError && (
          <div
            className="bg-notice-base/10 flex-shrink-0 border-t border-border-subtle px-4 py-2 text-sm text-notice-base"
            role="alert"
          >
            {actionError}
          </div>
        )}
        {sendError && (
          <div
            className="bg-notice-base/10 flex-shrink-0 border-t border-border-subtle px-4 py-2 text-sm text-notice-base"
            role="alert"
          >
            {sendError}
          </div>
        )}
        {toastMessage && (
          <div className="fixed bottom-20 left-1/2 z-toast -translate-x-1/2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-2 text-sm text-text-primary shadow-lg">
            {toastMessage}
          </div>
        )}
        {typingText && !(isOneToOneDm && dmPartnerIsTyping) && (
          <div className="flex-shrink-0 px-4 py-1">
            <span className="text-xs italic text-text-muted">{typingText}</span>
          </div>
        )}
        {!isDmView && !activeTopic ? (
          <button
            type="button"
            onClick={handleExpandCurrentStreamTopics}
            disabled={!streamSlug}
            data-icon-hover={TOPIC_PROMPT_ICON_HOVER_MODE}
            className={TOPIC_PROMPT_BUTTON_CLASS_NAME}
            aria-label={t("chat.selectTopic")}
          >
            <span className="mr-2 inline-flex align-middle">
              <Icon name="marker" size={20} className="text-current" />
            </span>
            <span>{t("chat.selectTopic")}</span>
          </button>
        ) : (
          <MessageComposer
            onSend={handleSend}
            onCreateCallLink={canStartCall ? buildCurrentCallLink : undefined}
            onCancelUpload={handleCancelUpload}
            disabled={sending || (isDmView ? !activeDmUserIds?.length : !activeStream)}
            uploadProgress={uploadProgress}
            placeholder={
              isDmView
                ? activeDmUserIds?.length
                  ? t("chat.sendPlaceholder")
                  : t("chat.selectChat")
                : activeStream
                  ? t("chat.sendPlaceholder")
                  : t("chat.selectChannel")
            }
            activeTopic={activeTopic ?? undefined}
            replyQuote={replyQuote}
            onClearReply={() => setReplyQuote(null)}
            initialValue={draftInitialValue}
            onValueChange={handleComposerValueChange}
            onEditLastMessage={handleEditLastMessage}
            aiMessagesContext={aiMessagesContext}
            aiChatContext={aiChatContext}
          />
        )}
      </section>
      {jitsiModalUrl && (
        <JitsiCallModal
          open={!!jitsiModalUrl}
          meetingUrl={jitsiModalUrl}
          locationName={jitsiLocationName}
          onClose={() => {
            setJitsiModalUrl(null);
            setJitsiLocationName("");
          }}
        />
      )}
    </div>
  );
};
