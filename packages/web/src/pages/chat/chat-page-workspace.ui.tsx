import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavigationType, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import {
  deleteWorkspaceComposerDraftFromServer,
  syncWorkspaceComposerDraft,
} from "~/entities/composer-draft/composer-draft-sync.lib";
import {
  createWorkspaceComposerDraftKey,
  EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT,
  isWorkspaceComposerDraftContentEmpty,
} from "~/entities/composer-draft/composer-draft.lib";
import {
  selectWorkspaceComposerDraft,
  useWorkspaceComposerDraftStore,
} from "~/entities/composer-draft/composer-draft.model";
import type { WorkspaceComposerDraftContent } from "~/entities/composer-draft/composer-draft.types";
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
  isMessengerUuid,
  parseMessengerConversationId,
  selectMessengerConversationFromWorkspaceRoute,
} from "~/entities/messenger/messenger-ids.lib";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  sendMessengerMessage,
} from "~/entities/messenger/messenger-message-actions.lib";
import { toggleMessengerMessageReaction } from "~/entities/messenger/messenger-message-reactions-actions.lib";
import {
  applyMessengerMessageWindow,
  fetchMessengerMessageWindow,
  loadMessengerConversationMessages,
  loadMessengerMessageWindowPage,
  resolveMessengerMessageAnchor,
} from "~/entities/messenger/messenger-messages-loader.lib";
import { useMessengerOutboxStore } from "~/entities/messenger/messenger-outbox.model";
import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { isWorkspaceSelfChat } from "~/entities/messenger/messenger-self-chat.lib";
import { selectMessengerSidebarTopicsForStream } from "~/entities/messenger/messenger-sidebar.lib";
import { useMessengerStreamBindingsForRoute } from "~/entities/messenger/messenger-stream-bindings-loader.lib";
import { normalizeWorkspacePreviewBlob } from "~/entities/messenger/messenger-workspace-message-preview-blob.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerStream,
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
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { createJitsiCallKey, useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { buildWorkspaceJitsiMeetingUrl } from "~/features/jitsi-call/workspace-jitsi-call.lib";
import { useWorkspaceMediaViewer } from "~/features/media-viewer/workspace-media-viewer.hook";
import {
  WorkspaceComposerAttachments,
  type WorkspaceComposerAttachmentTarget,
  type WorkspaceComposerControlledProps,
} from "~/features/workspace-composer-attachments/workspace-composer-attachments.ui";
import {
  appendWorkspaceComposerExistingAttachmentMarkdown,
  extractWorkspaceComposerEditContent,
  type WorkspaceComposerExistingAttachment,
} from "~/features/workspace-composer-attachments/workspace-composer-edit-attachments.lib";
import {
  deriveWorkspaceDownloadFileName,
  startWorkspaceFileDownload,
} from "~/features/workspace-file-download/workspace-file-download.lib";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { useWorkspaceMessageAnchorNavigation } from "~/features/workspace-message-anchor-navigation/workspace-message-anchor-navigation.hook";
import type {
  WorkspaceMessageAnchorFocusTarget,
  WorkspaceMessageAnchorNavigationIntent,
  WorkspaceMessageAnchorPreviewPresentation,
  WorkspaceMessageAnchorRouteRequest,
} from "~/features/workspace-message-anchor-navigation/workspace-message-anchor-navigation.types";
import { useWorkspaceVisibleMessageRead } from "~/features/workspace-message-read/workspace-visible-message-read.hook";
import { createWorkspaceReplyEditRestoreController } from "~/features/workspace-reply/workspace-reply-edit-restore.lib";
import {
  addWorkspaceReplyTab,
  buildWorkspaceReplyMarkdown,
  removeWorkspaceReplyTab,
  reorderWorkspaceReplyTab,
  replyToWorkspaceReply,
  selectWorkspaceReplyTab,
  setWorkspaceReplyAnswer,
} from "~/features/workspace-reply/workspace-reply.lib";
import { EMPTY_WORKSPACE_REPLY_SESSION } from "~/features/workspace-reply/workspace-reply.model";
import type {
  WorkspaceReplyQuote,
  WorkspaceReplySession,
  WorkspaceReplyTab,
} from "~/features/workspace-reply/workspace-reply.types";
import type { WorkspaceReplyTabSelectSource } from "~/features/workspace-reply/workspace-reply.ui";
import { t } from "~/i18n/i18n";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { createLogger } from "~/shared/lib/logger";
import { countUnicodeCodePoints } from "~/shared/lib/unicode-string.lib";
import {
  createWorkspaceFileResourceCache,
  type WorkspaceFileResourceCache,
} from "~/shared/lib/workspace-file-loader.lib";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolution,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import {
  parseWorkspaceMessengerMessageAnchor,
  workspaceMessengerMessageAnchor,
  workspaceMessengerMessageRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
  type WorkspaceMessengerRouteMatch,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Spinner } from "~/shared/ui/spinner.ui";
import { ChatChannelHeader } from "~/widgets/chat-view/chat-header-channel.ui";
import { ChatDirectHeader } from "~/widgets/chat-view/chat-header-direct.ui";
import { ChatFavoritesHeader } from "~/widgets/chat-view/chat-header-favorites.ui";
import type { ChatHeaderCommonProps } from "~/widgets/chat-view/chat-header.types";
import type {
  ComposerEditSession,
  MessageComposerCapabilities,
  MessageComposerReplyClearReason,
  MessageComposerSendResult,
  ReplyQuote,
} from "~/widgets/message-composer/message-composer.types";
import { WorkspaceMessageAnchorTransition } from "~/widgets/workspace-message-list/workspace-message-anchor-transition.ui";
import type { WorkspaceMessageConversationReference } from "~/widgets/workspace-message-list/workspace-message-list.types";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";
import { ChatPageStreamTopicPrompt } from "./chat-page-stream-topic-prompt.ui";
import { ChatPageWorkspaceMessageListSection } from "./chat-page-workspace-message-list-section.ui";
import { useWorkspaceTransientRenderKeys } from "./chat-page-workspace-transient-render-keys.hook";
import type { WorkspaceChatMessagesLoadErrorKind } from "./chat-page-workspace-message-list-section.types";

interface WorkspaceChatPageProps {
  route: WorkspaceMessengerRouteMatch | null;
  presentation?: "default" | "favorites";
}

const WORKSPACE_MESSAGE_MAX_LENGTH = 40_000;

interface WorkspaceFilePreviewResource {
  blob: Blob;
  headers: Headers;
}

interface WorkspaceComposerSendCleanup {
  ownerKey: string;
  conversationId: string;
  snapshotId: string;
  ignoresValueClear: boolean;
  ignoresReplyClear: boolean;
}

interface WorkspaceTailWindowRequest {
  controller: AbortController;
  conversationId: MessengerConversationId;
  messageUuid: MessengerUuid;
  requestToken: symbol;
  scopeKey: string;
}

interface WorkspaceTailWindowIntent {
  messageUuid: MessengerUuid;
  promise: Promise<void>;
  resolve: () => void;
  scopeKey: string;
  settled: boolean;
}

interface WorkspaceAnchorPaginationRequest {
  controller: AbortController;
  conversationId: MessengerConversationId;
  direction: "before" | "after";
  intentId: number;
  token: symbol;
}

const EMPTY_MESSAGES: MessengerMessage[] = [];
const EMPTY_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
const EMPTY_OUTGOING_MESSAGES: MessengerOutgoingMessage[] = [];
const EMPTY_OUTGOING_MESSAGE_LOCAL_IDS: readonly string[] = [];
const EMPTY_USERS_BY_ID: UsersById = {};
const WORKSPACE_COMPOSER_EDIT_SESSION_ID = 1;
const workspacePreviewLoaderLog = createLogger("chat-page:workspace-preview-loader");
const workspaceComposerDraftLog = createLogger("chat-page:workspace-composer-draft");

const noop = () => undefined;

function normalizeWorkspaceMentionLookupText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function normalizeWorkspaceActionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function workspaceConversationRoute({
  organizationId,
  projectId,
  conversationId,
}: {
  organizationId: string;
  projectId: string;
  conversationId: MessengerConversationId;
}): string | null {
  const parsedConversationId = parseMessengerConversationId(conversationId);
  if (parsedConversationId == null) return null;

  const route =
    parsedConversationId.kind === "topic"
      ? workspaceMessengerTopicRoute({
          orgId: organizationId,
          projectId,
          streamUuid: parsedConversationId.streamUuid,
          topicUuid: parsedConversationId.topicUuid,
        })
      : workspaceMessengerStreamRoute({
          orgId: organizationId,
          projectId,
          streamUuid: parsedConversationId.streamUuid,
        });

  return route;
}

function workspaceConversationMessageRoute({
  messageUuid,
  ...conversation
}: {
  organizationId: string;
  projectId: string;
  conversationId: MessengerConversationId;
  messageUuid: MessengerUuid;
}): string | null {
  const route = workspaceConversationRoute(conversation);
  return route == null ? null : `${route}${workspaceMessengerMessageAnchor(messageUuid)}`;
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

function shouldPresentWorkspaceFavorites({
  presentation,
  selection,
  streamsById,
  currentUserUuid,
}: {
  presentation: WorkspaceChatPageProps["presentation"];
  selection: ReturnType<typeof selectMessengerConversationFromWorkspaceRoute>;
  streamsById: Readonly<Record<string, MessengerStream>>;
  currentUserUuid: string | undefined;
}): boolean {
  if (presentation === "favorites") return true;
  if (selection.status !== "conversation") return false;

  return isWorkspaceSelfChat(streamsById[selection.streamUuid], currentUserUuid);
}

type WorkspaceConversationHeaderProps = Readonly<{
  isFavoritesConversation: boolean;
  headerView: ReturnType<typeof selectWorkspaceChatHeaderView>;
  commonHeaderProps: ChatHeaderCommonProps;
  onOpenPartnerProfile?: () => void;
  onCallClick?: () => void;
  onOpenRightPanel?: () => void;
}>;

function WorkspaceConversationHeader({
  isFavoritesConversation,
  headerView,
  commonHeaderProps,
  onOpenPartnerProfile,
  onCallClick,
  onOpenRightPanel,
}: WorkspaceConversationHeaderProps): React.ReactElement {
  if (isFavoritesConversation) return <ChatFavoritesHeader />;

  if (headerView.kind === "directPrivate") {
    return (
      <ChatDirectHeader
        {...commonHeaderProps}
        partner={headerView.dmPartner}
        rightPanelLabel={t("info.partnerInfo")}
        onOpenPartnerProfile={onOpenPartnerProfile}
        onCallClick={onCallClick}
      />
    );
  }

  return (
    <ChatChannelHeader
      {...commonHeaderProps}
      channelName={headerView.channelName}
      topic={headerView.topic}
      hideTopic={headerView.hideTopic}
      participantsCount={headerView.participantsCount}
      onlineCount={headerView.onlineCount}
      onOpenRightPanel={onOpenRightPanel}
    />
  );
}

function useCloseFavoritesRightDrawer(
  isFavoritesConversation: boolean,
  setOpen: ((open: boolean) => void) | undefined,
): void {
  useEffect(() => {
    if (isFavoritesConversation) {
      setOpen?.(false);
    }
  }, [isFavoritesConversation, setOpen]);
}

function resolveActiveMessageFocusTarget({
  focusTarget,
  navigationIntent,
  selection,
}: {
  focusTarget: WorkspaceMessageAnchorFocusTarget | null;
  navigationIntent: WorkspaceMessageAnchorNavigationIntent | null;
  selection: ReturnType<typeof selectMessengerConversationFromWorkspaceRoute>;
}): WorkspaceMessageAnchorFocusTarget | null {
  if (focusTarget == null || navigationIntent == null || selection.status !== "conversation") {
    return null;
  }

  const matchesCurrentIntent =
    focusTarget.intentId === navigationIntent.id &&
    focusTarget.messageUuid === navigationIntent.messageUuid &&
    focusTarget.focusAttempt === navigationIntent.focusAttempt;
  const rendersTargetConversation = navigationIntent.conversationId === selection.conversationId;

  return matchesCurrentIntent && rendersTargetConversation ? focusTarget : null;
}

function buildWorkspaceMessageScrollKey({
  conversationId,
  focusTarget,
  messageAnchorUuid,
  locationKey,
}: {
  conversationId: MessengerConversationId;
  focusTarget: WorkspaceMessageAnchorFocusTarget | null;
  messageAnchorUuid: MessengerUuid | null;
  locationKey: string;
}): string {
  if (focusTarget != null) {
    return `${conversationId}:${focusTarget.intentId}:${focusTarget.messageUuid}:${focusTarget.focusAttempt}`;
  }

  return `${conversationId}::::${messageAnchorUuid == null ? "" : locationKey}`;
}

function isAnchorHandoffPending({
  previewPresentation,
  navigationIntent,
  focusTarget,
  selection,
}: {
  previewPresentation: WorkspaceMessageAnchorPreviewPresentation | null;
  navigationIntent: WorkspaceMessageAnchorNavigationIntent | null;
  focusTarget: WorkspaceMessageAnchorFocusTarget | null;
  selection: ReturnType<typeof selectMessengerConversationFromWorkspaceRoute>;
}): boolean {
  if (
    previewPresentation?.phase !== "awaiting-dom" ||
    navigationIntent?.phase !== "awaiting-dom" ||
    focusTarget == null ||
    selection.status !== "conversation"
  ) {
    return false;
  }

  return (
    focusTarget.intentId === previewPresentation.intentId &&
    focusTarget.intentId === navigationIntent.id &&
    focusTarget.messageUuid === previewPresentation.messageUuid &&
    focusTarget.messageUuid === navigationIntent.messageUuid &&
    focusTarget.focusAttempt === navigationIntent.focusAttempt &&
    navigationIntent.conversationId === selection.conversationId
  );
}

export const WorkspaceChatPage: React.FC<WorkspaceChatPageProps> = ({
  route,
  presentation = "default",
}) => {
  // This page is not a new chat layout: it assembles old sections and swaps only the data source.
  const [retryNonce, setRetryNonce] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [windowPaginationDirection, setWindowPaginationDirection] = useState<
    "before" | "after" | "tail" | null
  >(null);
  const [windowPaginationErrorDirection, setWindowPaginationErrorDirection] = useState<
    "before" | "after" | null
  >(null);
  const [composerEditSession, setComposerEditSession] = useState<ComposerEditSession | null>(null);
  const [composerEditMessageUuid, setComposerEditMessageUuid] = useState<string | null>(null);
  const [composerEditAttachments, setComposerEditAttachments] = useState<
    WorkspaceComposerExistingAttachment[]
  >([]);
  const [restoredWorkspaceReplySession, setRestoredWorkspaceReplySession] =
    useState<WorkspaceReplySession | null>(null);
  const [pendingDeleteMessageUuid, setPendingDeleteMessageUuid] = useState<string | null>(null);
  const [selectedMessageUuids, setSelectedMessageUuids] = useState<Set<string>>(() => new Set());
  const [hydratedComposerDraftScopeKey, setHydratedComposerDraftScopeKey] = useState<string | null>(
    null,
  );
  const [workspaceComposerDraftShadow, setWorkspaceComposerDraftShadow] = useState<{
    scopeKey: string;
    content: WorkspaceComposerDraftContent;
  } | null>(null);
  const [workspaceReplyTabFocusKeySuppressed, setWorkspaceReplyTabFocusKeySuppressed] =
    useState(false);
  const [scrollToBottomAfterSendNonce, setScrollToBottomAfterSendNonce] = useState(0);
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const location = useLocation();
  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    // The messenger owns nested scroll positioning for tail, unread, and anchor routes.
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);
  const messageAnchorUuid = useMemo(() => {
    const parsed = parseWorkspaceMessengerMessageAnchor(location.hash);
    return isMessengerUuid(parsed) ? parsed : null;
  }, [location.hash]);
  const actionAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const queuedTailMessageUuidRef = useRef<MessengerUuid | null>(null);
  const tailWindowIntentRef = useRef<WorkspaceTailWindowIntent | null>(null);
  const tailWindowRequestRef = useRef<WorkspaceTailWindowRequest | null>(null);
  const cancelAnchorTailRef = useRef<() => void>(noop);
  const anchorPaginationRequestRef = useRef<WorkspaceAnchorPaginationRequest | null>(null);
  const cancelAnchorPaginationRef = useRef<() => void>(noop);
  const pendingTailBaseRouteRef = useRef<{
    baseRoute: string;
    sourceLocationKey: string;
  } | null>(null);
  const pendingWorkspaceJitsiHeaderCallRef = useRef(false);
  const workspaceComposerSendCleanupRef = useRef<WorkspaceComposerSendCleanup | null>(null);
  const workspaceComposerDraftShadowRef = useRef<{
    scopeKey: string;
    content: WorkspaceComposerDraftContent;
  } | null>(null);
  const workspaceReplyTabSequenceRef = useRef(0);
  const workspaceReplyEditRestoreController = useMemo(
    () => createWorkspaceReplyEditRestoreController(),
    [],
  );
  const workspaceFileResourceCache = useMemo<WorkspaceFileResourceCache>(
    () => createWorkspaceFileResourceCache(),
    [],
  );
  const openWorkspaceForward = useWorkspaceForwardMessageStore((state) => state.open);
  const routeSelection = useMemo(
    () => selectMessengerConversationFromWorkspaceRoute(route),
    [route],
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
  const anyWorkspaceMessageWindowLoading = useWorkspaceMessageStore(
    (state) =>
      state.ownerKey === ownerKey &&
      Object.values(state.messagesLoadingByConversationId).some(Boolean),
  );
  const anchorRouteRequest = useMemo<WorkspaceMessageAnchorRouteRequest | null>(() => {
    if (route == null) return null;
    const scope = { organizationId: route.orgId, projectId: route.projectId };
    if (routeSelection.status === "message") {
      return {
        messageUuid: routeSelection.messageUuid,
        conversationId: null,
        routeKey: location.key,
        source: navigationType === NavigationType.Pop ? "browser-history" : "direct-route",
        scope,
      };
    }
    if (routeSelection.status === "conversation" && messageAnchorUuid != null) {
      return {
        messageUuid: messageAnchorUuid,
        conversationId: routeSelection.conversationId,
        routeKey: location.key,
        source: navigationType === NavigationType.Pop ? "browser-history" : "hash",
        scope,
      };
    }
    return null;
  }, [location.key, messageAnchorUuid, navigationType, route, routeSelection]);
  const getCurrentWorkspaceRuntimeContext = useCallback(
    () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
    [],
  );
  const resolveKnownAnchorConversationId = useCallback(
    (messageUuid: MessengerUuid): MessengerConversationId | null => {
      const state = useWorkspaceMessageStore.getState();
      if (state.ownerKey !== ownerKey) return null;
      return selectWorkspaceMessageById(state, messageUuid)?.conversationId ?? null;
    },
    [ownerKey],
  );
  const isAnchorMessageInWindow = useCallback(
    (targetConversationId: MessengerConversationId, messageUuid: MessengerUuid): boolean => {
      const state = useWorkspaceMessageStore.getState();
      return (
        state.ownerKey === ownerKey &&
        selectWorkspaceMessagesForConversation(state, targetConversationId).some(
          (message) => message.uuid === messageUuid,
        )
      );
    },
    [ownerKey],
  );
  const isAnchorMessageWindowReady = useCallback(
    (targetConversationId: MessengerConversationId, messageUuid: MessengerUuid): boolean => {
      const state = useWorkspaceMessageStore.getState();
      return (
        state.ownerKey === ownerKey &&
        (state.conversationWindowsById[targetConversationId]?.messageUuids.includes(messageUuid) ??
          false)
      );
    },
    [ownerKey],
  );
  const buildDirectAnchorRoute = useCallback(
    (messageUuid: MessengerUuid): string =>
      runtimeContext == null
        ? location.pathname
        : workspaceMessengerMessageRoute({
            orgId: runtimeContext.organizationId,
            projectId: runtimeContext.projectId,
            messageUuid,
          }),
    [location.pathname, runtimeContext],
  );
  const buildConversationAnchorRoute = useCallback(
    (targetConversationId: MessengerConversationId, messageUuid: MessengerUuid): string | null =>
      runtimeContext == null
        ? null
        : workspaceConversationMessageRoute({
            organizationId: runtimeContext.organizationId,
            projectId: runtimeContext.projectId,
            conversationId: targetConversationId,
            messageUuid,
          }),
    [runtimeContext],
  );
  const cancelTailForAnchor = useCallback(() => {
    cancelAnchorTailRef.current();
    cancelAnchorPaginationRef.current();
  }, []);
  const {
    intent: messageNavigationIntent,
    focusTarget: messageNavigationFocusTarget,
    navigationError,
    previewPresentation,
    startMessageNavigation,
    retryMessageNavigation,
    onDomFocusApplied,
    onDomFocusMissing,
    cancelForTail: cancelMessageNavigationForTail,
  } = useWorkspaceMessageAnchorNavigation({
    runtimeContext,
    routeRequest: anchorRouteRequest,
    routePath: `${location.pathname}${location.hash}`,
    windowBusy: anyWorkspaceMessageWindowLoading || windowPaginationDirection != null,
    getRuntimeContext: getCurrentWorkspaceRuntimeContext,
    resolveKnownConversationId: resolveKnownAnchorConversationId,
    isMessageInWindow: isAnchorMessageInWindow,
    isMessageWindowReady: isAnchorMessageWindowReady,
    navigate,
    buildDirectRoute: buildDirectAnchorRoute,
    buildConversationRoute: buildConversationAnchorRoute,
    cancelTail: cancelTailForAnchor,
    unavailableError: t("chat.messageNavigationUnavailable"),
    domMissingError: t("chat.messageNavigationDomMissing"),
  });
  const activeMessageConversationId =
    routeSelection.status === "message" &&
    messageNavigationIntent?.messageUuid === routeSelection.messageUuid
      ? messageNavigationIntent.conversationId
      : null;
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
  const activeMessageFocusTarget = resolveActiveMessageFocusTarget({
    focusTarget: messageNavigationFocusTarget,
    navigationIntent: messageNavigationIntent,
    selection,
  });
  const workspaceMeetUrl = useWorkspaceJitsiSettingsStore((state) =>
    ownerKey == null ? null : (state.meetUrlsByOwnerKey[ownerKey] ?? null),
  );
  // Подписка нужна: если уже в этом ЛС, pending меняется без смены route/headerView.
  const pendingDmCallPartnerUserUuid = useChatDmCallBridgeStore(
    (state) => state.pendingDmCallPartnerUserUuid,
  );
  const conversationId = selection.status === "conversation" ? selection.conversationId : null;
  const tailRequestScopeKey = `${ownerKey ?? ""}:${runtimeContext?.runtimeGeneration ?? ""}:${
    conversationId ?? ""
  }`;
  useEffect(
    () => () => {
      workspaceReplyEditRestoreController.cancel();
    },
    [conversationId, runtimeContext, workspaceReplyEditRestoreController],
  );
  const workspaceComposerDraftScopeKey =
    ownerKey == null || conversationId == null
      ? null
      : createWorkspaceComposerDraftKey(ownerKey, conversationId);
  const requestedWorkspaceDraftUuid = useMemo(
    () => new URLSearchParams(location.search).get("draft_uuid"),
    [location.search],
  );
  const workspaceComposerDraft = useWorkspaceComposerDraftStore((state) =>
    selectWorkspaceComposerDraft(state, ownerKey, conversationId),
  );
  const composerDraftTopicsById = useMessengerStore((state) => state.topicsById);
  const composerDraftTarget = useMemo(() => {
    if (selection.status !== "conversation") return null;
    if (selection.kind === "topic") {
      return { streamUuid: selection.streamUuid, topicUuid: selection.topicUuid };
    }
    const defaultTopic = findDefaultTopic(composerDraftTopicsById, selection.streamUuid);
    return defaultTopic == null
      ? null
      : { streamUuid: selection.streamUuid, topicUuid: defaultTopic.uuid };
  }, [composerDraftTopicsById, selection]);
  const workspaceComposerContent =
    workspaceComposerDraftShadow?.scopeKey === workspaceComposerDraftScopeKey
      ? workspaceComposerDraftShadow.content
      : (workspaceComposerDraft?.content ?? EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT);
  const isRestoredWorkspaceReplyEdit = composerEditSession?.preserveWorkspaceReplyContext === true;
  const workspaceReplySession: WorkspaceReplySession = isRestoredWorkspaceReplyEdit
    ? (restoredWorkspaceReplySession ?? EMPTY_WORKSPACE_REPLY_SESSION)
    : workspaceComposerContent.replySession;
  const workspaceComposerText = workspaceComposerContent.text;
  const setComposerDraftShadow = useCallback(
    (scopeKey: string, content: WorkspaceComposerDraftContent): void => {
      const next = { scopeKey, content };
      workspaceComposerDraftShadowRef.current = next;
      setWorkspaceComposerDraftShadow(next);
    },
    [],
  );
  const updateWorkspaceComposerDraft = useCallback(
    (update: (content: WorkspaceComposerDraftContent) => WorkspaceComposerDraftContent): void => {
      if (ownerKey == null || conversationId == null || workspaceComposerDraftScopeKey == null)
        return;

      const currentDraft = selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      );
      const currentContent =
        workspaceComposerDraftShadowRef.current?.scopeKey === workspaceComposerDraftScopeKey
          ? workspaceComposerDraftShadowRef.current.content
          : (currentDraft?.content ?? EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT);
      const nextContent = update(currentContent);
      setComposerDraftShadow(workspaceComposerDraftScopeKey, nextContent);

      if (isWorkspaceComposerDraftContentEmpty(nextContent)) {
        if (currentDraft == null) return;

        // Keep the record until the entity queue has either deleted it or
        // recorded a conflict. Removing it here would lose the ETag needed
        // after an in-flight POST/PUT.
        if (runtimeContext != null) {
          const deletionQueued = deleteWorkspaceComposerDraftFromServer({
            runtimeContext,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            draft: currentDraft,
          });
          if (!deletionQueued) {
            workspaceComposerDraftLog.warn("Draft deletion was rejected after composer clear", {
              draftUuid: currentDraft.draftUuid,
              syncStatus: currentDraft.syncStatus,
              disposition: currentDraft.disposition,
            });
          }
          useWorkspaceComposerDraftStore
            .getState()
            .completeDraftVisit(ownerKey, conversationId, currentDraft.draftUuid);
          return;
        }

        useWorkspaceComposerDraftStore
          .getState()
          .clearDraftIfSnapshotMatches(ownerKey, conversationId, currentDraft.snapshotId);
        return;
      }

      const nextDraft = useWorkspaceComposerDraftStore
        .getState()
        .setDraft(ownerKey, conversationId, nextContent, composerDraftTarget ?? undefined);
      if (nextDraft == null || runtimeContext == null) return;

      void syncWorkspaceComposerDraft({
        runtimeContext,
        getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        draft: nextDraft,
      });
    },
    [
      composerDraftTarget,
      conversationId,
      ownerKey,
      runtimeContext,
      setComposerDraftShadow,
      workspaceComposerDraftScopeKey,
    ],
  );
  const setWorkspaceReplySession = useCallback(
    (
      next: WorkspaceReplySession | ((current: WorkspaceReplySession) => WorkspaceReplySession),
    ): void => {
      updateWorkspaceComposerDraft((content) => ({
        ...content,
        replySession: typeof next === "function" ? next(content.replySession) : next,
      }));
    },
    [updateWorkspaceComposerDraft],
  );
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
  let lastMessageUuid: MessengerUuid | null = null;
  if (selection.status === "conversation") {
    lastMessageUuid =
      selection.kind === "topic"
        ? (topic?.lastMessageUuid ?? conversation?.lastMessageUuid ?? null)
        : (stream?.lastMessageUuid ?? conversation?.lastMessageUuid ?? null);
  }
  const routeMessages = useWorkspaceMessageStore((state) =>
    conversationId == null || state.ownerKey !== ownerKey
      ? EMPTY_MESSAGES
      : selectWorkspaceMessagesForConversation(state, conversationId),
  );
  const {
    registerDeliveredOutgoingMessage,
    removeServerMessageRenderKey,
    resolveServerMessageRenderKey,
  } = useWorkspaceTransientRenderKeys({ ownerKey, conversationId, messages: routeMessages });
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
    conversationId == null || state.ownerKey !== ownerKey
      ? selectWorkspaceMessageStatusForConversation(state, "")
      : selectWorkspaceMessageStatusForConversation(state, conversationId),
  );
  const conversationWindow = useWorkspaceMessageStore((state) =>
    conversationId == null || state.ownerKey !== ownerKey
      ? null
      : (state.conversationWindowsById[conversationId] ?? null),
  );
  const realtimeReadyRuntimeGeneration = useMessengerStore(
    (state) => state.realtimeReadyRuntimeGeneration,
  );
  const realtimeReadyOwnerKey = useMessengerStore((state) => state.realtimeReadyOwnerKey);
  const beforePageMarker = conversationWindow?.beforePageMarker ?? null;
  const afterPageMarker = conversationWindow?.afterPageMarker ?? null;
  const usersById = useUsersStore((state) =>
    Object.keys(state.usersById).length > 0 ? state.usersById : EMPTY_USERS_BY_ID,
  );
  const topicsById = useMessengerStore((state) => state.topicsById);
  const topicIds = useMessengerStore((state) => state.topicIds);
  const allWorkspaceMessagesById = useWorkspaceMessageStore((state) =>
    state.ownerKey === ownerKey ? state.messagesById : EMPTY_MESSAGES_BY_ID,
  );
  const streamsById = useMessengerStore((state) => state.streamsById);
  const isFavoritesConversation = shouldPresentWorkspaceFavorites({
    presentation,
    selection,
    streamsById,
    currentUserUuid: runtimeContext?.userUuid,
  });
  useCloseFavoritesRightDrawer(isFavoritesConversation, rightDrawer?.setOpen);
  const streamPromptTopics = useMemo(() => {
    if (
      selection.status !== "conversation" ||
      selection.kind !== "stream" ||
      runtimeContext == null
    ) {
      return [];
    }

    return selectMessengerSidebarTopicsForStream({
      organizationId: runtimeContext.organizationId,
      projectId: runtimeContext.projectId,
      state: { topicIds, topicsById },
      streamUuid: selection.streamUuid,
      streamNotificationMode: streamsById[selection.streamUuid]?.notificationMode ?? null,
      messagesById: allWorkspaceMessagesById,
      usersById,
      currentUserUuid: runtimeContext.userUuid,
    }).filter((topic) => topic.title.trim().length > 0);
  }, [
    allWorkspaceMessagesById,
    runtimeContext,
    selection,
    streamsById,
    topicIds,
    topicsById,
    usersById,
  ]);
  const messageListPresentation = useMemo(() => {
    if (selection.status !== "conversation" || selection.kind !== "stream") {
      return undefined;
    }

    return { topicDividers: true, topicLabels: true } as const;
  }, [selection]);
  const resolveMessageTopicLabel = useMemo<
    ((messageTopicUuid: MessengerUuid) => string | null) | undefined
  >(() => {
    if (messageListPresentation == null) {
      return undefined;
    }

    return (messageTopicUuid: MessengerUuid) => {
      const topicName = topicsById[messageTopicUuid]?.name.trim() ?? "";
      return topicName.length > 0 ? topicName : null;
    };
  }, [messageListPresentation, topicsById]);
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
          currentUserUuid: runtimeContext?.userUuid ?? null,
        },
      ),
    [
      conversationsById,
      route,
      runtimeContext?.userUuid,
      streamBindingIdsByStreamId,
      streamBindingsById,
      streamsById,
      topicsById,
      usersById,
    ],
  );
  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  const retryMessagesLoad = useCallback(() => {
    if (messageNavigationIntent?.phase === "failed") {
      retryMessageNavigation();
      return;
    }
    retry();
  }, [messageNavigationIntent?.phase, retry, retryMessageNavigation]);
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
      messageAnchorUuid != null ||
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
  }, [messageAnchorUuid, retryNonce, routeSelection.status, runtimeContext, selection]);

  useEffect(() => {
    if (selection.status !== "conversation" || runtimeContext == null || ownerKey == null) return;

    const conversationId = selection.conversationId;
    let previousWindow =
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId] ?? null;
    let reloadController: AbortController | null = null;
    const unsubscribe = useWorkspaceMessageStore.subscribe((state) => {
      const nextWindow =
        state.ownerKey === ownerKey
          ? (state.conversationWindowsById[conversationId] ?? null)
          : null;
      const windowWasReset =
        previousWindow != null && nextWindow == null && state.ownerKey === ownerKey;
      previousWindow = nextWindow;
      if (!windowWasReset) return;

      if (messageAnchorUuid != null || routeSelection.status === "message") {
        retryMessageNavigation();
        return;
      }

      reloadController?.abort();
      reloadController = new AbortController();
      void loadMessengerConversationMessages({
        runtimeContext,
        conversationId,
        getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        signal: reloadController.signal,
      });
    });

    return () => {
      unsubscribe();
      reloadController?.abort();
    };
  }, [
    messageAnchorUuid,
    ownerKey,
    retryMessageNavigation,
    routeSelection.status,
    runtimeContext,
    selection,
  ]);

  useEffect(() => {
    return () => {
      for (const controller of actionAbortControllersRef.current) {
        controller.abort();
      }
      actionAbortControllersRef.current.clear();
      pendingWorkspaceJitsiHeaderCallRef.current = false;
      workspaceFileResourceCache.clear();
    };
  }, [workspaceFileResourceCache]);

  useEffect(() => {
    return () => {
      for (const controller of actionAbortControllersRef.current) {
        controller.abort();
      }
      actionAbortControllersRef.current.clear();
      pendingWorkspaceJitsiHeaderCallRef.current = false;
      workspaceFileResourceCache.clear();
    };
  }, [conversationId, runtimeContext, workspaceFileResourceCache]);

  useEffect(() => {
    if (ownerKey == null || conversationId == null || workspaceComposerDraftScopeKey == null) {
      setHydratedComposerDraftScopeKey(null);
      workspaceComposerDraftShadowRef.current = null;
      setWorkspaceComposerDraftShadow(null);
      return;
    }

    let isCurrentScope = true;
    setHydratedComposerDraftScopeKey(null);

    void useWorkspaceComposerDraftStore
      .getState()
      .hydrateDraft(ownerKey, conversationId, requestedWorkspaceDraftUuid)
      .then((draft) => {
        if (!isCurrentScope) return;

        const localShadow = workspaceComposerDraftShadowRef.current;
        setComposerDraftShadow(
          workspaceComposerDraftScopeKey,
          localShadow?.scopeKey === workspaceComposerDraftScopeKey
            ? localShadow.content
            : (draft?.content ?? EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT),
        );
      })
      .finally(() => {
        if (isCurrentScope) {
          setHydratedComposerDraftScopeKey(workspaceComposerDraftScopeKey);
        }
      });

    return () => {
      isCurrentScope = false;
      const selected = selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      );
      if (selected != null) {
        void useWorkspaceComposerDraftStore.getState().flushDraft(ownerKey, selected.draftUuid);
      }
      useWorkspaceComposerDraftStore.getState().leaveConversation(ownerKey, conversationId);
    };
  }, [
    conversationId,
    ownerKey,
    runtimeContext?.runtimeGeneration,
    requestedWorkspaceDraftUuid,
    setComposerDraftShadow,
    workspaceComposerDraftScopeKey,
  ]);

  useEffect(() => {
    setPendingDeleteMessageUuid(null);
    setSelectedMessageUuids(new Set());
    setRestoredWorkspaceReplySession(null);
    setComposerEditSession(null);
    setComposerEditMessageUuid(null);
    setComposerEditAttachments([]);
    setWorkspaceReplyTabFocusKeySuppressed(false);
    workspaceComposerSendCleanupRef.current = null;
  }, [conversationId, ownerKey]);

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
  const initialPositionReady =
    runtimeContext != null &&
    ownerKey != null &&
    conversationWindow != null &&
    (activeMessageFocusTarget != null ||
      (realtimeReadyOwnerKey === ownerKey &&
        realtimeReadyRuntimeGeneration === runtimeContext.runtimeGeneration));
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
    (localId: string): Promise<boolean> => {
      const outgoing = useMessengerOutboxStore.getState().outgoingMessagesByLocalId[localId];
      if (outgoing == null) return Promise.resolve(false);

      if (runtimeContext == null || ownerKey == null || outgoing.ownerKey !== ownerKey) {
        useMessengerOutboxStore
          .getState()
          .markOutgoingMessageFailed(localId, t("workspaceMessenger.runtimeUnavailable"));
        return Promise.resolve(false);
      }

      useMessengerOutboxStore.getState().markOutgoingMessageSending(localId);

      return runWorkspaceAction(async (signal) => {
        try {
          const markdown = outgoing.markdown;
          if (markdown.trim().length === 0) {
            useMessengerOutboxStore.getState().removeOutgoingMessage(localId);
            return false;
          }

          const result = await sendMessengerMessage({
            runtimeContext,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            signal,
            streamUuid: outgoing.streamUuid,
            topicUuid: outgoing.topicUuid,
            markdown,
            includeStreamConversation: outgoing.includeStreamConversation,
            onBeforeMessageIndexed: (message) => {
              registerDeliveredOutgoingMessage(
                outgoing.ownerKey,
                outgoing.conversationId,
                message.uuid,
                localId,
              );
            },
          });

          if (result.status === "applied" && result.message != null) {
            useMessengerOutboxStore.getState().removeOutgoingMessage(localId);
            return true;
          }

          useMessengerOutboxStore
            .getState()
            .markOutgoingMessageFailed(localId, t("message.sendFailed"));
          return false;
        } catch (error) {
          useMessengerOutboxStore
            .getState()
            .markOutgoingMessageFailed(
              localId,
              normalizeWorkspaceActionError(error, t("message.sendFailed")),
            );
          return false;
        }
      });
    },
    [ownerKey, registerDeliveredOutgoingMessage, runWorkspaceAction, runtimeContext],
  );

  const handleSend = useCallback(
    (content: string) => {
      // The shared composer shell sends only through Workspace POST /messages/.
      setSendError(null);
      if (countUnicodeCodePoints(content) > WORKSPACE_MESSAGE_MAX_LENGTH) {
        const error = t("composer.messageTooLong");
        setSendError(error);
        throw new Error(error);
      }
      if (runtimeContext == null) {
        const error = t("workspaceMessenger.runtimeUnavailable");
        setSendError(error);
        throw new Error(error);
      }
      if (conversationId == null) {
        const error = t("workspaceMessenger.routeUnsupportedForSend");
        setSendError(error);
        throw new Error(error);
      }

      const target = resolveSendTarget();
      if (target.status === "blocked") {
        setSendError(target.error);
        throw new Error(target.error);
      }

      const sendOwnerKey = workspaceRuntimeOwnerKey(runtimeContext);
      if (content.trim().length === 0) return;
      const draftAtSend = selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        sendOwnerKey,
        conversationId,
      );

      const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
        ownerKey: sendOwnerKey,
        conversationId: target.includeStreamConversation
          ? conversationIdForStream(target.streamUuid)
          : conversationIdForTopic(target.streamUuid, target.topicUuid),
        projectId: runtimeContext.projectId,
        streamUuid: target.streamUuid,
        topicUuid: target.topicUuid,
        authorUuid: runtimeContext.userUuid,
        markdown: content,
        sourceMarkdown: content,
        status: "sending",
        includeStreamConversation: target.includeStreamConversation,
      });

      // Scroll right after the local row appears. A later server snapshot can
      // move it by backend created_at, but the user already sees the send happened.
      setScrollToBottomAfterSendNonce((value) => value + 1);
      return deliverOutgoingMessage(outgoing.localId).then((sent) => {
        if (!sent) {
          throw new Error(t("message.sendFailed"));
        }
        if (draftAtSend != null) {
          const currentDraft = selectWorkspaceComposerDraft(
            useWorkspaceComposerDraftStore.getState(),
            sendOwnerKey,
            conversationId,
          );
          if (currentDraft?.snapshotId !== draftAtSend.snapshotId) {
            return { shouldClearComposer: false } satisfies MessageComposerSendResult;
          }
          // MessageComposer clears its value and reply after this promise resolves.
          // Both callbacks still close over the sent composer state. Only consume that
          // cleanup when the sent draft is still the current reply session.
          workspaceComposerSendCleanupRef.current = {
            ownerKey: sendOwnerKey,
            conversationId,
            snapshotId: draftAtSend.snapshotId,
            ignoresValueClear: true,
            ignoresReplyClear: true,
          };
          window.setTimeout(() => {
            const pendingCleanup = workspaceComposerSendCleanupRef.current;
            if (pendingCleanup?.snapshotId === draftAtSend.snapshotId) {
              workspaceComposerSendCleanupRef.current = null;
            }
          }, 0);
          setComposerDraftShadow(
            createWorkspaceComposerDraftKey(sendOwnerKey, conversationId),
            EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT,
          );
          // The message is already sent. Deleting its draft must not delay
          // clearing the composer and must wait for an in-flight POST/PUT.
          // The queue retains conflict data if the DELETE receives 412.
          const deletionQueued = deleteWorkspaceComposerDraftFromServer({
            runtimeContext,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            draft: currentDraft,
          });
          if (!deletionQueued) {
            workspaceComposerDraftLog.warn("Draft deletion was rejected after message send", {
              draftUuid: currentDraft.draftUuid,
              syncStatus: currentDraft.syncStatus,
              disposition: currentDraft.disposition,
            });
          }
          useWorkspaceComposerDraftStore
            .getState()
            .completeDraftVisit(sendOwnerKey, conversationId, currentDraft.draftUuid);
        } else if (content.trim().length > 0) {
          workspaceComposerDraftLog.warn("Message was sent without an active draft", {
            reason: "draft-delete-not-queued",
          });
        }
      });
    },
    [
      conversationId,
      deliverOutgoingMessage,
      resolveSendTarget,
      runtimeContext,
      setComposerDraftShadow,
    ],
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

  // Звонок из чужого профиля: pending uuid → ждём активный DM → стартуем как из хедера.
  useEffect(() => {
    if (isFavoritesConversation) return;
    if (headerView.kind !== "directPrivate") return;
    if (workspaceMeetUrl == null) return;
    if (
      pendingDmCallPartnerUserUuid == null ||
      pendingDmCallPartnerUserUuid !== headerView.directUserUuid
    ) {
      return;
    }

    useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
    handleStartWorkspaceHeaderCall();
  }, [
    handleStartWorkspaceHeaderCall,
    headerView,
    pendingDmCallPartnerUserUuid,
    isFavoritesConversation,
    workspaceMeetUrl,
  ]);

  const handleRetryOutgoingMessage = useCallback(
    (localId: string) => {
      deliverOutgoingMessage(localId).catch(() => undefined);
      setScrollToBottomAfterSendNonce((value) => value + 1);
    },
    [deliverOutgoingMessage],
  );

  const handleRemoveOutgoingMessage = useCallback((localId: string) => {
    useMessengerOutboxStore.getState().removeOutgoingMessage(localId);
  }, []);

  const handleSubmitEditFinalMarkdown = useCallback(
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
      if (
        !message?.isOwn ||
        message.conversationId !== conversationId ||
        message.projectId !== runtimeContext.projectId
      ) {
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
        setRestoredWorkspaceReplySession(null);
        setComposerEditSession(null);
        setComposerEditMessageUuid(null);
        setComposerEditAttachments([]);
      } catch (error) {
        const messageText = normalizeWorkspaceActionError(error, t("message.editFailed"));
        setActionError(messageText);
        throw error instanceof Error ? error : new Error(messageText);
      }
    },
    [composerEditMessageUuid, conversationId, runWorkspaceAction, runtimeContext],
  );

  const handleSubmitEdit = useCallback(
    (editSessionId: number, markdown: string) =>
      handleSubmitEditFinalMarkdown(
        editSessionId,
        appendWorkspaceComposerExistingAttachmentMarkdown(markdown, composerEditAttachments),
      ),
    [composerEditAttachments, handleSubmitEditFinalMarkdown],
  );

  const createWorkspaceReplyTabIdentity = useCallback(() => {
    workspaceReplyTabSequenceRef.current += 1;
    const sequence = workspaceReplyTabSequenceRef.current;
    const now = Date.now();
    return {
      id: `workspace-reply-tab:${now}:${sequence}`,
      createdAt: new Date(now).toISOString(),
    };
  }, []);

  const handleEditMessage = useCallback(
    (messageUuid: string) => {
      const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
      if (!message?.isOwn) {
        setActionError(t("message.editUnavailable"));
        return;
      }

      const editContent = extractWorkspaceComposerEditContent(message.payload.content);
      void workspaceReplyEditRestoreController
        .restore({
          markdown: editContent.markdown,
          runtimeContext,
          createIdentity: () => createWorkspaceReplyTabIdentity(),
        })
        .then((result) => {
          if (result.status === "stale") return;

          const restoredReplySession = result.restored;
          setRestoredWorkspaceReplySession(restoredReplySession?.session ?? null);
          setComposerEditMessageUuid(message.uuid);
          setComposerEditAttachments(editContent.attachments);
          setComposerEditSession({
            messageId: WORKSPACE_COMPOSER_EDIT_SESSION_ID,
            initialMarkdown: restoredReplySession?.activeAnswer ?? editContent.markdown,
            ...(restoredReplySession == null
              ? {}
              : {
                  preserveWorkspaceReplyContext: true,
                  sessionKey: `reply:${restoredReplySession.session.activeTabId ?? ""}`,
                }),
          });
        });
    },
    [createWorkspaceReplyTabIdentity, runtimeContext, workspaceReplyEditRestoreController],
  );

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
    const messageOwnerKey = workspaceRuntimeOwnerKey(runtimeContext);
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
    )
      .then((result) => {
        if (result.status === "applied") {
          removeServerMessageRenderKey(messageOwnerKey, message.conversationId, message.uuid);
        }
      })
      .catch((error) => {
        setActionError(normalizeWorkspaceActionError(error, t("message.deleteError")));
      });
  }, [pendingDeleteMessageUuid, removeServerMessageRenderKey, runWorkspaceAction, runtimeContext]);

  const resolveWorkspaceReplyQuote = useCallback(
    (messageUuid: string, selectedText?: string): WorkspaceReplyQuote | null => {
      if (
        selection.status !== "conversation" ||
        (effectiveRoute?.kind !== "stream" && effectiveRoute?.kind !== "topic")
      ) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return null;
      }

      const message = selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid);
      if (message == null) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return null;
      }

      const selectedQuoteText =
        selectedText != null && selectedText.trim().length > 0 ? selectedText : undefined;
      const quoteSource = selectedQuoteText ?? message.payload.content.trim();
      if (quoteSource.length === 0) return null;
      const authorLabel = resolveAuthorLabel(message.authorUuid) ?? t("message.replyTo");
      return {
        messageUuid: message.uuid,
        senderUuid: message.authorUuid,
        senderName: authorLabel,
        quotedContent: message.payload.content.trim(),
        ...(selectedQuoteText == null ? {} : { selectedText: selectedQuoteText }),
      };
    },
    [effectiveRoute, resolveAuthorLabel, selection.status],
  );

  const handleReplyMessage = useCallback(
    (messageUuid: string, selectedText?: string) => {
      const quote = resolveWorkspaceReplyQuote(messageUuid, selectedText);
      if (quote == null) return;
      const identity = createWorkspaceReplyTabIdentity();

      setComposerEditMessageUuid(null);
      setComposerEditSession(null);
      setComposerEditAttachments([]);
      setRestoredWorkspaceReplySession(null);
      setWorkspaceReplyTabFocusKeySuppressed(false);
      updateWorkspaceComposerDraft((content) => {
        const nextReplySession = replyToWorkspaceReply(
          content.replySession,
          quote,
          identity,
          content.text,
        );
        const startedReply =
          content.replySession.tabs.length === 0 && nextReplySession.tabs.length > 0;
        return {
          ...content,
          text: startedReply ? "" : content.text,
          replySession: nextReplySession,
        };
      });
    },
    [createWorkspaceReplyTabIdentity, resolveWorkspaceReplyQuote, updateWorkspaceComposerDraft],
  );

  const handleAddReplyMessage = useCallback(
    (messageUuid: string, selectedText?: string) => {
      const quote = resolveWorkspaceReplyQuote(messageUuid, selectedText);
      if (quote == null) return;

      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession((current) =>
          current == null
            ? current
            : addWorkspaceReplyTab(current, quote, createWorkspaceReplyTabIdentity()),
        );
        setWorkspaceReplyTabFocusKeySuppressed(false);
        return;
      }

      setComposerEditMessageUuid(null);
      setComposerEditSession(null);
      setComposerEditAttachments([]);
      setRestoredWorkspaceReplySession(null);
      setWorkspaceReplyTabFocusKeySuppressed(false);
      setWorkspaceReplySession((current) =>
        addWorkspaceReplyTab(current, quote, createWorkspaceReplyTabIdentity()),
      );
    },
    [
      createWorkspaceReplyTabIdentity,
      isRestoredWorkspaceReplyEdit,
      resolveWorkspaceReplyQuote,
      setWorkspaceReplySession,
    ],
  );

  const handleClearReply = useCallback(
    (reason: MessageComposerReplyClearReason = "manual") => {
      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession(null);
        setWorkspaceReplyTabFocusKeySuppressed(false);
        return;
      }
      if (reason === "submit") {
        updateWorkspaceComposerDraft(() => EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT);
        setWorkspaceReplyTabFocusKeySuppressed(false);
        return;
      }
      const pendingCleanup = workspaceComposerSendCleanupRef.current;
      if (
        pendingCleanup?.ownerKey === ownerKey &&
        pendingCleanup.conversationId === conversationId &&
        pendingCleanup.ignoresReplyClear
      ) {
        pendingCleanup.ignoresReplyClear = false;
        if (!pendingCleanup.ignoresValueClear) {
          workspaceComposerSendCleanupRef.current = null;
        }
        return;
      }
      updateWorkspaceComposerDraft((content) => {
        const initialTab = content.replySession.tabs.reduce<WorkspaceReplyTab | undefined>(
          (earliest, tab) => {
            if (earliest == null || tab.createdAt < earliest.createdAt) return tab;
            if (
              tab.createdAt === earliest.createdAt &&
              tab.id.localeCompare(earliest.id, undefined, { numeric: true }) < 0
            ) {
              return tab;
            }
            return earliest;
          },
          undefined,
        );
        return {
          ...content,
          text: content.text.length > 0 ? content.text : (initialTab?.answer ?? ""),
          replySession: EMPTY_WORKSPACE_REPLY_SESSION,
        };
      });
      setWorkspaceReplyTabFocusKeySuppressed(false);
    },
    [conversationId, isRestoredWorkspaceReplyEdit, ownerKey, updateWorkspaceComposerDraft],
  );

  const handleSelectWorkspaceReplyTab = useCallback(
    (tabId: string, source?: WorkspaceReplyTabSelectSource) => {
      setWorkspaceReplyTabFocusKeySuppressed(source === "keyboard");
      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession((current) =>
          current == null ? current : selectWorkspaceReplyTab(current, tabId),
        );
        return;
      }
      setWorkspaceReplySession((current) => selectWorkspaceReplyTab(current, tabId));
    },
    [isRestoredWorkspaceReplyEdit, setWorkspaceReplySession],
  );

  const handleRemoveWorkspaceReplyTab = useCallback(
    (tabId: string) => {
      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession((current) =>
          current == null ? current : removeWorkspaceReplyTab(current, tabId),
        );
        return;
      }
      updateWorkspaceComposerDraft((content) => {
        const removedTab = content.replySession.tabs.find((tab) => tab.id === tabId);
        const nextReplySession = removeWorkspaceReplyTab(content.replySession, tabId);
        return {
          ...content,
          text:
            nextReplySession.tabs.length === 0
              ? content.text.length > 0
                ? content.text
                : (removedTab?.answer ?? "")
              : content.text,
          replySession: nextReplySession,
        };
      });
    },
    [isRestoredWorkspaceReplyEdit, updateWorkspaceComposerDraft],
  );

  const handleReorderWorkspaceReplyTab = useCallback(
    (tabId: string, destinationIndex: number) => {
      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession((current) =>
          current == null ? current : reorderWorkspaceReplyTab(current, tabId, destinationIndex),
        );
        return;
      }
      setWorkspaceReplySession((current) =>
        reorderWorkspaceReplyTab(current, tabId, destinationIndex),
      );
    },
    [isRestoredWorkspaceReplyEdit, setWorkspaceReplySession],
  );

  const handleWorkspaceComposerValueChange = useCallback(
    (value: string) => {
      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession((current) => {
          if (current == null || current.tabs.length === 0) return current;
          return setWorkspaceReplyAnswer(current, value);
        });
        return;
      }
      const pendingCleanup = workspaceComposerSendCleanupRef.current;
      if (
        value.length === 0 &&
        pendingCleanup?.ownerKey === ownerKey &&
        pendingCleanup.conversationId === conversationId &&
        pendingCleanup.ignoresValueClear
      ) {
        pendingCleanup.ignoresValueClear = false;
        if (!pendingCleanup.ignoresReplyClear) {
          workspaceComposerSendCleanupRef.current = null;
        }
        return;
      }
      updateWorkspaceComposerDraft((content) => {
        if (content.replySession.tabs.length === 0) {
          return { ...content, text: value };
        }

        return {
          ...content,
          replySession: setWorkspaceReplyAnswer(content.replySession, value),
        };
      });
    },
    [conversationId, isRestoredWorkspaceReplyEdit, ownerKey, updateWorkspaceComposerDraft],
  );

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

      void startWorkspaceFileDownload({
        runtimeContext,
        fileUuid: file.fileUuid,
        fileNameHint: file.name,
        loadBrowserResource: (freshRuntimeContext) =>
          runWorkspaceAction((signal) =>
            workspaceFileResourceCache.load({
              ownerKey: workspaceRuntimeOwnerKey(freshRuntimeContext),
              runtimeGeneration: freshRuntimeContext.runtimeGeneration,
              fileUuid: file.fileUuid,
              requestOptions: buildMessengerRequestOptions(freshRuntimeContext),
              signal,
            }),
          ),
      }).catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setActionError(
            normalizeWorkspaceActionError(error, t("workspaceMessenger.fileDownloadFailed")),
          );
        }
      });
    },
    [runWorkspaceAction, runtimeContext, workspaceFileResourceCache],
  );

  const handleLoadWorkspaceFileResource = useCallback(
    async (
      file: WorkspaceMessageFileReference,
      signal: AbortSignal,
    ): Promise<WorkspaceFilePreviewResource> => {
      if (runtimeContext == null) {
        throw new Error(t("workspaceMessenger.runtimeUnavailable"));
      }

      const fileUuid = file.fileUuid.trim();
      if (fileUuid.length === 0) {
        throw new Error(t("workspaceMessenger.fileDownloadFailed"));
      }

      const result = await workspaceFileResourceCache.load({
        ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
        runtimeGeneration: runtimeContext.runtimeGeneration,
        fileUuid,
        requestOptions: buildMessengerRequestOptions(runtimeContext),
        signal,
      });
      const normalizedBlob = normalizeWorkspacePreviewBlob(result.blob, file.contentType);
      workspacePreviewLoaderLog.debug("preview blob loaded", {
        fileUuid,
        responseType: result.blob.type || null,
        normalizedType: normalizedBlob.type,
        size: normalizedBlob.size,
      });
      return { blob: normalizedBlob, headers: result.headers };
    },
    [runtimeContext, workspaceFileResourceCache],
  );

  const handleLoadWorkspaceFilePreview = useCallback(
    async (file: WorkspaceMessageFileReference, signal: AbortSignal): Promise<Blob> => {
      const resource = await handleLoadWorkspaceFileResource(file, signal);
      return resource.blob;
    },
    [handleLoadWorkspaceFileResource],
  );

  const { openWorkspaceMedia: handleOpenWorkspaceMedia } = useWorkspaceMediaViewer({
    scope: {
      ownerKey,
      runtimeGeneration: runtimeContext?.runtimeGeneration ?? null,
      conversationId,
    },
    enabled: runtimeContext != null,
    loadResource: handleLoadWorkspaceFileResource,
    runAction: runWorkspaceAction,
    onDownload: handleDownloadFile,
    deriveDownloadFileName: deriveWorkspaceDownloadFileName,
    onOpenStart: () => {
      setActionError(null);
    },
    onRuntimeUnavailable: () => {
      setActionError(t("workspaceMessenger.runtimeUnavailable"));
    },
    onUnsupported: () => {
      setActionError(t("workspaceMessenger.mediaViewerUnsupported"));
    },
    onLoadError: (error) => {
      setActionError(
        normalizeWorkspaceActionError(error, t("workspaceMessenger.mediaViewerUnsupported")),
      );
    },
  });

  const handleOpenUnsupportedFilePreview = useCallback(() => {
    setActionError(t("workspaceMessenger.mediaViewerUnsupported"));
  }, []);

  const scheduleReadBatch = useWorkspaceVisibleMessageRead({
    runtimeContext,
    conversationId,
  });

  const hasAnchorRoute = routeSelection.status === "message" || messageAnchorUuid != null;
  const focusedAnchorIntentId =
    hasAnchorRoute &&
    messageNavigationIntent?.phase === "focused" &&
    messageNavigationIntent.conversationId === conversationId
      ? messageNavigationIntent.id
      : null;
  const anchorPaginationScopeKey =
    focusedAnchorIntentId == null ? null : `${tailRequestScopeKey}:${focusedAnchorIntentId}`;

  const cancelActiveAnchorPagination = useCallback(() => {
    const request = anchorPaginationRequestRef.current;
    setWindowPaginationErrorDirection(null);
    if (request == null) return;
    anchorPaginationRequestRef.current = null;
    request.controller.abort();
    setWindowPaginationDirection((direction) =>
      direction === request.direction ? null : direction,
    );
  }, []);
  useLayoutEffect(() => {
    cancelAnchorPaginationRef.current = cancelActiveAnchorPagination;
    return () => {
      cancelActiveAnchorPagination();
      cancelAnchorPaginationRef.current = noop;
    };
  }, [anchorPaginationScopeKey, cancelActiveAnchorPagination]);

  const startAnchorPagination = useCallback(
    (direction: "before" | "after", pageMarker: string, intentId: number): void => {
      if (runtimeContext == null || conversationId == null) return;
      cancelActiveAnchorPagination();
      const token = Symbol("anchor-pagination-request");
      const isCurrentRequest = (): boolean => {
        const request = anchorPaginationRequestRef.current;
        return (
          request?.token === token &&
          request.conversationId === conversationId &&
          request.intentId === intentId
        );
      };
      setWindowPaginationErrorDirection(null);
      setWindowPaginationDirection(direction);
      void runWorkspaceAction(
        (signal) =>
          loadMessengerMessageWindowPage({
            runtimeContext,
            conversationId,
            direction,
            pageMarker,
            expectedRevision: conversationWindow?.revision ?? 0,
            getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            signal,
          }),
        {
          onController: (controller) => {
            anchorPaginationRequestRef.current = {
              controller,
              conversationId,
              direction,
              intentId,
              token,
            };
          },
        },
      )
        .then((result) => {
          if (!isCurrentRequest()) return;
          if (result.status === "applied") {
            setWindowPaginationErrorDirection(null);
          } else if (result.status === "failed" || result.reason !== "stale-window") {
            setWindowPaginationErrorDirection(direction);
          }
        })
        .catch(() => {
          if (!isCurrentRequest()) return;
          setWindowPaginationErrorDirection(direction);
        })
        .finally(() => {
          if (!isCurrentRequest()) return;
          anchorPaginationRequestRef.current = null;
          setWindowPaginationDirection(null);
        });
    },
    [
      cancelActiveAnchorPagination,
      conversationId,
      conversationWindow?.revision,
      runWorkspaceAction,
      runtimeContext,
    ],
  );

  const handleLoadOlder = useCallback(() => {
    if (runtimeContext == null || conversationId == null || messagesStatus.loading) return;

    if (hasAnchorRoute) {
      if (focusedAnchorIntentId == null || beforePageMarker == null) return;
      startAnchorPagination("before", beforePageMarker, focusedAnchorIntentId);
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
    focusedAnchorIntentId,
    hasAnchorRoute,
    messagesStatus.hasMore,
    messagesStatus.loading,
    messagesStatus.nextPageMarker,
    runWorkspaceAction,
    runtimeContext,
    startAnchorPagination,
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
    setRestoredWorkspaceReplySession(null);
    setComposerEditSession(null);
    setComposerEditMessageUuid(null);
    setComposerEditAttachments([]);
  }, []);

  const handleRemoveComposerAttachment = useCallback(
    (localId: string, removeUploadedAttachment: (localId: string) => void) => {
      if (localId.startsWith("existing:")) {
        setComposerEditAttachments((attachments) =>
          attachments.filter((attachment) => attachment.id !== localId),
        );
        return;
      }
      removeUploadedAttachment(localId);
    },
    [],
  );

  const handleLoadNewer = useCallback(() => {
    if (
      runtimeContext == null ||
      conversationId == null ||
      messagesStatus.loading ||
      !hasAnchorRoute ||
      focusedAnchorIntentId == null ||
      afterPageMarker == null
    ) {
      return;
    }
    startAnchorPagination("after", afterPageMarker, focusedAnchorIntentId);
  }, [
    afterPageMarker,
    conversationId,
    focusedAnchorIntentId,
    hasAnchorRoute,
    messagesStatus.loading,
    runtimeContext,
    startAnchorPagination,
  ]);

  const handleRetryBoundaryLoad = useCallback(() => {
    if (windowPaginationErrorDirection === "before") {
      handleLoadOlder();
    } else if (windowPaginationErrorDirection === "after") {
      handleLoadNewer();
    }
  }, [handleLoadNewer, handleLoadOlder, windowPaginationErrorDirection]);

  const settleTailWindowIntent = useCallback((intent: WorkspaceTailWindowIntent): void => {
    if (intent.settled) return;
    intent.settled = true;
    if (tailWindowIntentRef.current === intent) {
      tailWindowIntentRef.current = null;
      queuedTailMessageUuidRef.current = null;
    }
    intent.resolve();
  }, []);

  const startTailWindowRequest = useCallback(
    (intent: WorkspaceTailWindowIntent) => {
      if (runtimeContext == null || conversationId == null || intent.settled) {
        settleTailWindowIntent(intent);
        return;
      }

      const requestedLastMessageUuid = intent.messageUuid;
      const requestToken = Symbol("tail-window-request");
      const requestScopeKey = tailRequestScopeKey;
      setWindowPaginationDirection("tail");
      setActionError(null);
      void runWorkspaceAction(
        async (signal) => {
          const getRuntimeContext = () =>
            useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
          const resolved = await resolveMessengerMessageAnchor({
            runtimeContext,
            messageUuid: requestedLastMessageUuid,
            getRuntimeContext,
            signal,
          });
          if (resolved.status !== "resolved") return resolved;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const fetched = await fetchMessengerMessageWindow({
              runtimeContext,
              anchor: resolved,
              targetConversationId: conversationId,
              getRuntimeContext,
              signal,
            });
            if (fetched.status !== "fetched") {
              if (
                fetched.status === "skipped" &&
                fetched.reason === "stale-window" &&
                attempt === 0
              )
                continue;
              return fetched;
            }
            const applied = await applyMessengerMessageWindow({
              runtimeContext,
              window: fetched.window,
              mode: "tail",
              getRuntimeContext,
              signal,
              isRequestCurrent: () =>
                tailWindowRequestRef.current?.requestToken === requestToken &&
                tailWindowIntentRef.current === intent,
            });
            if (applied.status === "skipped" && applied.reason === "stale-window" && attempt === 0)
              continue;
            return applied;
          }
          return { status: "skipped", ownerKey, reason: "stale-window" as const };
        },
        {
          onController: (controller) => {
            tailWindowRequestRef.current = {
              controller,
              conversationId,
              messageUuid: requestedLastMessageUuid,
              requestToken,
              scopeKey: requestScopeKey,
            };
          },
        },
      )
        .then((result) => {
          const activeRequest = tailWindowRequestRef.current;
          if (
            activeRequest?.requestToken !== requestToken ||
            tailWindowIntentRef.current !== intent
          ) {
            return;
          }
          if (result.status === "applied") {
            setActionError(null);
          } else {
            setActionError(t("chat.messagesLoadError"));
          }
          settleTailWindowIntent(intent);
        })
        .catch(() => {
          const activeRequest = tailWindowRequestRef.current;
          if (
            activeRequest?.requestToken !== requestToken ||
            tailWindowIntentRef.current !== intent
          ) {
            return;
          }
          setActionError(t("chat.messagesLoadError"));
          settleTailWindowIntent(intent);
        })
        .finally(() => {
          if (tailWindowRequestRef.current?.requestToken !== requestToken) return;
          tailWindowRequestRef.current = null;
          setWindowPaginationDirection(null);
        });
    },
    [
      conversationId,
      runWorkspaceAction,
      runtimeContext,
      settleTailWindowIntent,
      tailRequestScopeKey,
    ],
  );

  const handleLoadLatestWindow = useCallback(
    (requestedLastMessageUuid: MessengerUuid): Promise<void> => {
      if (runtimeContext == null || conversationId == null) return Promise.resolve();

      let intent = tailWindowIntentRef.current;
      if (intent?.scopeKey !== tailRequestScopeKey) {
        if (intent != null) settleTailWindowIntent(intent);
        intent = null;
      }
      if (intent?.messageUuid === requestedLastMessageUuid) {
        return intent.promise;
      }

      if (intent == null) {
        let resolveIntent: () => void = noop;
        const promise = new Promise<void>((resolve) => {
          resolveIntent = () => resolve();
        });
        intent = {
          messageUuid: requestedLastMessageUuid,
          promise,
          resolve: resolveIntent,
          scopeKey: tailRequestScopeKey,
          settled: false,
        };
        tailWindowIntentRef.current = intent;
      } else {
        intent = {
          ...intent,
          messageUuid: requestedLastMessageUuid,
        };
        tailWindowIntentRef.current = intent;
      }

      const activeRequest = tailWindowRequestRef.current;
      queuedTailMessageUuidRef.current = null;
      const replacesActiveTailRequest = activeRequest?.scopeKey === tailRequestScopeKey;
      if (activeRequest != null) {
        activeRequest.controller.abort();
        tailWindowRequestRef.current = null;
      }

      const messageStoreState = useWorkspaceMessageStore.getState();
      if (
        selectWorkspaceMessagesForConversation(messageStoreState, conversationId).some(
          (message) => message.uuid === requestedLastMessageUuid,
        )
      ) {
        setWindowPaginationDirection(null);
        settleTailWindowIntent(intent);
        return intent.promise;
      }

      if (
        !replacesActiveTailRequest &&
        selectWorkspaceMessageStatusForConversation(messageStoreState, conversationId).loading
      ) {
        queuedTailMessageUuidRef.current = requestedLastMessageUuid;
        return intent.promise;
      }

      startTailWindowRequest(intent);
      return intent.promise;
    },
    [
      conversationId,
      runtimeContext,
      settleTailWindowIntent,
      startTailWindowRequest,
      tailRequestScopeKey,
    ],
  );

  const handleCancelLatestWindowLoad = useCallback(
    (targetMessageUuid: MessengerUuid) => {
      const intent = tailWindowIntentRef.current;
      if (intent?.scopeKey !== tailRequestScopeKey || intent.messageUuid !== targetMessageUuid) {
        return;
      }

      queuedTailMessageUuidRef.current = null;
      const activeRequest = tailWindowRequestRef.current;
      tailWindowRequestRef.current = null;
      activeRequest?.controller.abort();
      settleTailWindowIntent(intent);
      setWindowPaginationDirection((direction) => (direction === "tail" ? null : direction));
    },
    [settleTailWindowIntent, tailRequestScopeKey],
  );

  const cancelActiveTailWindowIntent = useCallback(() => {
    const intent = tailWindowIntentRef.current;
    if (intent?.scopeKey !== tailRequestScopeKey) return;

    queuedTailMessageUuidRef.current = null;
    const activeRequest = tailWindowRequestRef.current;
    tailWindowRequestRef.current = null;
    activeRequest?.controller.abort();
    settleTailWindowIntent(intent);
    setWindowPaginationDirection((direction) => (direction === "tail" ? null : direction));
  }, [settleTailWindowIntent, tailRequestScopeKey]);

  const handleTailNavigationRequested = useCallback(() => {
    cancelMessageNavigationForTail();
    cancelActiveAnchorPagination();
    if (runtimeContext == null || conversationId == null) return;
    const route = workspaceConversationRoute({
      organizationId: runtimeContext.organizationId,
      projectId: runtimeContext.projectId,
      conversationId,
    });
    const pendingRoute = pendingTailBaseRouteRef.current;
    if (
      route == null ||
      `${location.pathname}${location.hash}` === route ||
      (pendingRoute?.baseRoute === route && pendingRoute.sourceLocationKey === location.key)
    )
      return;
    const marker = { baseRoute: route, sourceLocationKey: location.key };
    pendingTailBaseRouteRef.current = marker;
    void Promise.resolve(navigate(route)).catch(() => {
      if (pendingTailBaseRouteRef.current === marker) pendingTailBaseRouteRef.current = null;
      setActionError(t("chat.messagesLoadError"));
    });
  }, [
    cancelActiveAnchorPagination,
    cancelMessageNavigationForTail,
    conversationId,
    location.hash,
    location.key,
    location.pathname,
    navigate,
    runtimeContext,
  ]);
  useEffect(() => {
    const marker = pendingTailBaseRouteRef.current;
    if (marker == null) return;
    const currentBaseRoute =
      runtimeContext == null || conversationId == null
        ? null
        : workspaceConversationRoute({
            organizationId: runtimeContext.organizationId,
            projectId: runtimeContext.projectId,
            conversationId,
          });
    if (
      currentBaseRoute !== marker.baseRoute ||
      location.key !== marker.sourceLocationKey ||
      `${location.pathname}${location.hash}` === marker.baseRoute
    ) {
      pendingTailBaseRouteRef.current = null;
    }
  }, [conversationId, location.hash, location.key, location.pathname, runtimeContext]);
  useLayoutEffect(() => {
    cancelAnchorTailRef.current = cancelActiveTailWindowIntent;
    return () => {
      cancelAnchorTailRef.current = noop;
    };
  }, [cancelActiveTailWindowIntent]);

  useEffect(() => {
    if (tailWindowIntentRef.current == null || lastMessageUuid == null) return;

    handleLoadLatestWindow(lastMessageUuid).catch(noop);
  }, [handleLoadLatestWindow, lastMessageUuid]);

  useEffect(() => {
    if (messagesStatus.loading) return;

    const queuedMessageUuid = queuedTailMessageUuidRef.current;
    if (queuedMessageUuid == null) return;
    queuedTailMessageUuidRef.current = null;
    const intent = tailWindowIntentRef.current;
    if (intent?.messageUuid !== queuedMessageUuid) return;

    const messageStoreState = useWorkspaceMessageStore.getState();
    if (
      conversationId == null ||
      selectWorkspaceMessagesForConversation(messageStoreState, conversationId).some(
        (message) => message.uuid === queuedMessageUuid,
      )
    ) {
      settleTailWindowIntent(intent);
      return;
    }
    startTailWindowRequest(intent);
  }, [conversationId, messagesStatus.loading, settleTailWindowIntent, startTailWindowRequest]);

  useEffect(() => {
    queuedTailMessageUuidRef.current = null;
    const currentIntent = tailWindowIntentRef.current;
    if (currentIntent != null && currentIntent.scopeKey !== tailRequestScopeKey) {
      settleTailWindowIntent(currentIntent);
    }
    const activeRequest = tailWindowRequestRef.current;
    if (activeRequest != null && activeRequest.scopeKey !== tailRequestScopeKey) {
      activeRequest.controller.abort();
      tailWindowRequestRef.current = null;
    }
    return () => {
      queuedTailMessageUuidRef.current = null;
      const intentAtCleanup = tailWindowIntentRef.current;
      if (intentAtCleanup?.scopeKey === tailRequestScopeKey) {
        settleTailWindowIntent(intentAtCleanup);
      }
      const requestAtCleanup = tailWindowRequestRef.current;
      if (requestAtCleanup?.scopeKey === tailRequestScopeKey) {
        requestAtCleanup.controller.abort();
        tailWindowRequestRef.current = null;
      }
    };
  }, [settleTailWindowIntent, tailRequestScopeKey]);

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
  const handleOpenMessageInChat = useCallback(
    (messageUuid: MessengerUuid) => {
      startMessageNavigation(messageUuid, "local-quote");
    },
    [startMessageNavigation],
  );
  const handleOpenWorkspaceReference = useCallback(
    (reference: WorkspaceMessageConversationReference) => {
      if (runtimeContext == null) {
        return;
      }

      if (reference.kind === "stream") {
        void navigate(
          workspaceMessengerStreamRoute({
            orgId: runtimeContext.organizationId,
            projectId: runtimeContext.projectId,
            streamUuid: reference.streamUuid,
          }),
        );
        return;
      }

      const topic = topicsById[reference.topicUuid];
      if (topic == null) {
        return;
      }
      if (reference.streamUuid != null && topic.streamUuid !== reference.streamUuid) {
        return;
      }

      void navigate(
        workspaceMessengerTopicRoute({
          orgId: runtimeContext.organizationId,
          projectId: runtimeContext.projectId,
          streamUuid: topic.streamUuid,
          topicUuid: topic.uuid,
        }),
      );
    },
    [navigate, runtimeContext, topicsById],
  );
  const handleSelectStreamPromptTopic = useCallback(
    (topicUuid: MessengerUuid) => {
      if (selection.status !== "conversation" || selection.kind !== "stream") {
        return;
      }

      handleOpenWorkspaceReference({
        kind: "topic",
        streamUuid: selection.streamUuid,
        topicUuid,
      });
    },
    [handleOpenWorkspaceReference, selection],
  );

  const directPartnerUuid = headerView.kind === "directPrivate" ? headerView.directUserUuid : null;
  // A direct header click opens the same profile as a message author avatar.
  const handleOpenDirectPartnerProfile = useCallback(() => {
    if (directPartnerUuid == null) return;
    openWorkspaceUserProfile?.(directPartnerUuid);
  }, [directPartnerUuid, openWorkspaceUserProfile]);

  const commonHeaderProps = useMemo<ChatHeaderCommonProps>(
    () => ({
      onOpenSearch: openSearch ?? undefined,
      onToggleRightPanel: rightDrawer == null ? undefined : handleToggleRightPanel,
      rightPanelOpen: rightDrawer?.open ?? false,
    }),
    [handleToggleRightPanel, openSearch, rightDrawer],
  );

  const activeWorkspaceReplyTab = workspaceReplySession.tabs.find(
    (tab) => tab.id === workspaceReplySession.activeTabId,
  );
  const effectiveComposerEditSession = useMemo(
    () =>
      composerEditSession?.preserveWorkspaceReplyContext === true && activeWorkspaceReplyTab != null
        ? {
            ...composerEditSession,
            initialMarkdown: activeWorkspaceReplyTab.answer,
            sessionKey: `reply:${activeWorkspaceReplyTab.id}`,
          }
        : composerEditSession,
    [activeWorkspaceReplyTab, composerEditSession],
  );
  const workspaceComposerDraftSessionKey =
    workspaceComposerDraftScopeKey == null
      ? null
      : `${workspaceComposerDraftScopeKey}:${
          hydratedComposerDraftScopeKey === workspaceComposerDraftScopeKey ? "hydrated" : "initial"
        }:${activeWorkspaceReplyTab == null ? "text" : `reply:${activeWorkspaceReplyTab.id}`}`;
  const activeWorkspaceReplyQuote = useMemo<ReplyQuote | null>(
    () =>
      activeWorkspaceReplyTab == null
        ? null
        : {
            id: activeWorkspaceReplyTab.id,
            content: activeWorkspaceReplyTab.selectedText ?? activeWorkspaceReplyTab.quotedContent,
            sender_full_name: activeWorkspaceReplyTab.senderName,
            sender_uuid: activeWorkspaceReplyTab.senderUuid,
            quoteFormat: "workspace",
            permalinkUrl: null,
          },
    [activeWorkspaceReplyTab],
  );
  const workspaceReplyOutgoingBody =
    workspaceReplySession.tabs.length === 0
      ? undefined
      : buildWorkspaceReplyMarkdown(workspaceReplySession.tabs, {
          wroteLabel: t("message.replyQuoteWrote"),
        });
  const workspaceReplyHasAnswer = workspaceReplySession.tabs.some(
    (tab) => tab.answer.trim().length > 0,
  );

  // Direct chats omit member counters and open the partner profile from the header.
  const header = (
    <WorkspaceConversationHeader
      isFavoritesConversation={isFavoritesConversation}
      headerView={headerView}
      commonHeaderProps={commonHeaderProps}
      onOpenPartnerProfile={
        openWorkspaceUserProfile == null ? undefined : handleOpenDirectPartnerProfile
      }
      onCallClick={workspaceMeetUrl == null ? undefined : handleStartWorkspaceHeaderCall}
      onOpenRightPanel={rightDrawer == null ? undefined : handleOpenRightPanel}
    />
  );

  const anchorHandoffPending = isAnchorHandoffPending({
    previewPresentation,
    navigationIntent: messageNavigationIntent,
    focusTarget: activeMessageFocusTarget,
    selection,
  });
  const anchorNavigationActive =
    anchorRouteRequest != null ||
    (messageNavigationIntent != null && messageNavigationIntent.phase !== "superseded");

  let body: React.ReactNode;
  if (previewPresentation != null || selection.status === "conversation") {
    body = (
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        data-message-anchor-layer-host="true"
      >
        {selection.status === "conversation" &&
        (previewPresentation == null || anchorHandoffPending) ? (
          <ChatPageWorkspaceMessageListSection
            key={`canonical-list:${selection.conversationId}`}
            messagesLoading={messagesStatus.loading}
            hasInitialPayload={routeMessages.length > 0 || conversationWindow != null}
            initialPositionReady={initialPositionReady}
            messages={routeMessages}
            outgoingMessages={outgoingMessages}
            resolveServerMessageRenderKey={resolveServerMessageRenderKey}
            currentUserUuid={currentUserUuid}
            conversationId={selection.conversationId}
            scrollToBottomKey={buildWorkspaceMessageScrollKey({
              conversationId: selection.conversationId,
              focusTarget: activeMessageFocusTarget,
              messageAnchorUuid,
              locationKey: location.key,
            })}
            onLoadOlder={handleLoadOlder}
            isLoadingOlder={
              messagesStatus.loading &&
              routeMessages.length > 0 &&
              windowPaginationDirection === "before"
            }
            isLoadingNewer={
              messagesStatus.loading &&
              routeMessages.length > 0 &&
              windowPaginationDirection === "after"
            }
            onLoadNewer={handleLoadNewer}
            hasOlderMessages={
              routeSelection.status === "message" || messageAnchorUuid != null
                ? beforePageMarker != null
                : messagesStatus.hasMore
            }
            hasNewerMessages={
              (routeSelection.status === "message" || messageAnchorUuid != null) &&
              afterPageMarker != null
            }
            lastMessageUuid={lastMessageUuid}
            onLoadLatestWindow={handleLoadLatestWindow}
            onCancelLatestWindowLoad={handleCancelLatestWindowLoad}
            onTailNavigationRequested={handleTailNavigationRequested}
            firstUnreadUuid={firstUnreadMessage?.uuid}
            unreadCount={unreadCount}
            focusedMessageTarget={activeMessageFocusTarget}
            anchorHandoffPending={anchorHandoffPending}
            anchorNavigationActive={anchorNavigationActive}
            onFocusedMessageApplied={onDomFocusApplied}
            onFocusedMessageMissing={onDomFocusMissing}
            selectionMode={selectionMode}
            selectedMessageUuids={selectedMessageUuids}
            onUnreadMessagesVisible={anchorHandoffPending ? undefined : scheduleReadBatch}
            onUnreadMessagesAtBottom={anchorHandoffPending ? undefined : scheduleReadBatch}
            onReplyMessage={handleReplyMessage}
            onAddReplyMessage={
              workspaceReplySession.tabs.length === 0 ? undefined : handleAddReplyMessage
            }
            onForwardMessage={handleForwardMessage}
            onOpenMessageInChat={handleOpenMessageInChat}
            onOpenMentionUser={openWorkspaceUserProfile == null ? undefined : handleOpenMentionUser}
            onOpenWorkspaceReference={handleOpenWorkspaceReference}
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
            onRetryMessagesLoad={retryMessagesLoad}
            boundaryLoadFailed={windowPaginationErrorDirection != null}
            onRetryBoundaryLoad={handleRetryBoundaryLoad}
            scrollToBottomAfterSendNonce={scrollToBottomAfterSendNonce}
            resolveAuthorLabel={resolveAuthorLabel}
            resolveTopicLabel={resolveMessageTopicLabel}
            presentation={messageListPresentation}
            resolveMention={resolveMention}
          />
        ) : null}
        {previewPresentation != null ? (
          <div
            key={`preview:${previewPresentation.intentId}`}
            className="absolute inset-0 z-base flex min-h-0 flex-col bg-bg"
            data-message-anchor-preview-layer="true"
          >
            <WorkspaceMessageAnchorTransition
              presentation={previewPresentation}
              currentUserUuid={currentUserUuid}
              usersById={usersById}
              errorDetail={navigationError?.detail}
              onRetry={retryMessageNavigation}
              onTailNavigationRequested={
                conversationId == null ? undefined : handleTailNavigationRequested
              }
              resolveAuthorLabel={resolveAuthorLabel}
              resolveMention={resolveMention}
            />
          </div>
        ) : null}
      </div>
    );
  } else if (selection.status !== "invalid-route" && routeSelection.status === "message") {
    body = <WorkspaceChatBlockingLoader />;
  } else {
    body = (
      <WorkspaceChatState
        title={t("workspaceMessenger.invalidRoute")}
        detail={t("workspaceMessenger.invalidRouteHint")}
      />
    );
  }

  const resolvedComposerTarget = resolveSendTarget();
  const workspaceAttachmentTarget: WorkspaceComposerAttachmentTarget | null =
    runtimeContext != null &&
    ownerKey != null &&
    conversationId != null &&
    resolvedComposerTarget.status === "ready"
      ? {
          conversationId,
          streamUuid: resolvedComposerTarget.streamUuid,
          topicUuid: resolvedComposerTarget.topicUuid,
          includeStreamConversation: resolvedComposerTarget.includeStreamConversation,
        }
      : null;
  const hasInlineComposerNotice = Boolean(actionError) || Boolean(sendError);
  const hasDeleteComposerNotice = pendingDeleteMessageUuid != null;
  const hasSelectionComposerNotice = selectedMessageUuids.size > 0;
  const showStreamTopicPrompt = selection.status === "conversation" && selection.kind === "stream";
  const composerJoinedTop =
    !showStreamTopicPrompt &&
    (hasSelectionComposerNotice || hasInlineComposerNotice || hasDeleteComposerNotice);
  const renderWorkspaceAttachmentComposer = useCallback(
    (controlledProps: WorkspaceComposerControlledProps) => {
      const restoredAttachments = composerEditAttachments.map((attachment) => ({
        localId: attachment.id,
        fileName: attachment.reference.name ?? "file",
        sizeBytes: attachment.reference.sizeBytes ?? 0,
        contentType: attachment.reference.contentType ?? "",
        previewUrl: null,
        status: "ready" as const,
        loadedBytes: attachment.reference.sizeBytes ?? 0,
        totalBytes: attachment.reference.sizeBytes ?? null,
        error: null,
        retryable: false,
        previewMarkdown: attachment.markdown,
        workspaceFile: attachment.reference,
      }));
      return (
        <ChatPageComposerSection
          {...controlledProps}
          attachments={[...restoredAttachments, ...controlledProps.attachments]}
          onRemoveAttachment={(localId) =>
            handleRemoveComposerAttachment(localId, controlledProps.onRemoveAttachment)
          }
          isDmView={false}
          activeDmUserIds={null}
          activeStream={stream?.name ?? conversation?.title}
          showTopicPrompt={false}
          streamSlug={undefined}
          onExpandStreamTopics={noop}
          uploadProgress={null}
          optimisticClearOnSend
          onCreateCallLink={undefined}
          onCancelUpload={noop}
          activeTopic={
            selection.status === "conversation" && selection.kind === "topic" ? topicTitle : null
          }
          replyQuote={activeWorkspaceReplyQuote}
          onClearReply={handleClearReply}
          workspaceReplySession={workspaceReplySession}
          onSelectWorkspaceReplyTab={handleSelectWorkspaceReplyTab}
          onRemoveWorkspaceReplyTab={handleRemoveWorkspaceReplyTab}
          onReorderWorkspaceReplyTab={handleReorderWorkspaceReplyTab}
          outgoingBodyOverride={workspaceReplyOutgoingBody}
          allowEmptyActiveValueSend={workspaceReplyHasAnswer ? true : undefined}
          focusKey={
            workspaceReplyTabFocusKeySuppressed ? null : (activeWorkspaceReplyTab?.id ?? null)
          }
          draftSessionKey={workspaceComposerDraftSessionKey}
          draftInitialValue={activeWorkspaceReplyTab?.answer ?? workspaceComposerText}
          onComposerValueChange={handleWorkspaceComposerValueChange}
          onEditLastMessage={handleEditLastMessage}
          editSession={effectiveComposerEditSession}
          onSubmitEdit={controlledProps.onSubmitEdit ?? handleSubmitEdit}
          onCancelEdit={handleCancelEdit}
          composerCapabilities={workspaceComposerCapabilities}
          resolveMention={resolveMention}
          onLoadWorkspaceFilePreview={handleLoadWorkspaceFilePreview}
          aiMessagesContext={[]}
          aiChatContext={undefined}
          readOnlyReason={composerReadOnlyReason}
          joinedTop={composerJoinedTop}
        />
      );
    },
    [
      activeWorkspaceReplyQuote,
      activeWorkspaceReplyTab?.answer,
      activeWorkspaceReplyTab?.id,
      composerReadOnlyReason,
      composerEditAttachments,
      composerJoinedTop,
      conversation?.title,
      effectiveComposerEditSession,
      handleCancelEdit,
      handleClearReply,
      handleEditLastMessage,
      handleLoadWorkspaceFilePreview,
      handleRemoveComposerAttachment,
      handleRemoveWorkspaceReplyTab,
      handleReorderWorkspaceReplyTab,
      handleSelectWorkspaceReplyTab,
      handleSubmitEdit,
      handleWorkspaceComposerValueChange,
      resolveMention,
      selection,
      stream?.name,
      topicTitle,
      workspaceComposerCapabilities,
      workspaceComposerDraftSessionKey,
      workspaceComposerText,
      workspaceReplyHasAnswer,
      workspaceReplyOutgoingBody,
      workspaceReplySession,
      workspaceReplyTabFocusKeySuppressed,
    ],
  );

  return (
    <div
      className="flex max-h-full min-h-0 min-w-chat-page flex-1 flex-col overflow-hidden"
      data-testid="chat-page"
    >
      {header}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {body}
        <ChatPageSelectionBar
          selectedCount={selectedMessageUuids.size}
          forwardDisabled={selectedMessageUuids.size === 0}
          deleteDisabled
          onForward={handleForwardSelectedMessages}
          onDelete={noop}
          onCancel={handleCancelMessageSelection}
          joinedBelow={hasInlineComposerNotice || hasDeleteComposerNotice || !showStreamTopicPrompt}
        />
        <ChatPageInlineAlerts
          routeResolveError={null}
          actionError={actionError}
          sendError={sendError}
          onDismissRouteResolveError={noop}
          onDismissActionError={() => setActionError(null)}
          onDismissSendError={() => setSendError(null)}
          joinedAbove={hasSelectionComposerNotice}
          joinedBelow={hasDeleteComposerNotice || !showStreamTopicPrompt}
        />
        {pendingDeleteMessageUuid != null ? (
          <ChatPageDeleteConfirmBar
            mode="single"
            onConfirm={handleConfirmDeleteMessage}
            onCancel={handleCancelDeleteMessage}
            joinedAbove={hasSelectionComposerNotice || hasInlineComposerNotice}
            joinedBelow={!showStreamTopicPrompt}
          />
        ) : null}
        {showStreamTopicPrompt ? (
          <ChatPageStreamTopicPrompt
            topics={streamPromptTopics}
            onSelectTopic={handleSelectStreamPromptTopic}
          />
        ) : workspaceAttachmentTarget != null && runtimeContext != null && ownerKey != null ? (
          <WorkspaceComposerAttachments
            runtimeContext={runtimeContext}
            ownerKey={ownerKey}
            target={workspaceAttachmentTarget}
            sessionKey={
              composerEditMessageUuid == null ? "compose" : `edit:${composerEditMessageUuid}`
            }
            onSendFinalMarkdown={handleSend}
            editAttachmentMarkdown={composerEditAttachments.map(
              (attachment) => attachment.markdown,
            )}
            onSubmitEditFinalMarkdown={handleSubmitEditFinalMarkdown}
            renderComposer={renderWorkspaceAttachmentComposer}
          />
        ) : (
          <ChatPageComposerSection
            isDmView={false}
            activeDmUserIds={null}
            activeStream={stream?.name ?? conversation?.title}
            showTopicPrompt={false}
            streamSlug={undefined}
            onExpandStreamTopics={noop}
            uploadProgress={null}
            onSend={handleSend}
            optimisticClearOnSend
            onCreateCallLink={undefined}
            onCancelUpload={noop}
            activeTopic={null}
            replyQuote={activeWorkspaceReplyQuote}
            onClearReply={handleClearReply}
            draftInitialValue={activeWorkspaceReplyTab?.answer ?? workspaceComposerText}
            onComposerValueChange={handleWorkspaceComposerValueChange}
            onEditLastMessage={handleEditLastMessage}
            editSession={effectiveComposerEditSession}
            onSubmitEdit={handleSubmitEdit}
            onCancelEdit={handleCancelEdit}
            composerCapabilities={workspaceComposerCapabilities}
            resolveMention={resolveMention}
            onLoadWorkspaceFilePreview={handleLoadWorkspaceFilePreview}
            aiMessagesContext={[]}
            aiChatContext={undefined}
            readOnlyReason={composerReadOnlyReason}
            joinedTop={composerJoinedTop}
          />
        )}
      </section>
    </div>
  );
};
