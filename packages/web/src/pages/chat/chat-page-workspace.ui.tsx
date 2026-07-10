import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  parseMessengerConversationId,
  selectMessengerConversationFromWorkspaceRoute,
} from "~/entities/messenger/messenger-ids.lib";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  markMessengerMessageRead,
  sendMessengerMessage,
} from "~/entities/messenger/messenger-message-actions.lib";
import { toggleMessengerMessageReaction } from "~/entities/messenger/messenger-message-reactions-actions.lib";
import {
  loadMessengerConversationMessages,
  loadMessengerMessageWindowAroundMessage,
  loadMessengerMessageWindowPage,
} from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerOutboxStore } from "~/entities/messenger/messenger-outbox.model";
import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useMessengerStreamBindingsForRoute } from "~/entities/messenger/messenger-stream-bindings-loader.lib";
import { normalizeWorkspacePreviewBlob } from "~/entities/messenger/messenger-workspace-message-preview-blob.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerTopic,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { UsersById } from "~/entities/user/user.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { createJitsiCallKey, useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { buildWorkspaceJitsiMeetingUrl } from "~/features/jitsi-call/workspace-jitsi-call.lib";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { t } from "~/i18n/i18n";
import { downloadWorkspaceFile, uploadWorkspaceFile } from "~/shared/api/messenger-files.api";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { createLogger } from "~/shared/lib/logger";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolution,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import {
  workspaceMessengerMessageRoute,
  type WorkspaceMessengerRouteMatch,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Spinner } from "~/shared/ui/spinner.ui";
import type { ChatHeaderProps } from "~/widgets/chat-view/chat-header.types";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import type {
  ComposerEditSession,
  MessageComposerCapabilities,
  ReplyQuote,
} from "~/widgets/message-composer/message-composer.types";
import type { WorkspaceMessageMediaGalleryOpenRequest } from "~/widgets/workspace-message-list/workspace-message-list.types";
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
const workspacePreviewLoaderLog = createLogger("chat-page:workspace-preview-loader");

const noop = () => undefined;

interface WorkspacePreviewBlobCacheEntry {
  abortController: AbortController;
  promise: Promise<Blob>;
}

function createWorkspacePreviewAbortError(): DOMException {
  return new DOMException("Workspace preview load aborted", "AbortError");
}

function waitForWorkspacePreviewBlob(promise: Promise<Blob>, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) {
    return Promise.reject(createWorkspacePreviewAbortError());
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      reject(createWorkspacePreviewAbortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (blob) => {
        signal.removeEventListener("abort", handleAbort);
        if (signal.aborted) {
          reject(createWorkspacePreviewAbortError());
          return;
        }
        resolve(blob);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error instanceof Error ? error : new Error("Workspace preview load failed"));
      },
    );
  });
}

function clearWorkspacePreviewBlobCache(cache: Map<string, WorkspacePreviewBlobCacheEntry>): void {
  for (const entry of cache.values()) {
    entry.abortController.abort();
  }
  cache.clear();
}

function normalizeWorkspaceMentionLookupText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function normalizeWorkspaceActionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function resolveWorkspaceCurrentUserDisplayName(
  runtimeContext: ReturnType<typeof selectCurrentWorkspaceRuntimeContext>,
  usersById: UsersById,
): string {
  if (runtimeContext == null) return "";

  const storeDisplayName = selectUserDisplayName(usersById[runtimeContext.userUuid], "").trim();
  if (storeDisplayName.length > 0) return storeDisplayName;

  return runtimeContext.userUuid;
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

  // Before files are uploaded, there are no server workspace-file links yet.
  // The local row shows file names so the user can see which send is queued or failed.
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

function WorkspaceChatBlockingLoader(): React.ReactElement {
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

export const WorkspaceChatPage: React.FC<WorkspaceChatPageProps> = ({ route }) => {
  // This page is not a new chat layout: it assembles old sections and swaps only the data source.
  const [retryNonce, setRetryNonce] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messageRouteUuid, setMessageRouteUuid] = useState<MessengerUuid | null>(null);
  const [resolvedMessageConversationId, setResolvedMessageConversationId] =
    useState<MessengerConversationId | null>(null);
  const [focusedMessageUuid, setFocusedMessageUuid] = useState<MessengerUuid | null>(null);
  const [messageRouteLoading, setMessageRouteLoading] = useState(false);
  const [windowPaginationDirection, setWindowPaginationDirection] = useState<
    "before" | "after" | null
  >(null);
  const [composerEditSession, setComposerEditSession] = useState<ComposerEditSession | null>(null);
  const [composerEditMessageUuid, setComposerEditMessageUuid] = useState<string | null>(null);
  const [pendingDeleteMessageUuid, setPendingDeleteMessageUuid] = useState<string | null>(null);
  const [selectedMessageUuids, setSelectedMessageUuids] = useState<Set<string>>(() => new Set());
  const [replyQuote, setReplyQuote] = useState<ReplyQuote | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ComposerUploadProgressState | null>(null);
  const [scrollToBottomAfterSendNonce, setScrollToBottomAfterSendNonce] = useState(0);
  const pendingReadMessageUuidsRef = useRef<Set<string>>(new Set());
  const readRequestedMessageUuidsRef = useRef<Set<string>>(new Set());
  const readBatchTimerRef = useRef<number | null>(null);
  const actionAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const pendingWorkspaceJitsiHeaderCallRef = useRef(false);
  const workspacePreviewBlobCacheRef = useRef<Map<string, WorkspacePreviewBlobCacheEntry>>(
    new Map(),
  );
  const openWorkspaceForward = useWorkspaceForwardMessageStore((state) => state.open);
  const routeSelection = useMemo(
    () => selectMessengerConversationFromWorkspaceRoute(route),
    [route],
  );
  const activeMessageConversationId =
    routeSelection.status === "message" && messageRouteUuid === routeSelection.messageUuid
      ? resolvedMessageConversationId
      : null;
  const activeFocusedMessageUuid =
    routeSelection.status === "message" && messageRouteUuid === routeSelection.messageUuid
      ? focusedMessageUuid
      : null;
  const hasCurrentMessageRouteState =
    routeSelection.status === "message" && messageRouteUuid === routeSelection.messageUuid;
  const effectiveRoute = useMemo<WorkspaceMessengerRouteMatch | null>(() => {
    if (route?.kind !== "message" || activeMessageConversationId == null) {
      return route;
    }

    const parsedConversationId = parseMessengerConversationId(activeMessageConversationId);
    if (parsedConversationId == null) {
      return route;
    }

    if (parsedConversationId.kind === "topic") {
      return {
        kind: "topic",
        orgId: route.orgId,
        projectId: route.projectId,
        streamUuid: parsedConversationId.streamUuid,
        topicUuid: parsedConversationId.topicUuid,
      };
    }

    return {
      kind: "stream",
      orgId: route.orgId,
      projectId: route.projectId,
      streamUuid: parsedConversationId.streamUuid,
    };
  }, [activeMessageConversationId, route]);
  useMessengerStreamBindingsForRoute({ route: effectiveRoute });
  const openSearch = useOpenSearch();
  const rightDrawer = useRightDrawer();
  const selection = useMemo(
    () => selectMessengerConversationFromWorkspaceRoute(effectiveRoute),
    [effectiveRoute],
  );
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
  const workspaceMeetUrl = useWorkspaceJitsiSettingsStore((state) =>
    ownerKey == null ? null : (state.meetUrlsByOwnerKey[ownerKey] ?? null),
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
  const beforePageMarker = useWorkspaceMessageStore((state) =>
    conversationId == null
      ? null
      : (state.beforePageMarkerByConversationId[conversationId] ?? null),
  );
  const afterPageMarker = useWorkspaceMessageStore((state) =>
    conversationId == null ? null : (state.afterPageMarkerByConversationId[conversationId] ?? null),
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
          normalizeWorkspaceMentionLookupText(user.uuid),
          normalizeWorkspaceMentionLookupText(displayName),
          normalizeWorkspaceMentionLookupText(user.username),
        ];
        if (candidates.includes(lookupText)) {
          // Resolver returns only Workspace UUIDs. The render core stores them
          // in data-workspace-user-uuid without falling back to legacy IDs.
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
      // Buttons remain in the old UI, but show controlled placeholders instead of legacy requests.
      upload: {
        mode: "enabled",
      },
      savedSnippets: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.savedSnippetsUnsupported"),
      },
      preview: {
        mode: "enabled",
      },
      mentions: {
        mode: "enabled",
      },
      scheduledSend: {
        mode: "unsupported",
        unsupportedText: t("workspaceMessenger.scheduledSendUnsupported"),
      },
    }),
    [],
  );

  useEffect(() => {
    if (
      routeSelection.status === "message" ||
      selection.status !== "conversation" ||
      runtimeContext == null
    ) {
      return;
    }

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
  }, [retryNonce, routeSelection.status, runtimeContext, selection]);

  useEffect(() => {
    if (routeSelection.status !== "message") {
      setMessageRouteUuid(null);
      setResolvedMessageConversationId(null);
      setFocusedMessageUuid(null);
      setMessageRouteLoading(false);
      setWindowPaginationDirection(null);
      return;
    }

    setMessageRouteUuid(routeSelection.messageUuid);
    setResolvedMessageConversationId(null);
    setFocusedMessageUuid(null);
    setMessageRouteLoading(false);
    setWindowPaginationDirection(null);
  }, [
    route?.orgId,
    route?.projectId,
    route?.kind,
    routeSelection.status,
    routeSelection.status === "message" ? routeSelection.messageUuid : null,
    routeSelection.status === "conversation" ? routeSelection.conversationId : null,
  ]);

  useEffect(() => {
    if (routeSelection.status !== "message" || runtimeContext == null) return;

    const messageUuid = routeSelection.messageUuid;
    const messageStoreState = useWorkspaceMessageStore.getState();
    if (activeMessageConversationId != null && activeFocusedMessageUuid === messageUuid) {
      return;
    }
    if (activeMessageConversationId != null) {
      const activeMessages = selectWorkspaceMessagesForConversation(
        messageStoreState,
        activeMessageConversationId,
      );
      if (activeMessages.some((message) => message.uuid === messageUuid)) {
        setMessageRouteUuid(messageUuid);
        setFocusedMessageUuid(messageUuid);
        return;
      }
    }

    const existingMessage = selectWorkspaceMessageById(messageStoreState, messageUuid);
    if (existingMessage != null) {
      const existingConversationMessages = selectWorkspaceMessagesForConversation(
        messageStoreState,
        existingMessage.conversationId,
      );
      if (existingConversationMessages.some((message) => message.uuid === messageUuid)) {
        setMessageRouteUuid(messageUuid);
        setResolvedMessageConversationId(existingMessage.conversationId);
        setFocusedMessageUuid(messageUuid);
        return;
      }
    }

    const controller = new AbortController();
    setMessageRouteLoading(true);
    setActionError(null);
    void loadMessengerMessageWindowAroundMessage({
      runtimeContext,
      messageUuid,
      getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "applied") {
          setMessageRouteUuid(messageUuid);
          setResolvedMessageConversationId(result.conversationId);
          setFocusedMessageUuid(result.anchorUuid);
          setActionError(null);
          return;
        }
        if (result.status === "failed") {
          setActionError(result.error);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setActionError(normalizeWorkspaceActionError(error, t("chat.messagesLoadError")));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMessageRouteLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeFocusedMessageUuid, activeMessageConversationId, routeSelection, runtimeContext]);

  useEffect(() => {
    return () => {
      for (const controller of actionAbortControllersRef.current) {
        controller.abort();
      }
      actionAbortControllersRef.current.clear();
      uploadAbortControllerRef.current = null;
      pendingWorkspaceJitsiHeaderCallRef.current = false;
      if (readBatchTimerRef.current != null) {
        window.clearTimeout(readBatchTimerRef.current);
        readBatchTimerRef.current = null;
      }
      clearWorkspacePreviewBlobCache(workspacePreviewBlobCacheRef.current);
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
      pendingWorkspaceJitsiHeaderCallRef.current = false;
      clearWorkspacePreviewBlobCache(workspacePreviewBlobCacheRef.current);
    };
  }, [conversationId, runtimeContext]);

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
  const jitsiLocationName = useMemo(() => {
    if (headerView.kind === "directPrivate") {
      return headerView.dmPartner.name;
    }

    const topicLabel = headerView.topic?.trim() ?? "";
    if (topicLabel.length > 0) return topicLabel;

    return headerView.channelName;
  }, [headerView]);
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

            // After successful file upload, retry must not upload them again:
            // the local row already has final markdown with workspace-file links,
            // and the next possible failure is only POST /messages.
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

      // Scroll right after the local row appears. A later server snapshot can
      // move it by backend created_at, but the user already sees the send happened.
      setScrollToBottomAfterSendNonce((value) => value + 1);
      deliverOutgoingMessage(outgoing.localId);
    },
    [deliverOutgoingMessage, resolveSendTarget, runtimeContext],
  );

  const handleOpenWorkspaceJitsiCall = useCallback(
    (url: string, locationName?: string) => {
      if (runtimeContext == null || ownerKey == null) return;

      const callPayload = {
        meetingUrl: url,
        locationName: locationName?.trim() ?? "",
        ownerKey,
        meetUrl: workspaceMeetUrl ?? undefined,
        displayName: resolveWorkspaceCurrentUserDisplayName(runtimeContext, usersById),
      };
      const result = useJitsiCallStore.getState().requestOpenCall(callPayload);
      if (result.status === "blocked-active") {
        setSendError(t("message.sendFailed"));
      }
    },
    [ownerKey, runtimeContext, usersById, workspaceMeetUrl],
  );

  const handleStartWorkspaceHeaderCall = useCallback(() => {
    setSendError(null);

    if (runtimeContext == null || ownerKey == null) {
      setSendError(t("workspaceMessenger.runtimeUnavailable"));
      return;
    }
    if (workspaceMeetUrl == null) {
      setSendError(t("message.sendFailed"));
      return;
    }

    const target = resolveSendTarget();
    if (target.status === "blocked") {
      setSendError(target.error);
      return;
    }
    if (pendingWorkspaceJitsiHeaderCallRef.current) {
      return;
    }

    const meetingUrl = buildWorkspaceJitsiMeetingUrl({
      meetUrl: workspaceMeetUrl,
      organizationId: runtimeContext.organizationId,
      projectId: runtimeContext.projectId,
      streamUuid: target.streamUuid,
      topicUuid: target.topicUuid,
    });
    const locationName = headerView.kind === "directPrivate" ? headerView.dmPartner.name : "";
    const callPayload = {
      meetingUrl,
      locationName,
      ownerKey,
      meetUrl: workspaceMeetUrl,
      displayName: resolveWorkspaceCurrentUserDisplayName(runtimeContext, usersById),
    };

    const activeCall = useJitsiCallStore.getState().activeCall;
    if (activeCall != null && activeCall.callKey !== createJitsiCallKey(callPayload)) {
      setSendError(t("message.sendFailed"));
      return;
    }

    pendingWorkspaceJitsiHeaderCallRef.current = true;
    void runWorkspaceAction(async (signal) => {
      try {
        const result = await sendMessengerMessage({
          runtimeContext,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          signal,
          streamUuid: target.streamUuid,
          topicUuid: target.topicUuid,
          markdown: meetingUrl,
          includeStreamConversation: target.includeStreamConversation,
        });

        if (signal.aborted) return;

        if (result.status !== "applied") {
          setSendError(t("message.sendFailed"));
          return;
        }

        const currentRuntimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
        if (
          currentRuntimeContext == null ||
          workspaceRuntimeOwnerKey(currentRuntimeContext) !== ownerKey
        ) {
          return;
        }

        const openResult = useJitsiCallStore.getState().requestOpenCall(callPayload);
        if (openResult.status === "blocked-active") {
          setSendError(t("message.sendFailed"));
        }
      } catch (error) {
        if (signal.aborted) return;
        setSendError(normalizeWorkspaceActionError(error, t("message.sendFailed")));
      } finally {
        pendingWorkspaceJitsiHeaderCallRef.current = false;
      }
    });
  }, [
    headerView,
    ownerKey,
    resolveSendTarget,
    runWorkspaceAction,
    runtimeContext,
    usersById,
    workspaceMeetUrl,
  ]);

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
      initialMarkdown: message.payload.content,
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
        (effectiveRoute?.kind !== "stream" && effectiveRoute?.kind !== "topic")
      ) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return;
      }

      const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
      if (message == null) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return;
      }

      const quoteSource = selectedText?.trim() || message.payload.content.trim();
      if (quoteSource.length === 0) return;
      const authorLabel = resolveAuthorLabel(message.authorUuid) ?? t("message.replyTo");
      setComposerEditMessageUuid(null);
      setComposerEditSession(null);
      setReplyQuote({
        id: message.uuid,
        content: quoteSource,
        sender_full_name: authorLabel,
        permalinkUrl: workspaceMessengerMessageRoute({
          orgId: effectiveRoute.orgId,
          projectId: effectiveRoute.projectId,
          messageUuid: message.uuid,
        }),
        quoteFormat: "workspace",
      });
    },
    [effectiveRoute, resolveAuthorLabel, selection.status],
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

  const handleForwardMessage = useCallback(
    (messageUuid: string, selectedText?: string) => {
      setActionError(null);
      openWorkspaceForward({ messageUuids: [messageUuid], selectedText });
    },
    [openWorkspaceForward],
  );

  const handleForwardSelectedMessages = useCallback(() => {
    if (selectedMessageUuids.size === 0) {
      setActionError(t("workspaceMessenger.messageActionTargetMissing"));
      return;
    }

    setActionError(null);
    openWorkspaceForward({
      messageUuids: [...selectedMessageUuids],
      onSuccess: () => setSelectedMessageUuids(new Set()),
    });
  }, [openWorkspaceForward, selectedMessageUuids]);

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
    async (file: WorkspaceMessageFileReference, signal: AbortSignal): Promise<Blob> => {
      if (runtimeContext == null) {
        throw new Error(t("workspaceMessenger.runtimeUnavailable"));
      }

      const fileUuid = file.fileUuid.trim();
      if (fileUuid.length === 0) {
        throw new Error(t("workspaceMessenger.fileDownloadFailed"));
      }

      let cacheEntry = workspacePreviewBlobCacheRef.current.get(fileUuid);
      if (cacheEntry == null) {
        workspacePreviewLoaderLog.debug("preview cache miss", {
          fileUuid,
          contentType: file.contentType ?? null,
        });
        const previewAbortController = new AbortController();
        const promise = downloadWorkspaceFile(
          buildMessengerRequestOptions(runtimeContext, undefined, previewAbortController.signal),
          fileUuid,
        )
          .then((result) => {
            const normalizedBlob = normalizeWorkspacePreviewBlob(result.blob, file.contentType);
            workspacePreviewLoaderLog.debug("preview blob fetched", {
              fileUuid,
              responseType: result.blob.type || null,
              normalizedType: normalizedBlob.type,
              size: normalizedBlob.size,
            });
            return normalizedBlob;
          })
          .catch((error: unknown) => {
            if (workspacePreviewBlobCacheRef.current.get(fileUuid)?.promise === promise) {
              workspacePreviewBlobCacheRef.current.delete(fileUuid);
            }
            workspacePreviewLoaderLog.warn("preview blob fetch failed", {
              fileUuid,
              error: error instanceof Error ? error.name : "unknown",
            });
            throw error;
          });
        cacheEntry = { abortController: previewAbortController, promise };
        workspacePreviewBlobCacheRef.current.set(fileUuid, cacheEntry);
      } else {
        workspacePreviewLoaderLog.debug("preview cache hit", { fileUuid });
      }

      return waitForWorkspacePreviewBlob(cacheEntry.promise, signal);
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
    // The new list reports visible unread messages directly as Workspace uuid.
    // There is no "numeric id -> messageUuid" step here anymore: read action gets
    // the same key that exists in store and in DOM data-message-uuid.
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
    if (runtimeContext == null || conversationId == null || messagesStatus.loading) {
      return;
    }

    if (routeSelection.status === "message") {
      if (beforePageMarker == null) return;

      setWindowPaginationDirection("before");
      void runWorkspaceAction((signal) =>
        loadMessengerMessageWindowPage({
          runtimeContext,
          conversationId,
          direction: "before",
          pageMarker: beforePageMarker,
          getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          signal,
        }),
      )
        .then((result) => {
          if (result.status === "failed") {
            setActionError(result.error);
          }
        })
        .catch((error: unknown) => {
          setActionError(normalizeWorkspaceActionError(error, t("chat.messagesLoadError")));
        })
        .finally(() => {
          setWindowPaginationDirection(null);
        });
      return;
    }

    if (!messagesStatus.hasMore || messagesStatus.nextPageMarker == null) {
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
    beforePageMarker,
    conversationId,
    messagesStatus.hasMore,
    messagesStatus.loading,
    messagesStatus.nextPageMarker,
    routeSelection.status,
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
    if (
      runtimeContext == null ||
      conversationId == null ||
      messagesStatus.loading ||
      routeSelection.status !== "message" ||
      afterPageMarker == null
    ) {
      return;
    }

    setWindowPaginationDirection("after");
    void runWorkspaceAction((signal) =>
      loadMessengerMessageWindowPage({
        runtimeContext,
        conversationId,
        direction: "after",
        pageMarker: afterPageMarker,
        getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        signal,
      }),
    )
      .then((result) => {
        if (result.status === "failed") {
          setActionError(result.error);
        }
      })
      .catch((error: unknown) => {
        setActionError(normalizeWorkspaceActionError(error, t("chat.messagesLoadError")));
      })
      .finally(() => {
        setWindowPaginationDirection(null);
      });
  }, [
    afterPageMarker,
    conversationId,
    messagesStatus.loading,
    routeSelection.status,
    runWorkspaceAction,
    runtimeContext,
  ]);

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
  const openWorkspaceUserProfile = rightDrawer?.openWorkspaceUserProfile;
  const handleOpenMentionUser = useCallback(
    (userUuid: string) => {
      openWorkspaceUserProfile?.(userUuid);
    },
    [openWorkspaceUserProfile],
  );

  const headerProps = useMemo<ChatHeaderProps>(() => {
    if (headerView.kind === "directPrivate" && workspaceMeetUrl != null) {
      return {
        ...chatHeaderContentProps,
        onCallClick: handleStartWorkspaceHeaderCall,
      };
    }

    return chatHeaderContentProps;
  }, [chatHeaderContentProps, handleStartWorkspaceHeaderCall, headerView.kind, workspaceMeetUrl]);

  let body: React.ReactNode;
  if (selection.status === "invalid-route") {
    body = (
      <WorkspaceChatState
        title={t("workspaceMessenger.invalidRoute")}
        detail={t("workspaceMessenger.invalidRouteHint")}
      />
    );
  } else if (routeSelection.status === "message" && selection.status !== "conversation") {
    body =
      messageRouteLoading || !hasCurrentMessageRouteState || actionError == null ? (
        <WorkspaceChatBlockingLoader />
      ) : (
        <WorkspaceChatState title={t("chat.messagesLoadError")} detail={actionError ?? undefined} />
      );
  } else if (selection.status === "none") {
    body = (
      <WorkspaceChatState
        title={t("workspaceMessenger.invalidRoute")}
        detail={t("workspaceMessenger.invalidRouteHint")}
      />
    );
  } else if (selection.status === "conversation") {
    body = (
      <ChatPageWorkspaceMessageListSection
        messagesLoading={messagesStatus.loading}
        hasInitialPayload={routeMessages.length > 0}
        messages={routeMessages}
        outgoingMessages={outgoingMessages}
        currentUserUuid={currentUserUuid}
        conversationId={selection.conversationId}
        scrollToBottomKey={`${selection.conversationId}:${activeFocusedMessageUuid ?? ""}`}
        onLoadOlder={handleLoadOlder}
        isLoadingOlder={
          messagesStatus.loading &&
          routeMessages.length > 0 &&
          windowPaginationDirection !== "after"
        }
        isLoadingNewer={
          messagesStatus.loading &&
          routeMessages.length > 0 &&
          windowPaginationDirection === "after"
        }
        onLoadNewer={handleLoadNewer}
        hasOlderMessages={
          routeSelection.status === "message" ? beforePageMarker != null : messagesStatus.hasMore
        }
        hasNewerMessages={routeSelection.status === "message" && afterPageMarker != null}
        firstUnreadUuid={firstUnreadMessage?.uuid}
        unreadCount={unreadCount}
        focusedMessageUuid={activeFocusedMessageUuid}
        selectionMode={selectionMode}
        selectedMessageUuids={selectedMessageUuids}
        onUnreadMessagesVisible={scheduleReadBatch}
        onUnreadMessagesAtBottom={scheduleReadBatch}
        onReplyMessage={handleReplyMessage}
        onForwardMessage={handleForwardMessage}
        onOpenMentionUser={openWorkspaceUserProfile == null ? undefined : handleOpenMentionUser}
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
        jitsiServerBaseUrl={workspaceMeetUrl}
        jitsiLocationName={jitsiLocationName}
        onOpenJitsiCall={handleOpenWorkspaceJitsiCall}
        messagesLoadError={messagesLoadError}
        onRetryMessagesLoad={retry}
        boundaryLoadFailed={false}
        onDismissBoundaryLoadFailed={noop}
        scrollToBottomAfterSendNonce={scrollToBottomAfterSendNonce}
        resolveAuthorLabel={resolveAuthorLabel}
        resolveMention={resolveMention}
      />
    );
  } else {
    body = (
      <WorkspaceChatState
        title={t("workspaceMessenger.invalidRoute")}
        detail={t("workspaceMessenger.invalidRouteHint")}
      />
    );
  }

  return (
    <div
      className="flex max-h-full min-h-0 min-w-0 max-w-chat-page flex-1 flex-col overflow-hidden"
      data-testid="chat-page"
    >
      <ChatHeader
        {...headerProps}
        onOpenSearch={openSearch ?? undefined}
        onToggleRightPanel={rightDrawer == null ? undefined : handleToggleRightPanel}
        onOpenRightPanel={rightDrawer == null ? undefined : handleOpenRightPanel}
        rightPanelOpen={rightDrawer?.open ?? false}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {body}
        <ChatPageSelectionBar
          selectedCount={selectedMessageUuids.size}
          forwardDisabled={selectedMessageUuids.size === 0}
          deleteDisabled
          onForward={handleForwardSelectedMessages}
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
          draftInitialValue={undefined}
          onComposerValueChange={noop}
          onEditLastMessage={handleEditLastMessage}
          editSession={composerEditSession}
          onSubmitEdit={handleSubmitEdit}
          onCancelEdit={handleCancelEdit}
          composerCapabilities={workspaceComposerCapabilities}
          resolveMention={resolveMention}
          onLoadWorkspaceFilePreview={handleLoadWorkspaceFilePreview}
          aiMessagesContext={[]}
          aiChatContext={undefined}
          readOnlyReason={composerReadOnlyReason}
        />
      </section>
    </div>
  );
};
