import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { NavigationType, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useChatDmCallBridgeStore } from "~/applications/messenger/features/chat-details/call-bridge/chat-dm-call-bridge.model";
import { useChatCryptoSession } from "~/applications/messenger/features/chat-details/encrypted-chat-info/chat-crypto-session.hook";
import {
  WorkspaceComposerAttachments,
  type WorkspaceComposerAttachmentTarget,
  type WorkspaceComposerControlledProps,
} from "~/applications/messenger/features/composer/attachments/workspace-composer-attachments.ui";
import {
  extractWorkspaceComposerEditContent,
  prependWorkspaceComposerExistingAttachmentMarkdown,
  type WorkspaceComposerExistingAttachment,
} from "~/applications/messenger/features/composer/attachments/workspace-composer-edit-attachments.lib";
import type {
  ComposerEditSession,
  ComposerMentionContextInput,
  MessageComposerCapabilities,
  MessageComposerReplyClearReason,
  MessageComposerSendResult,
  ReplyQuote,
} from "~/applications/messenger/features/composer/message-composer.types";
import { MessageComposer } from "~/applications/messenger/features/composer/message-composer.ui";
import { createWorkspaceReplyEditRestoreController } from "~/applications/messenger/features/composer/reply/workspace-reply-edit-restore.lib";
import {
  claimWorkspaceReplyHandoff,
  clearWorkspaceReplyHandoff,
  completeWorkspaceReplyHandoffClaim,
  hasWorkspaceReplyHandoffForScope,
  releaseWorkspaceReplyHandoffClaim,
  stageWorkspaceReplyHandoff,
  type WorkspaceReplyHandoffClaim,
} from "~/applications/messenger/features/composer/reply/workspace-reply-handoff.model";
import {
  addWorkspaceReplyTab,
  appendWorkspaceReplyTabs,
  buildWorkspaceReplyMarkdown,
  removeWorkspaceReplyTab,
  reorderWorkspaceReplyTab,
  replyToWorkspaceReply,
  selectWorkspaceReplyTab,
  setWorkspaceReplyAnswer,
} from "~/applications/messenger/features/composer/reply/workspace-reply.lib";
import { EMPTY_WORKSPACE_REPLY_SESSION } from "~/applications/messenger/features/composer/reply/workspace-reply.model";
import type {
  WorkspaceReplyQuote,
  WorkspaceReplySession,
  WorkspaceReplyTab,
} from "~/applications/messenger/features/composer/reply/workspace-reply.types";
import {
  WorkspaceReplyTabs,
  type WorkspaceReplyTabSelectSource,
} from "~/applications/messenger/features/composer/reply/workspace-reply.ui";
import { ChatChannelHeader } from "~/applications/messenger/features/conversation-header/chat-header-channel.ui";
import { ChatDirectHeader } from "~/applications/messenger/features/conversation-header/chat-header-direct.ui";
import { ChatFavoritesHeader } from "~/applications/messenger/features/conversation-header/chat-header-favorites.ui";
import type { ChatHeaderCommonProps } from "~/applications/messenger/features/conversation-header/chat-header.types";
import { selectWorkspaceChatHeaderView } from "~/applications/messenger/features/conversation-header/messenger-chat-header.lib";
import {
  getEncryptedChatServiceActions,
  getEncryptedChatServiceState,
} from "~/applications/messenger/features/decrypted-message/encrypted-chat-message/encrypted-chat-service-actions.lib";
import { CreatePollDialog } from "~/applications/messenger/features/polls/create-poll-dialog.ui";
import type { PollDraft } from "~/applications/messenger/features/polls/create-poll-dialog.ui";
import { preparePollSend } from "~/applications/messenger/features/polls/create-poll.lib";
import type { PollSendAttempt } from "~/applications/messenger/features/polls/create-poll.lib";
import { selectMessengerSidebarTopicsForStream } from "~/applications/messenger/features/sidebar/messenger-sidebar.lib";
import { useWorkspaceForwardMessageStore } from "~/applications/messenger/features/timeline/forward/workspace-forward-message.model";
import { normalizeWorkspacePreviewBlob } from "~/applications/messenger/features/timeline/messenger-workspace-message-preview-blob.lib";
import { useWorkspaceVisibleMessageRead } from "~/applications/messenger/features/timeline/read/workspace-visible-message-read.hook";
import { WorkspaceMessageAnchorTransition } from "~/applications/messenger/features/timeline/workspace-message-anchor-transition.ui";
import type { WorkspaceMessageConversationReference } from "~/applications/messenger/features/timeline/workspace-message-list.types";
import { recordWorkspaceMessageQuickReactionUse } from "~/applications/messenger/features/timeline/workspace-message-quick-reaction-history.lib";
import {
  chatCommands,
  useChatRouteMembership,
} from "~/applications/messenger/model/chats/chat-commands";
import { readActiveChats, useChatsCatalog } from "~/applications/messenger/model/chats/chats";
import { isWorkspaceSelfChat } from "~/applications/messenger/model/chats/messenger-self-chat.lib";
import { subscribeRealChatKeyChanges } from "~/applications/messenger/model/crypto/chat-crypto-resources.lib";
import {
  decryptRealChatEnvelopeResult,
  decryptRealChatMessage,
} from "~/applications/messenger/model/crypto/chat-crypto-runtime.lib";
import { acquireChatCryptoSession } from "~/applications/messenger/model/crypto/chat-crypto-session.lib";
import {
  buildMessengerSecretMarkdown,
  restoreMessengerSecretMarkdown,
} from "~/applications/messenger/model/crypto/messenger-secret-message.lib";
import {
  createWorkspaceComposerDrafts,
  getEmptyWorkspaceComposerDraftSnapshot,
} from "~/applications/messenger/model/drafts/composer-draft-actions.lib";
import type { WorkspaceComposerDraftContent } from "~/applications/messenger/model/drafts/composer-draft.types";
import { messageCommands } from "~/applications/messenger/model/messages/message-commands";
import {
  createMessages,
  EMPTY_MESSAGE_WINDOW,
  MessagesDraftSendError,
} from "~/applications/messenger/model/messages/messages";
import {
  readActiveMessageIndex,
  subscribeActiveMessageIndex,
  useMessageIndex,
  useOutgoingMessages,
  selectKnownMessage,
} from "~/applications/messenger/model/messages/messages-consumers";
import { canPrepareMessengerEncryptedMessage } from "~/applications/messenger/model/messages/messenger-message-content.lib";
import type { MessengerSendOptions } from "~/applications/messenger/model/messages/outgoing/messenger-outbox.types";
import { supportsMessengerPolls } from "~/applications/messenger/model/messages/polls/messenger-poll-actions.lib";
import { summarizeMessengerPoll } from "~/applications/messenger/model/messages/polls/messenger-poll-text.lib";
import {
  conversationIdForStream,
  conversationIdForTopic,
  isMessengerUuid,
  parseMessengerConversationId,
  selectMessengerConversationFromWorkspaceRoute,
} from "~/applications/messenger/model/messenger-ids.lib";
import { buildMessengerRequestOptions } from "~/applications/messenger/model/messenger-request-options.lib";
import { runMessengerRuntimeMutation } from "~/applications/messenger/model/messenger-runtime-mutation.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerStream,
  MessengerTopic,
  MessengerUuid,
} from "~/applications/messenger/model/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { createJitsiCallKey, useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { buildWorkspaceJitsiMeetingUrl } from "~/features/jitsi-call/workspace-jitsi-call.lib";
import { useWorkspaceMediaViewer } from "~/features/media-viewer/workspace-media-viewer.hook";
import {
  deriveWorkspaceDownloadFileName,
  startWorkspaceFileDownload,
} from "~/features/workspace-file-download/workspace-file-download.lib";
import { t } from "~/i18n/i18n";
import { useUsersById } from "~/modules/users/users";
import { selectUserDisplayName } from "~/modules/users/users-selectors";
import type { UsersById } from "~/modules/users/users-types";
import { writeText } from "~/platform/desktop/clipboard";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import type { RightDrawerContextValue } from "~/shared/contexts/right-drawer.types";
import { chatBottomNoticeBarClassName } from "~/shared/lib/chat-bottom-notice-bar.lib";
import { createLogger } from "~/shared/lib/logger";
import { toast } from "~/shared/lib/toast/toast";
import {
  createWorkspaceFileResourceCache,
  type WorkspaceFileResourceCache,
} from "~/shared/lib/workspace-file-loader.lib";
import {
  buildWorkspaceMessagePermalink,
  resolveWorkspaceMessageWebOrigin,
} from "~/shared/lib/workspace-message-permalink.lib";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolution,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { formatWorkspaceMessageTimesForCopy } from "~/shared/lib/workspace-message-render/workspace-message-marked.lib";
import {
  hasWorkspaceForwardSnapshot,
  parseWorkspaceMessageBody,
} from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import {
  collectWorkspaceMessageSecretReferences,
  hasWorkspaceMessageSecretContent,
  containsWorkspaceMessageSecretReference,
} from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import {
  parseWorkspaceMessengerMessageAnchor,
  workspaceMessengerMessageAnchor,
  workspaceMessengerMessageRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
  type WorkspaceMessengerRouteMatch,
} from "~/shared/lib/workspace-messenger-route.lib";
import { type WorkspaceSecretUrnReference } from "~/shared/lib/workspace-reference-urn.lib";
import {
  hasWorkspaceSecretDraft,
  parseWorkspaceSecretDraft,
} from "~/shared/lib/workspace-secret-draft.lib";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { Spinner } from "~/shared/ui/loading";
import { ChatPageComposerSection } from "../../features/composer/chat-page-composer-section.ui";
import { ChatPageWorkspaceMessageListSection } from "../../features/timeline/chat-page-workspace-message-list-section.ui";
import { useWorkspaceMessageAnchorNavigation } from "./anchor-navigation/workspace-message-anchor-navigation.hook";
import {
  hasConversationBeenViewed,
  markConversationViewed,
  setConversationViewMemoryOwner,
} from "./chat-page-conversation-view-memory.lib";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";
import {
  isEncryptedReplySourceCurrent,
  isEncryptedReplySourceAffectedByKeyChange,
} from "./chat-page-encrypted-reply.lib";
import { resolveInitialPositionReady } from "./chat-page-initial-position.lib";
import { ChatPageInlineAlerts } from "./chat-page-inline-alerts.ui";
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";
import {
  ChatPageClosedTopicPrompt,
  ChatPageStreamTopicPrompt,
} from "./chat-page-stream-topic-prompt.ui";
import { useComposerMediaViewer } from "./composer-media-viewer.hook";
import {
  useWorkspaceConversationOpening,
  useWorkspaceTopicResolution,
} from "./conversation-opening/workspace-conversation-opening.hook";
import type {
  WorkspaceMessageAnchorFocusTarget,
  WorkspaceMessageAnchorNavigationIntent,
  WorkspaceMessageAnchorPreviewPresentation,
  WorkspaceMessageAnchorRouteRequest,
} from "./anchor-navigation/workspace-message-anchor-navigation.types";
import type { WorkspaceChatMessagesLoadErrorKind } from "../../features/timeline/chat-page-workspace-message-list-section.types";

const toggleChatInfoDrawer = (rightDrawer: RightDrawerContextValue | null): void => {
  rightDrawer?.toggleChatInfo();
};

const isChatInfoDrawerOpen = (rightDrawer: RightDrawerContextValue | null): boolean =>
  rightDrawer?.chatInfoOpen ?? rightDrawer?.open ?? false;

interface WorkspaceChatPageProps {
  route: WorkspaceMessengerRouteMatch | null;
  presentation?: "default" | "favorites";
}

interface WorkspaceFilePreviewResource {
  blob: Blob;
  headers: Headers;
}

interface WorkspaceResolvedReplyTarget {
  message: MessengerMessage;
  quote: WorkspaceReplyQuote;
}

interface WorkspaceEncryptedComposerState {
  scopeKey: string;
  conversationId: MessengerConversationId;
  text: string;
  replySession: WorkspaceReplySession;
  sources: Record<string, MessengerMessage>;
}

interface WorkspaceComposerSendCleanup {
  ownerKey: string;
  conversationId: string;
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

interface WorkspaceConversationPaginationState {
  conversationId: MessengerConversationId;
  requestToken: symbol;
}

interface WorkspaceConversationPaginationRequest extends WorkspaceConversationPaginationState {
  controller: AbortController;
  mode: "tail" | "around-anchor";
}

const EMPTY_MESSAGES_BY_ID: Record<MessengerUuid, MessengerMessage> = {};
const EMPTY_USERS_BY_ID: UsersById = {};
const WORKSPACE_COMPOSER_EDIT_SESSION_ID = 1;
// Нет владельца черновика для редактора вне обычного разговора.
const subscribeEmptySnapshot = () => () => undefined;

const workspacePreviewLoaderLog = createLogger("chat-page:workspace-preview-loader");

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
  encrypted?: boolean;
  headerView: ReturnType<typeof selectWorkspaceChatHeaderView>;
  commonHeaderProps: ChatHeaderCommonProps;
  onOpenPartnerProfile?: () => void;
  onCallClick?: () => void;
  onOpenRightPanel?: () => void;
}>;

function WorkspaceConversationHeader({
  isFavoritesConversation,
  encrypted = false,
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
      encrypted={encrypted}
      channelName={headerView.channelName}
      color={headerView.color}
      topic={headerView.topic}
      hideTopic={headerView.hideTopic}
      participantsCount={headerView.participantsCount}
      onlineCount={headerView.onlineCount}
      onOpenRightPanel={onOpenRightPanel}
      onCallClick={onCallClick}
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
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const pollAttemptRef = useRef<PollSendAttempt | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [topicReopenPending, setTopicReopenPending] = useState(false);
  const [windowPaginationDirection, setWindowPaginationDirection] = useState<
    "before" | "after" | "tail" | null
  >(null);
  const [windowPaginationErrorDirection, setWindowPaginationErrorDirection] = useState<
    "before" | "after" | null
  >(null);
  const [conversationPaginationState, setConversationPaginationState] =
    useState<WorkspaceConversationPaginationState | null>(null);
  const [composerEditSession, setComposerEditSession] = useState<ComposerEditSession | null>(null);
  const [composerEditMessageUuid, setComposerEditMessageUuid] = useState<string | null>(null);
  const composerEditAttemptRef = useRef(0);
  const encryptedEditSourceRef = useRef<MessengerMessage | null>(null);
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
  const [successfullyHydratedComposerDraftScopeKey, setSuccessfullyHydratedComposerDraftScopeKey] =
    useState<string | null>(null);
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
  const conversationPaginationRequestRef = useRef<WorkspaceConversationPaginationRequest | null>(
    null,
  );
  const pendingTailBaseRouteRef = useRef<{
    baseRoute: string;
    sourceLocationKey: string;
  } | null>(null);
  const pendingWorkspaceJitsiHeaderCallRef = useRef(false);
  const workspaceChatUiActionEpochRef = useRef(0);
  const encryptedReplyAttemptRef = useRef(0);
  const encryptedReplyQueueRef = useRef<Promise<void>>(Promise.resolve());
  const encryptedReplyQueueEpochRef = useRef(0);
  const [encryptedComposerState, setEncryptedComposerState] =
    useState<WorkspaceEncryptedComposerState | null>(null);
  const encryptedComposerStateRef = useRef(encryptedComposerState);
  const pendingEncryptedReplySourceRef = useRef<MessengerMessage | null>(null);
  const cancelEncryptedReplies = useCallback(() => {
    encryptedReplyQueueEpochRef.current += 1;
    encryptedReplyQueueRef.current = Promise.resolve();
    encryptedReplyAttemptRef.current += 1;
    pendingEncryptedReplySourceRef.current = null;
  }, []);
  const [encryptedTabFocusSuppressed, setEncryptedTabFocusSuppressed] = useState(false);
  const updateEncryptedComposerState = useCallback(
    (
      update: (
        current: WorkspaceEncryptedComposerState | null,
      ) => WorkspaceEncryptedComposerState | null,
    ) => {
      const next = update(encryptedComposerStateRef.current);
      encryptedComposerStateRef.current = next;
      setEncryptedComposerState(next);
    },
    [],
  );
  const workspaceComposerSendCleanupRef = useRef<WorkspaceComposerSendCleanup | null>(null);
  const workspaceReplyHandoffClaimRef = useRef<WorkspaceReplyHandoffClaim | null>(null);
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
  const hasAnchorRoute = routeSelection.status === "message" || messageAnchorUuid != null;
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
  const anyWorkspaceMessageWindowLoading = useMessageIndex(
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
  const messages = useMemo(
    () =>
      runtimeContext == null
        ? null
        : createMessages({ runtimeContext, getRuntimeContext: getCurrentWorkspaceRuntimeContext }),
    [getCurrentWorkspaceRuntimeContext, runtimeContext],
  );
  const resolveKnownAnchorConversationId = useCallback(
    (messageUuid: MessengerUuid): MessengerConversationId | null =>
      messages?.getMessage(messageUuid)?.conversationId ?? null,
    [messages],
  );
  const isAnchorMessageInWindow = useCallback(
    (targetConversationId: MessengerConversationId, messageUuid: MessengerUuid): boolean =>
      messages
        ?.getWindow(targetConversationId)
        .messages.some((message) => message.uuid === messageUuid) ?? false,
    [messages],
  );
  const isAnchorMessageWindowReady = useCallback(
    (targetConversationId: MessengerConversationId): boolean =>
      messages?.getWindow(targetConversationId).mode != null,
    [messages],
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
  const cancelActiveConversationPagination = useCallback(() => {
    const request = conversationPaginationRequestRef.current;
    if (request == null) return;
    conversationPaginationRequestRef.current = null;
    request.controller.abort();
    setConversationPaginationState((current) =>
      current?.requestToken === request.requestToken ? null : current,
    );
  }, []);
  const cancelTailForAnchor = useCallback(() => {
    cancelAnchorTailRef.current();
    cancelAnchorPaginationRef.current();
    // Переход по ссылке может начать замену окна в том же разговоре до смены маршрута.
    cancelActiveConversationPagination();
  }, [cancelActiveConversationPagination]);
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
    openAroundMessage: messages?.openAroundMessage ?? null,
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
  useChatRouteMembership({ route: effectiveRoute });
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
  const pendingDmCall = useChatDmCallBridgeStore((state) => state.pendingDmCall);
  const conversationId = selection.status === "conversation" ? selection.conversationId : null;
  const streamUuid = selection.status === "conversation" ? selection.streamUuid : null;
  const topicUuid =
    selection.status === "conversation" && selection.kind === "topic" ? selection.topicUuid : null;
  const stream = useChatsCatalog((state) =>
    streamUuid != null && state.ownerKey === ownerKey ? state.streamsById[streamUuid] : undefined,
  );
  const encryptedChat = useChatCryptoSession(streamUuid, topicUuid ?? undefined);
  useLayoutEffect(() => {
    const clear = () => {
      composerEditAttemptRef.current += 1;
      if (encryptedEditSourceRef.current == null) return;
      encryptedEditSourceRef.current = null;
      setComposerEditSession(null);
      setComposerEditMessageUuid(null);
      setComposerEditAttachments([]);
      setRestoredWorkspaceReplySession(null);
    };
    const unsubscribeKeys = subscribeRealChatKeyChanges((change) => {
      const source = encryptedEditSourceRef.current;
      if (source == null) return;
      const references =
        source.payload.kind === "e2ee"
          ? [{ streamUuid: source.streamUuid, keyUuid: source.payload.keyUuid }]
          : source.payload.kind === "markdown"
            ? collectWorkspaceMessageSecretReferences(
                parseWorkspaceMessageBody(source.payload.content),
              )
            : [];
      if (
        change == null ||
        (change.kind === "removed" &&
          change.ownerKey === ownerKey &&
          references.some(
            (reference) =>
              reference.streamUuid === change.streamUuid && reference.keyUuid === change.keyUuid,
          ))
      )
        clear();
    });
    const unsubscribeMessages = subscribeActiveMessageIndex((messages) => {
      const source = encryptedEditSourceRef.current;
      if (source == null) return;
      const latest = selectKnownMessage(messages, source.uuid);
      if (
        messages.ownerKey !== ownerKey ||
        latest?.payload.kind !== source.payload.kind ||
        (latest.payload.kind !== "e2ee" && latest.payload.kind !== "markdown") ||
        (source.payload.kind !== "e2ee" && source.payload.kind !== "markdown") ||
        latest.payload.content !== source.payload.content ||
        (source.payload.kind === "e2ee" &&
          (latest.payload.kind !== "e2ee" || latest.payload.keyUuid !== source.payload.keyUuid))
      )
        clear();
    });
    return () => {
      clear();
      unsubscribeKeys();
      unsubscribeMessages();
    };
  }, [conversationId, ownerKey, runtimeContext?.runtimeGeneration]);
  const encryptedChatAvailable =
    encryptedChat.session !== null && encryptedChat.sendKeyUuid !== null;
  const encryptedComposerScopeKey =
    stream?.encryption === true && ownerKey != null && runtimeContext != null
      ? `${ownerKey}:${runtimeContext.runtimeGeneration}:${streamUuid}`
      : null;
  const currentEncryptedComposer =
    encryptedComposerState?.scopeKey === encryptedComposerScopeKey &&
    encryptedComposerState?.conversationId === conversationId
      ? encryptedComposerState
      : null;
  useLayoutEffect(() => {
    cancelEncryptedReplies();
    updateEncryptedComposerState((current) =>
      current?.scopeKey === encryptedComposerScopeKey && current?.conversationId === conversationId
        ? current
        : null,
    );
    return () => {
      cancelEncryptedReplies();
    };
  }, [
    cancelEncryptedReplies,
    conversationId,
    encryptedComposerScopeKey,
    updateEncryptedComposerState,
  ]);
  useEffect(() => {
    if (encryptedComposerScopeKey == null) return;
    const invalidate = (affected: (source: MessengerMessage) => boolean) => {
      const pending = pendingEncryptedReplySourceRef.current;
      if (pending != null && affected(pending)) {
        encryptedReplyAttemptRef.current += 1;
        pendingEncryptedReplySourceRef.current = null;
      }
      updateEncryptedComposerState((current) => {
        if (current == null) return null;
        let replySession = current.replySession;
        const activeAnswer = replySession.tabs.find(
          (tab) => tab.id === replySession.activeTabId,
        )?.answer;
        const sources = { ...current.sources };
        for (const [id, source] of Object.entries(sources)) {
          if (affected(source)) {
            replySession = removeWorkspaceReplyTab(replySession, id);
            delete sources[id];
          }
        }
        if (replySession === current.replySession) return current;
        return {
          ...current,
          replySession,
          sources,
          text: replySession.tabs.length === 0 ? (activeAnswer ?? current.text) : current.text,
        };
      });
    };
    const unsubscribeKeys = subscribeRealChatKeyChanges((change) =>
      invalidate((source) => isEncryptedReplySourceAffectedByKeyChange(source, ownerKey, change)),
    );
    const unsubscribeMessages = subscribeActiveMessageIndex((messages) =>
      invalidate(
        (source) =>
          messages.ownerKey !== ownerKey ||
          !isEncryptedReplySourceCurrent(source, selectKnownMessage(messages, source.uuid)),
      ),
    );
    return () => {
      unsubscribeKeys();
      unsubscribeMessages();
    };
  }, [encryptedComposerScopeKey, ownerKey, updateEncryptedComposerState]);
  const [dismissedKeyNotice, setDismissedKeyNotice] = useState<string | null>(null);
  const keyNoticeId = `${ownerKey}:${streamUuid}:${stream?.currentEncryptionKey?.keyUuid}`;
  const hasOutdatedSendingKey =
    stream?.encryption === true &&
    encryptedChatAvailable &&
    encryptedChat.sendKeyUuid !== stream.currentEncryptionKey?.keyUuid;
  const workspaceReplyHandoffBlocksSend =
    runtimeContext != null &&
    ownerKey != null &&
    conversationId != null &&
    hasWorkspaceReplyHandoffForScope(
      {
        ownerKey,
        runtimeGeneration: runtimeContext.runtimeGeneration,
        conversationId,
      },
      location.key,
    );
  const tailRequestScopeKey = `${ownerKey ?? ""}:${runtimeContext?.runtimeGeneration ?? ""}:${
    conversationId ?? ""
  }`;
  useEffect(
    () => () => {
      workspaceReplyEditRestoreController.cancel();
    },
    [conversationId, runtimeContext, workspaceReplyEditRestoreController],
  );
  const drafts = useMemo(
    () =>
      runtimeContext == null || conversationId == null || stream?.encryption === true
        ? null
        : createWorkspaceComposerDrafts(
            { runtimeContext, getRuntimeContext: getCurrentWorkspaceRuntimeContext },
            conversationId,
          ),
    [conversationId, getCurrentWorkspaceRuntimeContext, runtimeContext, stream?.encryption],
  );
  const workspaceComposerDraftScopeKey = drafts?.scopeKey ?? null;
  const requestedWorkspaceDraftUuid = useMemo(
    () => new URLSearchParams(location.search).get("draft_uuid"),
    [location.search],
  );
  const composerDraftTopicsById = useChatsCatalog((state) => state.topicsById);
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
  const { content: workspaceComposerContent, completedVisit: completedComposerDraftVisit } =
    useSyncExternalStore(
      drafts?.subscribe ?? subscribeEmptySnapshot,
      drafts?.getSnapshot ?? getEmptyWorkspaceComposerDraftSnapshot,
      getEmptyWorkspaceComposerDraftSnapshot,
    );
  const isRestoredWorkspaceReplyEdit = composerEditSession?.preserveWorkspaceReplyContext === true;
  const workspaceReplySession: WorkspaceReplySession = isRestoredWorkspaceReplyEdit
    ? (restoredWorkspaceReplySession ?? EMPTY_WORKSPACE_REPLY_SESSION)
    : workspaceComposerContent.replySession;
  const workspaceComposerText = workspaceComposerContent.text;
  const updateWorkspaceComposerDraft = useCallback(
    (update: (content: WorkspaceComposerDraftContent) => WorkspaceComposerDraftContent | null) =>
      drafts?.update(update, composerDraftTarget ?? undefined) ?? false,
    [composerDraftTarget, drafts],
  );
  const invalidateWorkspaceReplyHandoffClaim = useCallback(() => {
    const claim = workspaceReplyHandoffClaimRef.current;
    if (claim == null) return;
    workspaceReplyHandoffClaimRef.current = null;
    completeWorkspaceReplyHandoffClaim(claim);
  }, []);
  useEffect(() => {
    if (runtimeContext == null || ownerKey == null || conversationId == null) return;

    const claim = claimWorkspaceReplyHandoff(
      {
        ownerKey,
        runtimeGeneration: runtimeContext.runtimeGeneration,
        conversationId,
      },
      location.key,
    );
    workspaceReplyHandoffClaimRef.current = claim;

    return () => {
      if (claim == null) return;
      releaseWorkspaceReplyHandoffClaim(claim);
      if (workspaceReplyHandoffClaimRef.current === claim) {
        workspaceReplyHandoffClaimRef.current = null;
      }
    };
  }, [conversationId, location.key, ownerKey, runtimeContext]);
  useEffect(() => {
    if (
      workspaceComposerDraftScopeKey == null ||
      successfullyHydratedComposerDraftScopeKey !== workspaceComposerDraftScopeKey
    ) {
      return;
    }

    const claim = workspaceReplyHandoffClaimRef.current;
    if (claim == null) return;
    workspaceReplyHandoffClaimRef.current = null;
    completeWorkspaceReplyHandoffClaim(claim);

    updateWorkspaceComposerDraft((content) => {
      const nextReplySession = replyToWorkspaceReply(
        content.replySession,
        claim.handoff.quote,
        claim.handoff.identity,
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
  }, [
    successfullyHydratedComposerDraftScopeKey,
    updateWorkspaceComposerDraft,
    workspaceComposerDraftScopeKey,
  ]);
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
  const conversation = useChatsCatalog((state) =>
    conversationId != null ? state.conversationsById[conversationId] : undefined,
  );
  const topic = useChatsCatalog((state) =>
    topicUuid != null ? state.topicsById[topicUuid] : undefined,
  );
  const handleResolvedTopic = useCallback(
    (resolved: MessengerTopic, replace: boolean) => {
      if (runtimeContext == null) return;
      const path = workspaceMessengerTopicRoute({
        orgId: runtimeContext.organizationId,
        projectId: runtimeContext.projectId,
        streamUuid: resolved.streamUuid,
        topicUuid: resolved.uuid,
      });
      if (!replace || path !== location.pathname)
        void navigate(replace ? path + location.search + location.hash : path, { replace });
    },
    [runtimeContext, location.pathname, location.search, location.hash, navigate],
  );
  const openWorkspaceTopic = useWorkspaceTopicResolution({
    runtimeContext,
    topicUuid:
      presentation === "default" &&
      route?.kind === "topic" &&
      route.orgId === runtimeContext?.organizationId &&
      route.projectId === runtimeContext?.projectId
        ? route.topicUuid
        : null,
    locationKey: location.key,
    onResolved: handleResolvedTopic,
  });
  const isTopicClosed =
    selection.status === "conversation" && selection.kind === "topic" && topic?.isDone === true;
  let lastMessageUuid: MessengerUuid | null = null;
  if (selection.status === "conversation") {
    lastMessageUuid =
      selection.kind === "topic"
        ? (topic?.lastMessageUuid ?? conversation?.lastMessageUuid ?? null)
        : (stream?.lastMessageUuid ?? conversation?.lastMessageUuid ?? null);
  }
  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  const getRouteWindow = useCallback(
    () =>
      messages == null || conversationId == null
        ? EMPTY_MESSAGE_WINDOW
        : messages.getWindow(conversationId),
    [conversationId, messages],
  );
  const subscribeRouteWindow = useCallback(
    (notify: () => void) => {
      if (messages == null || conversationId == null) return noop;
      let previousWindow = getRouteWindow();
      return messages.subscribeWindow(conversationId, () => {
        const nextWindow = getRouteWindow();
        // Повтор открывает сброшенное окно только в активной сессии.
        const windowWasReset =
          previousWindow.mode != null &&
          nextWindow.mode == null &&
          nextWindow !== EMPTY_MESSAGE_WINDOW;
        previousWindow = nextWindow;
        if (windowWasReset) {
          if (hasAnchorRoute) retryMessageNavigation();
          else retry();
        }
        notify();
      });
    },
    [conversationId, getRouteWindow, hasAnchorRoute, messages, retry, retryMessageNavigation],
  );
  const {
    messages: routeMessages,
    mode: conversationWindowMode,
    loading: messagesLoading,
    error: messagesError,
    hasOlder: hasOlderMessages,
    hasNewer: hasNewerMessages,
  } = useSyncExternalStore(subscribeRouteWindow, getRouteWindow, getRouteWindow);
  const outgoingMessages = useOutgoingMessages(conversationId);
  const realtimeReadyRuntimeGeneration = useChatsCatalog(
    (state) => state.realtimeReadyRuntimeGeneration,
  );
  const realtimeReadyOwnerKey = useChatsCatalog((state) => state.realtimeReadyOwnerKey);
  const usersById = useUsersById(EMPTY_USERS_BY_ID);
  const topicsById = useChatsCatalog((state) => state.topicsById);
  const topicIds = useChatsCatalog((state) => state.topicIds);
  const allWorkspaceMessagesById = useMessageIndex((state) =>
    state.ownerKey === ownerKey ? state.messagesById : EMPTY_MESSAGES_BY_ID,
  );
  const handleRequestMessageKey = useCallback(
    (messageUuid: string) => {
      // The bound model checks the selected owner and generation when the action runs.
      const message = messages?.getMessage(messageUuid);
      if (
        message?.streamUuid !== streamUuid ||
        message.payload.kind === "markdown" ||
        message.payload.kind === "poll"
      )
        return;
      void encryptedChat.requestKey(
        message.payload.keyUuid,
        message.payload.kind === "e2ee" ? message : undefined,
        message.topicUuid,
      );
    },
    [messages, streamUuid, encryptedChat.requestKey],
  );
  const getKeyRequestActions = useCallback(
    (message: MessengerMessage) =>
      getEncryptedChatServiceActions({
        message,
        currentUserUuid: runtimeContext?.userUuid,
        projectId: runtimeContext?.projectId,
        streamUuid,
        session: encryptedChat.session,
        pending: encryptedChat.loading || encryptedChat.state.pending,
        onRequestKey: (keyUuid) => {
          void encryptedChat.requestKey(keyUuid, undefined, message.topicUuid);
        },
        onGrantKey: (uuid) => {
          void encryptedChat.grantKey(uuid);
        },
        onRejectKey: (uuid) => {
          void encryptedChat.rejectKey(uuid);
        },
      }),
    [
      streamUuid,
      runtimeContext?.userUuid,
      runtimeContext?.projectId,
      encryptedChat.session,
      encryptedChat.loading,
      encryptedChat.state.pending,
      encryptedChat.grantKey,
      encryptedChat.rejectKey,
      encryptedChat.requestKey,
    ],
  );
  const getKeyServiceState = useCallback(
    (message: MessengerMessage) =>
      encryptedChat.state.error === "stale"
        ? null
        : getEncryptedChatServiceState({
            message,
            projectId: runtimeContext?.projectId,
            streamUuid,
            session: encryptedChat.session,
          }),
    // Session notifications also update historical request outcomes and local key availability.
    [streamUuid, runtimeContext?.projectId, encryptedChat.session, encryptedChat.state],
  );
  const streamsById = useChatsCatalog((state) => state.streamsById);
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
    return {
      serviceMessages: stream?.encryption === true ? "all" : "account",
      ...(selection.status === "conversation" && selection.kind === "stream"
        ? { topicDividers: true, topicLabels: true }
        : {}),
    } as const;
  }, [selection, stream?.encryption]);
  const resolveMessageTopicLabel = useMemo<
    ((messageTopicUuid: MessengerUuid) => string | null) | undefined
  >(() => {
    if (messageListPresentation.topicLabels !== true) {
      return undefined;
    }

    return (messageTopicUuid: MessengerUuid) => {
      const topicName = topicsById[messageTopicUuid]?.name.trim() ?? "";
      return topicName.length > 0 ? topicName : null;
    };
  }, [messageListPresentation, topicsById]);
  const streamBindingsById = useChatsCatalog((state) => state.streamBindingsById);
  const streamBindingIdsByStreamId = useChatsCatalog((state) => state.streamBindingIdsByStreamId);
  const conversationsById = useChatsCatalog((state) => state.conversationsById);
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

  const opening = useWorkspaceConversationOpening({
    messages,
    runtimeContext,
    conversationId,
    enabled: selection.status === "conversation" && !hasAnchorRoute,
    retryNonce,
  });
  const { takeControl: takeOpeningControl, acceptWindow: acceptOpeningWindow } = opening;

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
    setHydratedComposerDraftScopeKey(null);
    setSuccessfullyHydratedComposerDraftScopeKey(null);
    if (drafts == null) return;

    let isCurrentScope = true;
    void drafts
      .hydrate(requestedWorkspaceDraftUuid, () => isCurrentScope)
      .then(
        () => {
          if (!isCurrentScope) return;
          setSuccessfullyHydratedComposerDraftScopeKey(drafts.scopeKey);
          setHydratedComposerDraftScopeKey(drafts.scopeKey);
        },
        () => {
          if (!isCurrentScope) return;
          invalidateWorkspaceReplyHandoffClaim();
          setHydratedComposerDraftScopeKey(drafts.scopeKey);
        },
      );

    return () => {
      isCurrentScope = false;
      drafts.leave();
    };
  }, [drafts, invalidateWorkspaceReplyHandoffClaim, requestedWorkspaceDraftUuid]);

  useLayoutEffect(() => {
    workspaceChatUiActionEpochRef.current += 1;
    return () => {
      workspaceChatUiActionEpochRef.current += 1;
    };
  }, [conversationId, ownerKey, runtimeContext?.runtimeGeneration]);

  useEffect(() => {
    setPendingDeleteMessageUuid(null);
    setSelectedMessageUuids(new Set());
    setRestoredWorkspaceReplySession(null);
    setComposerEditSession(null);
    setComposerEditMessageUuid(null);
    setComposerEditAttachments([]);
    setWorkspaceReplyTabFocusKeySuppressed(false);
    workspaceComposerSendCleanupRef.current = null;
  }, [conversationId, ownerKey, runtimeContext?.runtimeGeneration]);

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
  const composerMentionContext = useMemo<ComposerMentionContextInput>(
    () => ({
      streamUuid: selection.status === "conversation" ? selection.streamUuid : null,
      conversationId,
      selfUserUuid: currentUserUuid.length > 0 ? currentUserUuid : null,
    }),
    [conversationId, currentUserUuid, selection],
  );
  const firstUnreadMessage = useMemo(
    () => routeMessages.find((message) => !message.read),
    [routeMessages],
  );
  const unreadCount = useMemo(
    () => routeMessages.filter((message) => !message.read).length,
    [routeMessages],
  );
  const realtimeReady =
    runtimeContext != null &&
    realtimeReadyOwnerKey === ownerKey &&
    realtimeReadyRuntimeGeneration ===
      (runtimeContext.ownerRuntimeGeneration ?? runtimeContext.runtimeGeneration);
  const initialPositionReady = resolveInitialPositionReady({
    hasRuntimeContext: runtimeContext != null && ownerKey != null,
    hasConversationWindow: conversationWindowMode != null,
    hasFocusTarget: activeMessageFocusTarget != null,
    realtimeReady,
    viewedBefore: hasConversationBeenViewed(conversationId),
    historyReady: opening.ready,
  });

  useEffect(() => {
    // Owner switches invalidate every remembered position: the conversation ids
    // belong to the account that is going away. The memory itself lives outside
    // this component, which is rebuilt on every navigation, and only an actual
    // owner change clears it.
    setConversationViewMemoryOwner(ownerKey);
  }, [ownerKey]);

  useEffect(() => {
    if (!initialPositionReady) return;
    markConversationViewed(conversationId);
  }, [conversationId, initialPositionReady]);
  const messagesLoadError: WorkspaceChatMessagesLoadErrorKind | null =
    messagesError == null ? null : routeMessages.length === 0 ? "initial" : "refresh";

  const runChatScopedAction = useCallback(
    async <T,>(
      action: (signal: AbortSignal) => Promise<T>,
      options: { onController?: (controller: AbortController) => void } = {},
    ): Promise<T> => {
      // Chat-owned work stops when its route scope is replaced.
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

  const captureWorkspaceChatUiAction = useCallback(() => {
    const epoch = workspaceChatUiActionEpochRef.current;
    return () => workspaceChatUiActionEpochRef.current === epoch;
  }, []);

  const handleReopenClosedTopic = useCallback((): void => {
    if (topic == null || !topic.isDone || topicReopenPending) return;

    const isUiActionCurrent = captureWorkspaceChatUiAction();
    setActionError(null);
    setTopicReopenPending(true);
    void chatCommands
      .toggleTopicDone({
        streamUuid: topic.streamUuid,
        topicUuid: topic.uuid,
        done: false,
      })
      .then((result) => {
        if (isUiActionCurrent() && result.status !== "applied") {
          setActionError(t("workspaceMessenger.topicReopenFailed"));
        }
      })
      .catch((error: unknown) => {
        if (!isUiActionCurrent()) return;
        setActionError(
          normalizeWorkspaceActionError(error, t("workspaceMessenger.topicReopenFailed")),
        );
      })
      .finally(() => {
        setTopicReopenPending(false);
      });
  }, [captureWorkspaceChatUiAction, topic, topicReopenPending]);

  const resolveSendTarget = useCallback(():
    | { status: "ready"; streamUuid: string; topicUuid: string; includeStreamConversation: boolean }
    | { status: "blocked"; error: string } => {
    // Topic routes send to the selected topic; stream routes send only to the default topic.
    if (selection.status !== "conversation") {
      return { status: "blocked", error: t("workspaceMessenger.routeUnsupportedForSend") };
    }
    if (selection.kind === "topic") {
      if (isTopicClosed) {
        return { status: "blocked", error: t("workspaceMessenger.topicClosed") };
      }
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
  }, [isTopicClosed, selection, topicsById]);

  const canCreatePoll =
    runtimeContext != null &&
    selection.status === "conversation" &&
    stream != null &&
    supportsMessengerPolls(stream) &&
    composerReadOnlyReason == null &&
    Boolean(stream.name || conversation?.title) &&
    !isTopicClosed &&
    resolveSendTarget().status === "ready";
  const handleCreatePoll = useCallback(
    async (draft: PollDraft) => {
      if (
        !canCreatePoll ||
        runtimeContext == null ||
        !isWorkspaceRuntimeRequestContextCurrent(runtimeContext, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        )
      )
        throw new Error("Poll unavailable");
      const catalog = readActiveChats();
      const currentStream =
        catalog.ownerKey === ownerKey && selection.status === "conversation"
          ? catalog.streamsById[selection.streamUuid]
          : undefined;
      if (
        currentStream?.userUuid !== runtimeContext.userUuid ||
        currentStream.projectId !== runtimeContext.projectId ||
        !supportsMessengerPolls(currentStream)
      )
        throw new Error("Poll unavailable");
      const target = resolveSendTarget();
      if (target.status !== "ready") throw new Error(target.error);
      let attempt = pollAttemptRef.current;
      if (attempt?.draft !== draft) {
        attempt = preparePollSend(draft, target);
        pollAttemptRef.current = attempt;
      }
      const isCurrent = captureWorkspaceChatUiAction();
      const result = await runMessengerRuntimeMutation(runtimeContext, (signal) =>
        messageCommands.send({
          runtimeContext,
          signal,
          streamUuid: attempt.target.streamUuid,
          topicUuid: attempt.target.topicUuid,
          includeStreamConversation: attempt.target.includeStreamConversation,
          canonicalMessageUuid: attempt.uuid,
          pollPayload: attempt.payload,
        }),
      );
      if (!isCurrent() || result.status !== "applied") throw new Error("Poll send unavailable");
      pollAttemptRef.current = null;
      takeOpeningControl();
      setScrollToBottomAfterSendNonce((value) => value + 1);
    },
    [
      canCreatePoll,
      captureWorkspaceChatUiAction,
      ownerKey,
      resolveSendTarget,
      runtimeContext,
      selection,
      takeOpeningControl,
    ],
  );

  useEffect(() => {
    setPollDialogOpen(false);
    pollAttemptRef.current = null;
  }, [conversationId, ownerKey, runtimeContext?.runtimeGeneration]);

  const encryptedComposerCapabilities = useMemo<MessageComposerCapabilities>(
    () => ({
      ...workspaceComposerCapabilities,
      mentions: { mode: "unsupported", unsupportedText: t("e2ee.mentionsUnsupported") },
    }),
    [workspaceComposerCapabilities],
  );

  const handleRequestSecretKey = useCallback(
    async (messageUuid: string, reference: WorkspaceSecretUrnReference, allowUsableKey = false) => {
      const message = selectKnownMessage(readActiveMessageIndex(), messageUuid);
      if (
        runtimeContext == null ||
        message?.payload.kind !== "markdown" ||
        message.projectId !== runtimeContext.projectId ||
        !containsWorkspaceMessageSecretReference(
          parseWorkspaceMessageBody(message.payload.content),
          reference,
        )
      )
        return;
      const isCurrent = captureWorkspaceChatUiAction();
      const sourceTopicUuid =
        message.streamUuid === reference.streamUuid ? message.topicUuid : undefined;
      if (!allowUsableKey) {
        const readable = await decryptRealChatEnvelopeResult(
          runtimeContext,
          {
            projectId: message.projectId,
            streamUuid: reference.streamUuid,
            keyUuid: reference.keyUuid,
            envelope: reference.envelope,
          },
          isCurrent,
        );
        if (!isCurrent() || readable.status === "ready") return;
      }
      if (reference.streamUuid === streamUuid) {
        try {
          await encryptedChat.requestEnvelopeKey(
            reference.keyUuid,
            reference.envelope,
            allowUsableKey,
            sourceTopicUuid,
          );
        } catch {
          if (isCurrent()) setActionError(t("e2ee.requestKeyFailed"));
        }
        return;
      }
      const lease = acquireChatCryptoSession(runtimeContext, reference.streamUuid);
      try {
        const session = await lease.promise;
        if (readActiveMessageIndex().ownerKey !== workspaceRuntimeOwnerKey(runtimeContext)) return;
        await lease.sync();
        if (!isCurrent()) return;
        await session.requestEnvelopeKey(
          reference.keyUuid,
          reference.envelope,
          allowUsableKey,
          sourceTopicUuid,
        );
      } catch {
        if (isCurrent()) setActionError(t("e2ee.requestKeyFailed"));
      } finally {
        lease.release();
      }
    },
    [
      runtimeContext,
      streamUuid,
      encryptedChat.session,
      encryptedChat.requestEnvelopeKey,
      captureWorkspaceChatUiAction,
    ],
  );
  const handleSend = useCallback(
    (content: string, _subject?: string, _files?: File[], options?: MessengerSendOptions) => {
      if (workspaceReplyHandoffBlocksSend || workspaceReplyHandoffClaimRef.current != null) {
        return { shouldClearComposer: false } satisfies MessageComposerSendResult;
      }
      setSendError(null);
      const isUiActionCurrent = captureWorkspaceChatUiAction();
      function rejectSend(message: string): never {
        if (isUiActionCurrent()) setSendError(message);
        throw new Error(message);
      }
      if (messages == null || ownerKey == null)
        rejectSend(t("workspaceMessenger.runtimeUnavailable"));
      if (conversationId == null) rejectSend(t("workspaceMessenger.routeUnsupportedForSend"));
      const target = resolveSendTarget();
      if (target.status === "blocked") return rejectSend(target.error);

      function handlePreparationError(error: unknown): never {
        if (error instanceof MessagesDraftSendError) {
          if (error.reason === "too-long") return rejectSend(t("composer.messageTooLong"));
          if (error.reason === "invalid-secret") return rejectSend(t("composer.invalidSecret"));
          if (error.reason === "stale") throw new Error(t("workspaceMessenger.runtimeUnavailable"));
          return rejectSend(t("e2ee.cryptoUnavailable"));
        }
        throw error;
      }

      // Эти колбэки чистят только своё представление. Версию уже завершила модель.
      function completeComposer(shouldClear: boolean): MessageComposerSendResult | void {
        if (!shouldClear || !isUiActionCurrent()) return { shouldClearComposer: false };
        if (drafts == null || ownerKey == null || conversationId == null) return;
        const cleanup: WorkspaceComposerSendCleanup = {
          ownerKey,
          conversationId,
          ignoresValueClear: true,
          ignoresReplyClear: true,
        };
        workspaceComposerSendCleanupRef.current = cleanup;
        window.setTimeout(() => {
          if (workspaceComposerSendCleanupRef.current === cleanup)
            workspaceComposerSendCleanupRef.current = null;
        }, 0);
      }

      try {
        const accepted = messages.sendDraft({
          target,
          markdown: content,
          draft: drafts?.captureSubmission(),
          crypto: {
            encrypted: stream?.encryption === true,
            keyUuid: encryptedChat.sendKeyUuid ?? null,
            session: encryptedChat.session,
            createNewKey: options?.createNewKey,
          },
          isIntentCurrent: isUiActionCurrent,
          beginNextDraftOnAcceptance: options?.beginNextDraftOnAcceptance,
          onAccepted: (canClearEditor) => {
            options?.onAccepted?.();
            if (
              !isUiActionCurrent() ||
              !isWorkspaceRuntimeRequestContextCurrent(
                runtimeContext,
                getCurrentWorkspaceRuntimeContext,
              )
            )
              return;
            options?.onEditorAccepted?.(canClearEditor);
            takeOpeningControl();
            setScrollToBottomAfterSendNonce((value) => value + 1);
          },
        });
        if (accepted == null) return;
        return Promise.resolve(accepted).then(({ clearOnAcceptance, delivery }) => {
          // Для фрагментов редактор ждёт подготовку, а сама доставка принадлежит исходящим.
          if (clearOnAcceptance != null) return completeComposer(clearOnAcceptance);
          return delivery.then(({ delivered, shouldClearComposer }) => {
            if (!delivered) throw new Error(t("message.sendFailed"));
            return completeComposer(shouldClearComposer);
          });
        }, handlePreparationError);
      } catch (error) {
        return handlePreparationError(error);
      }
    },
    [
      captureWorkspaceChatUiAction,
      conversationId,
      drafts,
      encryptedChat.sendKeyUuid,
      encryptedChat.session,
      getCurrentWorkspaceRuntimeContext,
      messages,
      ownerKey,
      resolveSendTarget,
      runtimeContext,
      stream?.encryption,
      takeOpeningControl,
      workspaceReplyHandoffBlocksSend,
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
    const cryptoSession = stream?.encryption === true ? encryptedChat.session : null;
    if (
      stream?.encryption === true &&
      (cryptoSession == null || encryptedChat.sendKeyUuid == null)
    ) {
      setSendError(t("e2ee.cryptoUnavailable"));
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
    const isUiActionCurrent = captureWorkspaceChatUiAction();
    void runMessengerRuntimeMutation(runtimeContext, (signal) =>
      cryptoSession != null
        ? cryptoSession.send({
            text: meetingUrl,
            topicUuid: target.topicUuid,
            includeStreamConversation: target.includeStreamConversation,
          })
        : messageCommands.send({
            runtimeContext,
            signal,
            streamUuid: target.streamUuid,
            topicUuid: target.topicUuid,
            markdown: meetingUrl,
            includeStreamConversation: target.includeStreamConversation,
          }),
    )
      .then((result) => {
        if (!isUiActionCurrent()) return;

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
      })
      .catch((error) => {
        if (!isUiActionCurrent()) return;
        setSendError(normalizeWorkspaceActionError(error, t("message.sendFailed")));
      })
      .finally(() => {
        if (isUiActionCurrent()) {
          pendingWorkspaceJitsiHeaderCallRef.current = false;
        }
      });
  }, [
    captureWorkspaceChatUiAction,
    headerView,
    ownerKey,
    resolveSendTarget,
    runtimeContext,
    usersById,
    workspaceMeetUrl,
    stream?.encryption,
    encryptedChat.session,
    encryptedChat.sendKeyUuid,
  ]);

  useLayoutEffect(() => {
    if (
      runtimeContext == null ||
      ownerKey == null ||
      workspaceMeetUrl == null ||
      isFavoritesConversation ||
      selection.status !== "conversation" ||
      (stream?.encryption === true && !encryptedChatAvailable)
    )
      return;
    const isCurrent = captureWorkspaceChatUiAction();
    const call = {
      ownerKey,
      runtimeGeneration: runtimeContext.runtimeGeneration,
      streamUuid: selection.streamUuid,
      invoke: () => {
        if (isCurrent()) handleStartWorkspaceHeaderCall();
      },
    };
    useChatDmCallBridgeStore.getState().setActiveChatCall(call);
    return () => {
      if (useChatDmCallBridgeStore.getState().activeChatCall === call) {
        useChatDmCallBridgeStore.getState().setActiveChatCall(null);
      }
    };
  }, [
    runtimeContext,
    ownerKey,
    workspaceMeetUrl,
    isFavoritesConversation,
    selection,
    stream?.encryption,
    encryptedChatAvailable,
    captureWorkspaceChatUiAction,
    handleStartWorkspaceHeaderCall,
  ]);

  // Звонок из профиля запускается в активном DM той же сессии, что опубликовала запрос.
  useEffect(() => {
    if (isFavoritesConversation || headerView.kind !== "directPrivate" || workspaceMeetUrl == null)
      return;
    if (
      pendingDmCall?.partnerUserUuid !== headerView.directUserUuid ||
      pendingDmCall.ownerKey !== ownerKey ||
      pendingDmCall.runtimeGeneration !== runtimeContext?.runtimeGeneration ||
      !isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getCurrentWorkspaceRuntimeContext)
    )
      return;

    const bridge = useChatDmCallBridgeStore.getState();
    if (
      bridge.clearPendingDmCall(pendingDmCall) &&
      useChatDmCallBridgeStore.getState().pendingDmCall == null &&
      isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getCurrentWorkspaceRuntimeContext)
    )
      handleStartWorkspaceHeaderCall();
  }, [
    getCurrentWorkspaceRuntimeContext,
    handleStartWorkspaceHeaderCall,
    headerView,
    pendingDmCall,
    isFavoritesConversation,
    ownerKey,
    runtimeContext,
    workspaceMeetUrl,
  ]);

  const handleRetryOutgoingMessage = useCallback(
    (placementUuid: MessengerUuid) => {
      takeOpeningControl();
      void messages?.retryOutgoing(placementUuid).catch(() => undefined);
      setScrollToBottomAfterSendNonce((value) => value + 1);
    },
    [messages, takeOpeningControl],
  );

  const handleRemoveOutgoingMessage = useCallback(
    (placementUuid: MessengerUuid) => messages?.dismissOutgoing(placementUuid),
    [messages],
  );

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
          : selectKnownMessage(readActiveMessageIndex(), composerEditMessageUuid);
      if (
        !message?.isOwn ||
        (message.payload.kind !== "markdown" && message.payload.kind !== "e2ee") ||
        (message.conversationId !== conversationId &&
          conversationId !== conversationIdForStream(message.streamUuid)) ||
        message.projectId !== runtimeContext.projectId
      ) {
        const error = t("message.editUnavailable");
        setActionError(error);
        throw new Error(error);
      }

      const isUiActionCurrent = captureWorkspaceChatUiAction();
      const editAttempt = composerEditAttemptRef.current;
      try {
        const result = await runMessengerRuntimeMutation(runtimeContext, async (signal) => {
          if (message.payload.kind === "e2ee") {
            if (
              encryptedChat.session == null ||
              encryptedEditSourceRef.current?.uuid !== message.uuid
            )
              throw new Error(t("message.editUnavailable"));
            return encryptedChat.session.edit(message, markdown, signal);
          }
          if (hasWorkspaceSecretDraft(markdown)) {
            const session = encryptedChat.session;
            if (session == null) throw new Error(t("e2ee.cryptoUnavailable"));
            const fragments = parseWorkspaceSecretDraft(markdown);
            await session.prepareFragmentKey();
            if (!isUiActionCurrent() || composerEditAttemptRef.current !== editAttempt)
              throw new Error("stale");
            return session.editMarkdown(
              message,
              {
                secretFragments: fragments.map((fragment) => ({ text: fragment.text })),
                buildMarkdown: (payloads) =>
                  buildMessengerSecretMarkdown(message.streamUuid, markdown, payloads),
              },
              signal,
            );
          }
          return messageCommands.edit({
            runtimeContext,
            signal,
            messageUuid: message.uuid,
            markdown,
            sourceMessage: message,
            isCurrent: isUiActionCurrent,
          });
        });
        if (result.status !== "applied") throw new Error(t("message.editFailed"));
        if (isUiActionCurrent() && composerEditAttemptRef.current === editAttempt) {
          encryptedEditSourceRef.current = null;
          setRestoredWorkspaceReplySession(null);
          setComposerEditSession(null);
          setComposerEditMessageUuid(null);
          setComposerEditAttachments([]);
        }
      } catch (error) {
        const messageText = normalizeWorkspaceActionError(error, t("message.editFailed"));
        if (isUiActionCurrent() && composerEditAttemptRef.current === editAttempt)
          setActionError(messageText);
        throw error instanceof Error ? error : new Error(messageText);
      }
    },
    [
      captureWorkspaceChatUiAction,
      composerEditMessageUuid,
      conversationId,
      encryptedChat.session,
      runtimeContext,
    ],
  );

  const handleSubmitEdit = useCallback(
    (editSessionId: number, markdown: string) =>
      handleSubmitEditFinalMarkdown(
        editSessionId,
        prependWorkspaceComposerExistingAttachmentMarkdown(markdown, composerEditAttachments),
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
      const messages = readActiveMessageIndex();
      const message = selectKnownMessage(messages, messageUuid);
      if (
        runtimeContext == null ||
        messages.ownerKey !== ownerKey ||
        !message?.isOwn ||
        message.projectId !== runtimeContext.projectId ||
        message.streamUuid !== streamUuid ||
        (selection.status === "conversation" &&
          selection.kind === "topic" &&
          message.topicUuid !== selection.topicUuid) ||
        (message.payload.kind !== "markdown" && message.payload.kind !== "e2ee") ||
        (message.payload.kind === "e2ee" &&
          readActiveChats().streamsById[message.streamUuid]?.encryption !== true)
      ) {
        setActionError(t("message.editUnavailable"));
        return;
      }
      invalidateWorkspaceReplyHandoffClaim();
      const attempt = ++composerEditAttemptRef.current;
      cancelEncryptedReplies();
      const isUiActionCurrent = captureWorkspaceChatUiAction();
      const payload = message.payload;
      encryptedEditSourceRef.current = null;
      setRestoredWorkspaceReplySession(null);
      setComposerEditSession(null);
      setComposerEditMessageUuid(null);
      setComposerEditAttachments([]);
      encryptedEditSourceRef.current =
        payload.kind === "e2ee" ||
        (payload.kind === "markdown" &&
          collectWorkspaceMessageSecretReferences(parseWorkspaceMessageBody(payload.content))
            .length > 0)
          ? message
          : null;
      const isCurrent = () => {
        const latestRuntime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
        const latestMessages = readActiveMessageIndex();
        const latest = selectKnownMessage(latestMessages, messageUuid);
        const catalog = readActiveChats();
        return (
          isUiActionCurrent() &&
          latestRuntime != null &&
          workspaceRuntimeOwnerKey(latestRuntime) === ownerKey &&
          latestRuntime.runtimeGeneration === runtimeContext.runtimeGeneration &&
          latestMessages.ownerKey === ownerKey &&
          catalog.ownerKey === ownerKey &&
          (payload.kind !== "e2ee" ||
            catalog.streamsById[message.streamUuid]?.encryption === true) &&
          composerEditAttemptRef.current === attempt &&
          latest?.payload.kind === payload.kind &&
          (latest.payload.kind === "markdown" || latest.payload.kind === "e2ee") &&
          latest.payload.content === payload.content &&
          (payload.kind !== "e2ee" ||
            (latest.payload.kind === "e2ee" && latest.payload.keyUuid === payload.keyUuid))
        );
      };
      void (async () => {
        const markdown =
          payload.kind === "markdown"
            ? payload.content
            : await decryptRealChatMessage(runtimeContext, message, isCurrent);
        if (!isCurrent()) return;
        if (markdown == null || hasWorkspaceForwardSnapshot(parseWorkspaceMessageBody(markdown)))
          throw new Error(t("message.editUnavailable"));
        const editContent = extractWorkspaceComposerEditContent(markdown);
        const result =
          payload.kind === "e2ee"
            ? { status: "ready" as const, restored: null }
            : await workspaceReplyEditRestoreController.restore({
                markdown: editContent.markdown,
                runtimeContext,
                createIdentity: () => createWorkspaceReplyTabIdentity(),
              });
        if (result.status === "stale" || !isCurrent()) return;
        const restoreSecrets = (content: string) =>
          payload.kind === "e2ee"
            ? Promise.resolve(content)
            : restoreMessengerSecretMarkdown(content, async (reference) => {
                const decrypted = await decryptRealChatEnvelopeResult(
                  runtimeContext,
                  { projectId: message.projectId, ...reference },
                  isCurrent,
                );
                return decrypted.status === "ready" ? decrypted.plaintext : null;
              });
        const restoredReplySession = result.restored?.session;
        const restoredTabs =
          restoredReplySession == null
            ? null
            : await Promise.all(
                restoredReplySession.tabs.map(async (tab) => ({
                  ...tab,
                  answer: await restoreSecrets(tab.answer),
                })),
              );
        const editableMarkdown =
          restoredTabs == null
            ? await restoreSecrets(editContent.markdown)
            : (restoredTabs.find((tab) => tab.id === restoredReplySession?.activeTabId)?.answer ??
              "");
        if (!isCurrent()) return;
        setActionError(null);
        setRestoredWorkspaceReplySession(
          restoredReplySession != null && restoredTabs != null
            ? { ...restoredReplySession, tabs: restoredTabs }
            : null,
        );
        setComposerEditMessageUuid(message.uuid);
        setComposerEditAttachments(editContent.attachments);
        setComposerEditSession({
          messageId: WORKSPACE_COMPOSER_EDIT_SESSION_ID,
          initialMarkdown: editableMarkdown,
          ...(payload.kind === "e2ee" ? { sessionKey: message.uuid } : {}),
          ...(restoredReplySession == null
            ? {}
            : {
                preserveWorkspaceReplyContext: true,
                sessionKey: `reply:${restoredReplySession.activeTabId ?? ""}`,
              }),
        });
      })().catch(() => {
        if (isCurrent()) {
          encryptedEditSourceRef.current = null;
          setActionError(t("message.editUnavailable"));
        }
      });
    },
    [
      cancelEncryptedReplies,
      captureWorkspaceChatUiAction,
      createWorkspaceReplyTabIdentity,
      invalidateWorkspaceReplyHandoffClaim,
      ownerKey,
      runtimeContext,
      selection,
      streamUuid,
      workspaceReplyEditRestoreController,
    ],
  );

  const handleRequestDeleteMessage = useCallback((messageUuid: string) => {
    const message = selectKnownMessage(readActiveMessageIndex(), messageUuid);
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
        : selectKnownMessage(readActiveMessageIndex(), pendingDeleteMessageUuid);
    if (!message?.isOwn) {
      setActionError(t("workspaceMessenger.messageActionTargetMissing"));
      setPendingDeleteMessageUuid(null);
      return;
    }

    setPendingDeleteMessageUuid(null);
    const isUiActionCurrent = captureWorkspaceChatUiAction();
    void runMessengerRuntimeMutation(runtimeContext, (signal) =>
      messageCommands.delete({
        runtimeContext,
        signal,
        messageUuid: message.uuid,
        streamUuid: message.streamUuid,
        topicUuid: message.topicUuid,
      }),
    ).catch((error) => {
      if (isUiActionCurrent()) {
        setActionError(normalizeWorkspaceActionError(error, t("message.deleteError")));
      }
    });
  }, [captureWorkspaceChatUiAction, pendingDeleteMessageUuid, runtimeContext]);

  const resolveWorkspaceReplyTarget = useCallback(
    (messageUuid: string, selectedText?: string): WorkspaceResolvedReplyTarget | null => {
      if (
        selection.status !== "conversation" ||
        (effectiveRoute?.kind !== "stream" && effectiveRoute?.kind !== "topic")
      ) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return null;
      }

      const message = selectKnownMessage(readActiveMessageIndex(), messageUuid);
      if (message?.payload.kind !== "markdown" && message?.payload.kind !== "poll") {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return null;
      }
      if (message.payload.kind === "poll") {
        const content = summarizeMessengerPoll(message.payload, message.pollState);
        if (!content.trim()) return null;
        return {
          message,
          quote: {
            messageUuid: message.uuid,
            senderUuid: message.authorUuid,
            senderName: resolveAuthorLabel(message.authorUuid) ?? t("message.replyTo"),
            quotedContent: content,
            selectedText: content,
          },
        };
      }

      const selectedQuoteText =
        selectedText != null &&
        selectedText.trim().length > 0 &&
        !hasWorkspaceMessageSecretContent(parseWorkspaceMessageBody(message.payload.content))
          ? selectedText
          : undefined;
      const quoteSource = selectedQuoteText ?? message.payload.content.trim();
      if (quoteSource.length === 0) return null;
      const authorLabel = resolveAuthorLabel(message.authorUuid) ?? t("message.replyTo");
      return {
        message,
        quote: {
          messageUuid: message.uuid,
          senderUuid: message.authorUuid,
          senderName: authorLabel,
          quotedContent: message.payload.content.trim(),
          ...(selectedQuoteText == null ? {} : { selectedText: selectedQuoteText }),
        },
      };
    },
    [effectiveRoute, resolveAuthorLabel, selection.status],
  );

  const handleEncryptedReplyMessage = useCallback(
    async (messageUuid: string, selectedText?: string, add = false) => {
      if (
        runtimeContext == null ||
        ownerKey == null ||
        encryptedComposerScopeKey == null ||
        selection.status !== "conversation" ||
        (effectiveRoute?.kind !== "stream" && effectiveRoute?.kind !== "topic")
      )
        return;
      const messages = readActiveMessageIndex();
      const source = selectKnownMessage(messages, messageUuid);
      if (
        messages.ownerKey !== ownerKey ||
        source == null ||
        (source.payload.kind !== "e2ee" && source.payload.kind !== "markdown") ||
        source.projectId !== runtimeContext.projectId ||
        source.streamUuid !== selection.streamUuid ||
        (selection.kind === "topic" && source.topicUuid !== selection.topicUuid)
      )
        return;
      composerEditAttemptRef.current += 1;
      encryptedEditSourceRef.current = null;
      setComposerEditSession(null);
      setComposerEditMessageUuid(null);
      setComposerEditAttachments([]);
      setRestoredWorkspaceReplySession(null);
      const payload = source.payload;
      pendingEncryptedReplySourceRef.current = source;
      const attempt = ++encryptedReplyAttemptRef.current;
      const isUiActionCurrent = captureWorkspaceChatUiAction();
      const isCurrent = () => {
        const latestRuntime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
        const latestMessages = readActiveMessageIndex();
        const latest = selectKnownMessage(latestMessages, messageUuid);
        const catalog = readActiveChats();
        return (
          isUiActionCurrent() &&
          encryptedReplyAttemptRef.current === attempt &&
          latestRuntime != null &&
          workspaceRuntimeOwnerKey(latestRuntime) === ownerKey &&
          latestRuntime.runtimeGeneration === runtimeContext.runtimeGeneration &&
          latestMessages.ownerKey === ownerKey &&
          catalog.ownerKey === ownerKey &&
          catalog.streamsById[source.streamUuid]?.encryption === true &&
          isEncryptedReplySourceCurrent(source, latest)
        );
      };
      let plaintext: string | null;
      try {
        plaintext =
          payload.kind === "markdown"
            ? payload.content
            : await decryptRealChatMessage(runtimeContext, source, isCurrent);
      } catch {
        return;
      }
      if (plaintext == null || plaintext.trim().length === 0 || !isCurrent()) return;
      pendingEncryptedReplySourceRef.current = null;
      const identity = createWorkspaceReplyTabIdentity();
      const targetConversationId = conversationIdForTopic(source.streamUuid, source.topicUuid);
      const senderName = resolveAuthorLabel(source.authorUuid) ?? t("message.replyTo");
      if (selection.kind === "stream") {
        // The route remounts the page. Pass only the reference, then decrypt again in the topic.
        const handoff = stageWorkspaceReplyHandoff({
          ownerKey,
          runtimeGeneration: runtimeContext.runtimeGeneration,
          conversationId: targetConversationId,
          intentId: identity.id,
          identity,
          quote: {
            messageUuid: source.uuid,
            senderUuid: source.authorUuid,
            senderName,
            quotedContent: t("e2ee.lockedTitle"),
            ...(selectedText == null || selectedText.trim().length === 0 ? {} : { selectedText }),
          },
        });
        if (handoff == null) return;
        try {
          await navigate(
            workspaceMessengerTopicRoute({
              orgId: runtimeContext.organizationId,
              projectId: runtimeContext.projectId,
              streamUuid: source.streamUuid,
              topicUuid: source.topicUuid,
            }),
          );
        } catch {
          clearWorkspaceReplyHandoff(handoff.intentId);
        }
        return;
      }
      setEncryptedTabFocusSuppressed(false);
      // Decrypted quotes and answers stay in page memory and never enter durable drafts.
      updateEncryptedComposerState((current) => {
        const valid =
          current?.scopeKey === encryptedComposerScopeKey &&
          current.conversationId === targetConversationId;
        const session = valid ? current.replySession : EMPTY_WORKSPACE_REPLY_SESSION;
        const text = valid ? current.text : "";
        const quote = {
          messageUuid: source.uuid,
          senderUuid: source.authorUuid,
          senderName,
          quotedContent: plaintext,
          ...(selectedText == null || selectedText.trim().length === 0 ? {} : { selectedText }),
        };
        const replySession = add
          ? addWorkspaceReplyTab(session, quote, identity)
          : replyToWorkspaceReply(session, quote, identity, text);
        const activeId = replySession.activeTabId;
        return {
          scopeKey: encryptedComposerScopeKey,
          conversationId: targetConversationId,
          text: session.tabs.length === 0 ? "" : text,
          replySession,
          sources:
            activeId == null ? {} : { ...(valid ? current.sources : {}), [activeId]: source },
        };
      });
    },
    [
      captureWorkspaceChatUiAction,
      conversationId,
      createWorkspaceReplyTabIdentity,
      effectiveRoute?.kind,
      encryptedComposerScopeKey,
      navigate,
      ownerKey,
      resolveAuthorLabel,
      runtimeContext,
      selection,
      updateEncryptedComposerState,
    ],
  );

  useEffect(() => {
    if (encryptedComposerScopeKey == null || !encryptedChatAvailable) return;
    const claim = workspaceReplyHandoffClaimRef.current;
    if (claim == null) return;
    workspaceReplyHandoffClaimRef.current = null;
    completeWorkspaceReplyHandoffClaim(claim);
    void handleEncryptedReplyMessage(
      claim.handoff.quote.messageUuid,
      claim.handoff.quote.selectedText,
    );
  }, [encryptedChatAvailable, encryptedComposerScopeKey, handleEncryptedReplyMessage]);

  const handleReplyMessage = useCallback(
    (messageUuid: string, selectedText?: string) => {
      if (stream?.encryption === true) {
        cancelEncryptedReplies();
        void handleEncryptedReplyMessage(messageUuid, selectedText);
        return;
      }
      const target = resolveWorkspaceReplyTarget(messageUuid, selectedText);
      if (target == null) return;
      const { message, quote } = target;
      const identity = createWorkspaceReplyTabIdentity();
      invalidateWorkspaceReplyHandoffClaim();

      if (
        selection.status === "conversation" &&
        selection.kind === "stream" &&
        runtimeContext != null &&
        ownerKey != null
      ) {
        const targetConversationId = conversationIdForTopic(message.streamUuid, message.topicUuid);
        const handoff = stageWorkspaceReplyHandoff({
          ownerKey,
          runtimeGeneration: runtimeContext.runtimeGeneration,
          conversationId: targetConversationId,
          intentId: identity.id,
          quote,
          identity,
        });
        if (handoff == null) return;

        const targetRoute = workspaceMessengerTopicRoute({
          orgId: runtimeContext.organizationId,
          projectId: runtimeContext.projectId,
          streamUuid: message.streamUuid,
          topicUuid: message.topicUuid,
        });
        try {
          void Promise.resolve(navigate(targetRoute)).catch(() => {
            clearWorkspaceReplyHandoff(handoff.intentId);
          });
        } catch {
          clearWorkspaceReplyHandoff(handoff.intentId);
        }
        return;
      }

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
    [
      cancelEncryptedReplies,
      createWorkspaceReplyTabIdentity,
      handleEncryptedReplyMessage,
      stream?.encryption,
      invalidateWorkspaceReplyHandoffClaim,
      navigate,
      ownerKey,
      resolveWorkspaceReplyTarget,
      runtimeContext,
      selection,
      updateWorkspaceComposerDraft,
    ],
  );

  const handleAddReplyMessage = useCallback(
    (messageUuid: string, selectedText?: string) => {
      if (stream?.encryption === true) {
        const epoch = encryptedReplyQueueEpochRef.current;
        const run = async () => {
          if (encryptedReplyQueueEpochRef.current === epoch)
            await handleEncryptedReplyMessage(messageUuid, selectedText, true);
        };
        encryptedReplyQueueRef.current = encryptedReplyQueueRef.current.then(run, run);
        return;
      }
      const target = resolveWorkspaceReplyTarget(messageUuid, selectedText);
      if (target == null) return;
      const { quote } = target;
      invalidateWorkspaceReplyHandoffClaim();

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
      handleEncryptedReplyMessage,
      stream?.encryption,
      invalidateWorkspaceReplyHandoffClaim,
      isRestoredWorkspaceReplyEdit,
      resolveWorkspaceReplyTarget,
      setWorkspaceReplySession,
    ],
  );

  const handleClearReply = useCallback(
    (reason: MessageComposerReplyClearReason = "manual") => {
      invalidateWorkspaceReplyHandoffClaim();
      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession(null);
        setWorkspaceReplyTabFocusKeySuppressed(false);
        return;
      }
      if (reason === "submit") {
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
    [
      conversationId,
      invalidateWorkspaceReplyHandoffClaim,
      isRestoredWorkspaceReplyEdit,
      ownerKey,
      updateWorkspaceComposerDraft,
    ],
  );

  const handleSelectWorkspaceReplyTab = useCallback(
    (tabId: string, source?: WorkspaceReplyTabSelectSource) => {
      invalidateWorkspaceReplyHandoffClaim();
      setWorkspaceReplyTabFocusKeySuppressed(source === "keyboard");
      if (isRestoredWorkspaceReplyEdit) {
        setRestoredWorkspaceReplySession((current) =>
          current == null ? current : selectWorkspaceReplyTab(current, tabId),
        );
        return;
      }
      setWorkspaceReplySession((current) => selectWorkspaceReplyTab(current, tabId));
    },
    [invalidateWorkspaceReplyHandoffClaim, isRestoredWorkspaceReplyEdit, setWorkspaceReplySession],
  );

  const handleRemoveWorkspaceReplyTab = useCallback(
    (tabId: string) => {
      invalidateWorkspaceReplyHandoffClaim();
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
    [
      invalidateWorkspaceReplyHandoffClaim,
      isRestoredWorkspaceReplyEdit,
      updateWorkspaceComposerDraft,
    ],
  );

  const handleReorderWorkspaceReplyTab = useCallback(
    (tabId: string, destinationIndex: number) => {
      invalidateWorkspaceReplyHandoffClaim();
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
    [invalidateWorkspaceReplyHandoffClaim, isRestoredWorkspaceReplyEdit, setWorkspaceReplySession],
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

  const handleCopyMessageLink = useCallback(
    async (messageUuid: string) => {
      const message = selectKnownMessage(readActiveMessageIndex(), messageUuid);
      const url =
        runtimeContext == null ||
        message == null ||
        readActiveMessageIndex().ownerKey !== ownerKey ||
        message.projectId !== runtimeContext.projectId
          ? null
          : buildWorkspaceMessagePermalink(
              resolveWorkspaceMessageWebOrigin({
                organizationOrigin: runtimeContext.organizationOrigin,
              }) ?? undefined,
              {
                orgId: runtimeContext.organizationId,
                projectId: message.projectId,
                messageUuid: message.uuid,
              },
            );
      if (url == null) {
        setActionError(t("message.messageLinkUnavailable"));
        return;
      }
      const isCurrent = captureWorkspaceChatUiAction();
      const copied = await writeText(url);
      if (!isCurrent()) return;
      if (copied) toast.success(t("message.messageLinkCopied"));
      else setActionError(t("message.copyFailed"));
    },
    [captureWorkspaceChatUiAction, ownerKey, runtimeContext],
  );

  const handleCopyMessageText = useCallback(
    async (messageUuid: string, selectedText?: string) => {
      const message = selectKnownMessage(readActiveMessageIndex(), messageUuid);
      if (message == null) {
        setActionError(t("workspaceMessenger.messageActionTargetMissing"));
        return;
      }
      const isUiActionCurrent = captureWorkspaceChatUiAction();
      let text: string | Promise<string> | undefined =
        message.payload.kind === "markdown" &&
        hasWorkspaceMessageSecretContent(parseWorkspaceMessageBody(message.payload.content))
          ? undefined
          : selectedText;
      if (text == null && message.payload.kind === "markdown") {
        text = formatWorkspaceMessageTimesForCopy(message.payload.content);
      } else if (text == null && message.payload.kind === "poll") {
        text = summarizeMessengerPoll(message.payload, message.pollState);
      } else if (text == null && message.payload.kind === "e2ee") {
        if (runtimeContext == null || ownerKey == null) {
          setActionError(t("message.copyFailed"));
          return;
        }
        const encryptedPayload = message.payload;

        const isCurrent = () => {
          const currentRuntime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
          const messages = readActiveMessageIndex();
          const currentMessage = selectKnownMessage(messages, messageUuid);
          const messenger = readActiveChats();
          if (currentRuntime == null || currentMessage?.payload.kind !== "e2ee") {
            return false;
          }
          return (
            workspaceRuntimeOwnerKey(currentRuntime) === ownerKey &&
            currentRuntime.runtimeGeneration === runtimeContext.runtimeGeneration &&
            messages.ownerKey === ownerKey &&
            messenger.ownerKey === ownerKey &&
            canPrepareMessengerEncryptedMessage({
              runtime: currentRuntime,
              message: currentMessage,
              catalogOwner: messenger.ownerKey,
              messageOwner: messages.ownerKey,
              stream: messenger.streamsById[message.streamUuid],
            }) &&
            currentMessage.projectId === message.projectId &&
            currentMessage.streamUuid === message.streamUuid &&
            currentMessage.payload.keyUuid === encryptedPayload.keyUuid &&
            currentMessage.payload.content === encryptedPayload.content
          );
        };

        text = decryptRealChatMessage(runtimeContext, message, isCurrent).then((plaintext) => {
          if (plaintext == null || !isCurrent()) throw new Error("Message is no longer available");
          return formatWorkspaceMessageTimesForCopy(plaintext);
        });
      }

      const copied = text != null && (await writeText(text));
      if (!copied && isUiActionCurrent()) {
        setActionError(t("message.copyFailed"));
      }
    },
    [captureWorkspaceChatUiAction, ownerKey, runtimeContext],
  );

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
    async (messageUuid: string, emojiName: string) => {
      setActionError(null);
      if (runtimeContext == null) {
        setActionError(t("workspaceMessenger.runtimeUnavailable"));
        return;
      }

      const isUiActionCurrent = captureWorkspaceChatUiAction();
      try {
        const result = await runMessengerRuntimeMutation(runtimeContext, (signal) =>
          messageCommands.toggleReaction({
            runtimeContext,
            signal,
            messageUuid,
            emojiName,
          }),
        );
        if (result.status === "applied" && result.operation === "added") {
          recordWorkspaceMessageQuickReactionUse(result.emojiName);
        }
      } catch (error) {
        if (isUiActionCurrent()) {
          setActionError(normalizeWorkspaceActionError(error, t("message.reactionError")));
        }
      }
    },
    [captureWorkspaceChatUiAction, runtimeContext],
  );

  const handleDownloadFile = useCallback(
    (file: { fileUuid: string; name?: string }) => {
      setActionError(null);
      if (runtimeContext == null) {
        setActionError(t("workspaceMessenger.runtimeUnavailable"));
        return;
      }

      const isUiActionCurrent = captureWorkspaceChatUiAction();
      return startWorkspaceFileDownload({
        runtimeContext,
        fileUuid: file.fileUuid,
        fileNameHint: file.name,
        loadBrowserResource: (freshRuntimeContext) =>
          runChatScopedAction((signal) =>
            workspaceFileResourceCache.load({
              ownerKey: workspaceRuntimeOwnerKey(freshRuntimeContext),
              runtimeGeneration: freshRuntimeContext.runtimeGeneration,
              fileUuid: file.fileUuid,
              requestOptions: buildMessengerRequestOptions(freshRuntimeContext),
              signal,
            }),
          ),
      }).catch((error) => {
        if (
          isUiActionCurrent() &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setActionError(
            normalizeWorkspaceActionError(error, t("workspaceMessenger.fileDownloadFailed")),
          );
        }
      });
    },
    [captureWorkspaceChatUiAction, runChatScopedAction, runtimeContext, workspaceFileResourceCache],
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

  const clearMediaViewerError = useCallback(() => setActionError(null), []);
  const handleMediaViewerRuntimeUnavailable = useCallback(
    () => setActionError(t("workspaceMessenger.runtimeUnavailable")),
    [],
  );
  const handleOpenUnsupportedFilePreview = useCallback(
    () => setActionError(t("workspaceMessenger.mediaViewerUnsupported")),
    [],
  );
  const handleMediaViewerLoadError = useCallback((error: unknown) => {
    setActionError(
      normalizeWorkspaceActionError(error, t("workspaceMessenger.mediaViewerUnsupported")),
    );
  }, []);
  const { open: openComposerMedia, sync: syncComposerMedia } = useComposerMediaViewer();
  const { openWorkspaceMedia: handleOpenWorkspaceMedia } = useWorkspaceMediaViewer({
    scope: {
      ownerKey,
      runtimeGeneration: runtimeContext?.runtimeGeneration ?? null,
      conversationId,
    },
    enabled: runtimeContext != null,
    loadResource: handleLoadWorkspaceFileResource,
    runAction: runChatScopedAction,
    onDownload: handleDownloadFile,
    deriveDownloadFileName: deriveWorkspaceDownloadFileName,
    onOpenStart: clearMediaViewerError,
    onRuntimeUnavailable: handleMediaViewerRuntimeUnavailable,
    onUnsupported: handleOpenUnsupportedFilePreview,
    onLoadError: handleMediaViewerLoadError,
  });

  const { scheduleReadBatch, scheduleTopicReadAtBottom, readRequestBoundaryMessageUuids } =
    useWorkspaceVisibleMessageRead({ runtimeContext, conversationId, topicUuid });

  const focusedAnchorIntentId =
    hasAnchorRoute &&
    messageNavigationIntent?.phase === "focused" &&
    messageNavigationIntent.conversationId === conversationId
      ? messageNavigationIntent.id
      : null;
  const anchorPaginationScopeKey =
    focusedAnchorIntentId == null ? null : `${tailRequestScopeKey}:${focusedAnchorIntentId}`;

  // Догрузка привязана к разговору, поколению сессии и режиму маршрута.
  useLayoutEffect(() => {
    return () => {
      cancelActiveConversationPagination();
      setWindowPaginationErrorDirection(null);
    };
  }, [cancelActiveConversationPagination, conversationId, hasAnchorRoute, messages]);

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
    (direction: "before" | "after", intentId: number): void => {
      if (messages == null || conversationId == null) return;
      const window = messages.getWindow(conversationId);
      if (direction === "before" ? !window.hasOlder : !window.hasNewer) return;
      if (anchorPaginationRequestRef.current != null) return;
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
      void runChatScopedAction(
        (signal) =>
          messages.loadMore({
            conversationId,
            direction,
            signal,
            view: intentId === 0 ? undefined : "message-anchor",
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
          } else if (result.status === "failed") {
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
    [conversationId, messages, runChatScopedAction],
  );

  const handleLoadOlder = useCallback(() => {
    if (
      opening.pending ||
      messages == null ||
      conversationId == null ||
      messagesLoading ||
      conversationPaginationRequestRef.current != null
    )
      return;

    if (hasAnchorRoute) {
      if (focusedAnchorIntentId != null) startAnchorPagination("before", focusedAnchorIntentId);
      return;
    }

    const { hasOlder, mode, loading } = messages.getWindow(conversationId);
    if (!hasOlder || mode == null || loading) return;

    const controller = new AbortController();
    const requestToken = Symbol("conversation-pagination-request");
    const requestState = { conversationId, requestToken };
    // Список хранит позицию перед вставкой, пока выполняется именно догрузка сверху.
    conversationPaginationRequestRef.current = { ...requestState, controller, mode };
    setConversationPaginationState(requestState);
    if (mode === "around-anchor") setWindowPaginationErrorDirection(null);
    const isCurrentRequest = () =>
      conversationPaginationRequestRef.current?.requestToken === requestToken;
    const showBoundaryError = () => {
      if (isCurrentRequest() && mode === "around-anchor")
        setWindowPaginationErrorDirection("before");
    };
    void messages
      .loadMore({ conversationId, direction: "before", signal: controller.signal })
      .then((result) => {
        if (result.status === "failed") showBoundaryError();
      }, showBoundaryError)
      .finally(() => {
        if (!isCurrentRequest()) return;
        conversationPaginationRequestRef.current = null;
        setConversationPaginationState((current) =>
          current?.requestToken === requestToken ? null : current,
        );
      });
  }, [
    opening.pending,
    conversationId,
    focusedAnchorIntentId,
    hasAnchorRoute,
    messages,
    messagesLoading,
    startAnchorPagination,
  ]);

  const handleEditLastMessage = useCallback(() => {
    for (let index = routeMessages.length - 1; index >= 0; index -= 1) {
      const message = routeMessages[index];
      if (
        message?.isOwn === true &&
        ((message.payload.kind === "e2ee" && stream?.encryption === true) ||
          (message.payload.kind === "markdown" &&
            !hasWorkspaceForwardSnapshot(parseWorkspaceMessageBody(message.payload.content))))
      ) {
        handleEditMessage(message.uuid);
        return;
      }
    }
    setActionError(t("message.editUnavailable"));
  }, [handleEditMessage, routeMessages, stream?.encryption]);

  const handleCancelEdit = useCallback(() => {
    composerEditAttemptRef.current += 1;
    encryptedEditSourceRef.current = null;
    invalidateWorkspaceReplyHandoffClaim();
    setRestoredWorkspaceReplySession(null);
    setComposerEditSession(null);
    setComposerEditMessageUuid(null);
    setComposerEditAttachments([]);
  }, [invalidateWorkspaceReplyHandoffClaim]);

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
      opening.pending ||
      runtimeContext == null ||
      conversationId == null ||
      messagesLoading ||
      !hasNewerMessages ||
      conversationPaginationRequestRef.current != null ||
      (hasAnchorRoute && focusedAnchorIntentId == null)
    ) {
      return;
    }
    startAnchorPagination("after", focusedAnchorIntentId ?? 0);
  }, [
    opening.pending,
    conversationId,
    focusedAnchorIntentId,
    hasAnchorRoute,
    hasNewerMessages,
    messagesLoading,
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
      if (messages == null || conversationId == null || intent.settled) {
        settleTailWindowIntent(intent);
        return;
      }

      const requestedLastMessageUuid = intent.messageUuid;
      const requestToken = Symbol("tail-window-request");
      const requestScopeKey = tailRequestScopeKey;
      setWindowPaginationDirection("tail");
      setActionError(null);
      void runChatScopedAction(
        (signal) =>
          messages.openTail({
            conversationId,
            messageUuid: requestedLastMessageUuid,
            signal,
            isRequestCurrent: () =>
              tailWindowRequestRef.current?.requestToken === requestToken &&
              tailWindowIntentRef.current === intent,
          }),
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
            acceptOpeningWindow();
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
      acceptOpeningWindow,
      messages,
      runChatScopedAction,
      settleTailWindowIntent,
      t,
      tailRequestScopeKey,
    ],
  );

  const handleLoadLatestWindow = useCallback(
    (requestedLastMessageUuid: MessengerUuid): Promise<void> => {
      if (messages == null || conversationId == null) return Promise.resolve();

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

      const window = messages.getWindow(conversationId);
      if (window.messages.some((message) => message.uuid === requestedLastMessageUuid)) {
        setWindowPaginationDirection(null);
        settleTailWindowIntent(intent);
        return intent.promise;
      }

      if (!replacesActiveTailRequest && window.loading) {
        queuedTailMessageUuidRef.current = requestedLastMessageUuid;
        return intent.promise;
      }

      startTailWindowRequest(intent);
      return intent.promise;
    },
    [conversationId, messages, settleTailWindowIntent, startTailWindowRequest, tailRequestScopeKey],
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
    takeOpeningControl();
    cancelMessageNavigationForTail();
    cancelActiveAnchorPagination();
    // При переходе к концу догрузка от якоря теряет смысл. Догрузку окна у конца можно дождаться.
    if (conversationPaginationRequestRef.current?.mode === "around-anchor") {
      cancelActiveConversationPagination();
    }
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
    takeOpeningControl,
    cancelActiveAnchorPagination,
    cancelActiveConversationPagination,
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
    if (messagesLoading) return;

    const queuedMessageUuid = queuedTailMessageUuidRef.current;
    if (queuedMessageUuid == null) return;
    queuedTailMessageUuidRef.current = null;
    const intent = tailWindowIntentRef.current;
    if (intent?.messageUuid !== queuedMessageUuid) return;

    if (
      conversationId == null ||
      messages
        ?.getWindow(conversationId)
        .messages.some((message) => message.uuid === queuedMessageUuid)
    ) {
      settleTailWindowIntent(intent);
      return;
    }
    startTailWindowRequest(intent);
  }, [conversationId, messages, messagesLoading, settleTailWindowIntent, startTailWindowRequest]);

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
    toggleChatInfoDrawer(rightDrawer);
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
  const handleOpenMessagePermalink = useCallback(
    (path: string) => {
      void navigate(path);
    },
    [navigate],
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

      openWorkspaceTopic(reference.topicUuid);
    },
    [navigate, runtimeContext, openWorkspaceTopic],
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
      rightPanelOpen: isChatInfoDrawerOpen(rightDrawer),
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
      : `${workspaceComposerDraftScopeKey}:${completedComposerDraftVisit ?? ""}:${
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
      encrypted={stream?.encryption === true}
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

  const encryptedReplySession =
    currentEncryptedComposer?.replySession ?? EMPTY_WORKSPACE_REPLY_SESSION;
  const activeReplySession =
    stream?.encryption === true ? encryptedReplySession : workspaceReplySession;
  const resolvedComposerTarget = resolveSendTarget();
  const workspaceAttachmentTarget: WorkspaceComposerAttachmentTarget | null =
    runtimeContext != null &&
    ownerKey != null &&
    conversationId != null &&
    !isTopicClosed &&
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
  const hasKeyUpdateComposerNotice =
    stream?.encryption === true && hasOutdatedSendingKey && dismissedKeyNotice !== keyNoticeId;
  const showStreamTopicPrompt = selection.status === "conversation" && selection.kind === "stream";
  const replyTargetReady =
    runtimeContext != null &&
    ownerKey != null &&
    workspaceAttachmentTarget != null &&
    !showStreamTopicPrompt;
  const handleReplySelectedMessages = useCallback(() => {
    const messageUuids = [...selectedMessageUuids];
    if (messageUuids.length === 0 || !replyTargetReady) {
      setActionError(t("workspaceMessenger.messageActionTargetMissing"));
      return;
    }

    const quotes: WorkspaceReplyQuote[] = [];
    for (const messageUuid of messageUuids) {
      const target = resolveWorkspaceReplyTarget(messageUuid);
      if (target == null) return;
      quotes.push(target.quote);
    }

    setActionError(null);
    const entries = quotes.map((quote) => ({
      quote,
      identity: createWorkspaceReplyTabIdentity(),
    }));
    invalidateWorkspaceReplyHandoffClaim();

    if (isRestoredWorkspaceReplyEdit) {
      if (appendWorkspaceReplyTabs(workspaceReplySession, entries) == null) return;
      setRestoredWorkspaceReplySession(
        (current) =>
          appendWorkspaceReplyTabs(current ?? EMPTY_WORKSPACE_REPLY_SESSION, entries) ?? current,
      );
      setWorkspaceReplyTabFocusKeySuppressed(false);
      setSelectedMessageUuids(new Set());
      return;
    }

    const applied = updateWorkspaceComposerDraft((content) => {
      const hasExistingReplyTabs = content.replySession.tabs.length > 0;
      const nextReplySession = appendWorkspaceReplyTabs(
        content.replySession,
        entries,
        hasExistingReplyTabs ? "" : content.text,
      );
      if (nextReplySession == null) return null;
      return {
        ...content,
        text: hasExistingReplyTabs ? content.text : "",
        replySession: nextReplySession,
      };
    });
    if (!applied) return;

    setComposerEditMessageUuid(null);
    setComposerEditSession(null);
    setComposerEditAttachments([]);
    setRestoredWorkspaceReplySession(null);
    setWorkspaceReplyTabFocusKeySuppressed(false);
    setSelectedMessageUuids(new Set());
  }, [
    createWorkspaceReplyTabIdentity,
    invalidateWorkspaceReplyHandoffClaim,
    isRestoredWorkspaceReplyEdit,
    replyTargetReady,
    resolveWorkspaceReplyTarget,
    selectedMessageUuids,
    updateWorkspaceComposerDraft,
    workspaceReplySession,
  ]);
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
            messagesLoading={messagesLoading || opening.pending}
            hasInitialPayload={routeMessages.length > 0 || conversationWindowMode != null}
            initialPositionReady={initialPositionReady}
            initialPositionCancelled={opening.cancelled}
            onUserScrollInput={takeOpeningControl}
            messages={routeMessages}
            messagesModel={messages}
            outgoingMessages={outgoingMessages}
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
              routeMessages.length > 0 &&
              ((!hasAnchorRoute &&
                conversationPaginationState?.conversationId === selection.conversationId) ||
                (messagesLoading && windowPaginationDirection === "before"))
            }
            isLoadingNewer={
              messagesLoading && routeMessages.length > 0 && windowPaginationDirection === "after"
            }
            onLoadNewer={handleLoadNewer}
            hasOlderMessages={!opening.pending && hasOlderMessages}
            hasNewerMessages={!opening.pending && hasNewerMessages}
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
            readRequestBoundaryMessageUuids={readRequestBoundaryMessageUuids}
            onUnreadMessagesVisible={
              anchorHandoffPending || !opening.ready ? undefined : scheduleReadBatch
            }
            onUnreadMessagesAtBottom={
              anchorHandoffPending ||
              !opening.ready ||
              conversationWindowMode === "around-anchor" ||
              selection.kind !== "topic"
                ? undefined
                : scheduleTopicReadAtBottom
            }
            onReplyMessage={handleReplyMessage}
            onReplySelectedMessages={replyTargetReady ? handleReplySelectedMessages : undefined}
            onAddReplyMessage={
              selection.kind !== "topic" || activeReplySession.tabs.length === 0
                ? undefined
                : handleAddReplyMessage
            }
            onForwardMessage={handleForwardMessage}
            messageWebOrigin={resolveWorkspaceMessageWebOrigin({
              organizationOrigin: runtimeContext?.organizationOrigin,
            })}
            onOpenMessagePermalink={handleOpenMessagePermalink}
            onOpenMessageInChat={handleOpenMessageInChat}
            onOpenMentionUser={openWorkspaceUserProfile == null ? undefined : handleOpenMentionUser}
            onOpenWorkspaceReference={handleOpenWorkspaceReference}
            onToggleMessageSelection={handleToggleMessageSelection}
            onEditMessage={handleEditMessage}
            onRequestMessageKey={handleRequestMessageKey}
            onRequestSecretKey={handleRequestSecretKey}
            requestMessageKeyPending={encryptedChat.loading || encryptedChat.state.pending}
            getKeyRequestActions={getKeyRequestActions}
            getKeyServiceState={getKeyServiceState}
            onRequestDeleteMessage={handleRequestDeleteMessage}
            onCopyMessageLink={handleCopyMessageLink}
            onCopyMessageText={handleCopyMessageText}
            onToggleMessageReaction={handleToggleMessageReaction}
            onDownloadFile={handleDownloadFile}
            downloadOwnerKey={ownerKey}
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

  const composerJoinedTop =
    hasKeyUpdateComposerNotice ||
    (!showStreamTopicPrompt &&
      (hasSelectionComposerNotice || hasInlineComposerNotice || hasDeleteComposerNotice));
  const encryptedReplyTab = encryptedReplySession.tabs.find(
    (tab) => tab.id === encryptedReplySession.activeTabId,
  );
  const encryptedReplyQuote: ReplyQuote | null =
    encryptedReplyTab == null
      ? null
      : {
          id: encryptedReplyTab.messageUuid,
          content: encryptedReplyTab.selectedText ?? encryptedReplyTab.quotedContent,
          sender_full_name: encryptedReplyTab.senderName,
          sender_uuid: encryptedReplyTab.senderUuid,
          quoteFormat: "workspace",
          permalinkUrl: null,
        };
  const encryptedReplyBody =
    encryptedReplySession.tabs.length === 0
      ? undefined
      : buildWorkspaceReplyMarkdown(encryptedReplySession.tabs);
  const handleEncryptedComposerValueChange = useCallback(
    (text: string) => {
      if (encryptedComposerScopeKey == null || conversationId == null) return;
      updateEncryptedComposerState((current) => {
        const valid =
          current?.scopeKey === encryptedComposerScopeKey &&
          current.conversationId === conversationId;
        const replySession = valid ? current.replySession : EMPTY_WORKSPACE_REPLY_SESSION;
        return {
          scopeKey: encryptedComposerScopeKey,
          conversationId,
          text: replySession.tabs.length === 0 ? text : (current?.text ?? ""),
          replySession:
            replySession.tabs.length === 0
              ? replySession
              : setWorkspaceReplyAnswer(replySession, text),
          sources: valid ? current.sources : {},
        };
      });
    },
    [conversationId, encryptedComposerScopeKey, updateEncryptedComposerState],
  );
  const handleClearEncryptedReply = useCallback(
    (reason?: MessageComposerReplyClearReason) => {
      cancelEncryptedReplies();
      updateEncryptedComposerState((current) =>
        current == null
          ? null
          : {
              ...current,
              replySession: EMPTY_WORKSPACE_REPLY_SESSION,
              sources: {},
              text:
                reason === "submit"
                  ? ""
                  : (current.replySession.tabs.find(
                      (tab) => tab.id === current.replySession.activeTabId,
                    )?.answer ?? current.text),
            },
      );
    },
    [cancelEncryptedReplies, updateEncryptedComposerState],
  );
  const handleEncryptedSelectTab = useCallback(
    (id: string, source?: WorkspaceReplyTabSelectSource) => {
      setEncryptedTabFocusSuppressed(source === "keyboard");
      updateEncryptedComposerState((current) =>
        current == null
          ? null
          : { ...current, replySession: selectWorkspaceReplyTab(current.replySession, id) },
      );
    },
    [updateEncryptedComposerState],
  );
  const handleEncryptedRemoveTab = useCallback(
    (id: string) => {
      cancelEncryptedReplies();
      updateEncryptedComposerState((current) => {
        if (current == null) return null;
        const removed = current.replySession.tabs.find((tab) => tab.id === id);
        const replySession = removeWorkspaceReplyTab(current.replySession, id);
        const sources = { ...current.sources };
        delete sources[id];
        return {
          ...current,
          replySession,
          sources,
          text: replySession.tabs.length === 0 ? (removed?.answer ?? current.text) : current.text,
        };
      });
    },
    [cancelEncryptedReplies, updateEncryptedComposerState],
  );
  const handleEncryptedReorderTab = useCallback(
    (id: string, index: number) =>
      updateEncryptedComposerState((current) =>
        current == null
          ? null
          : { ...current, replySession: reorderWorkspaceReplyTab(current.replySession, id, index) },
      ),
    [updateEncryptedComposerState],
  );
  const restoredAttachments = useMemo(
    () =>
      composerEditAttachments.map((attachment) => ({
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
      })),
    [composerEditAttachments],
  );
  const renderEncryptedComposer = useCallback(
    (controlledProps?: WorkspaceComposerControlledProps) => (
      <MessageComposer
        {...controlledProps}
        onOpenComposerMedia={openComposerMedia}
        onComposerAttachmentsChange={syncComposerMedia}
        key={`${encryptedComposerScopeKey}:${conversationId}`}
        onSend={controlledProps?.onSend ?? handleSend}
        attachments={[...restoredAttachments, ...(controlledProps?.attachments ?? [])]}
        onRemoveAttachment={(localId) =>
          handleRemoveComposerAttachment(localId, controlledProps?.onRemoveAttachment ?? noop)
        }
        onEditLastMessage={handleEditLastMessage}
        editSession={effectiveComposerEditSession}
        onSubmitEdit={controlledProps?.onSubmitEdit ?? handleSubmitEdit}
        onCancelEdit={handleCancelEdit}
        capabilities={encryptedComposerCapabilities}
        disabled={isTopicClosed || !encryptedChatAvailable}
        initialValue={encryptedReplyTab?.answer ?? currentEncryptedComposer?.text ?? ""}
        draftSessionKey={`${encryptedComposerScopeKey}:${conversationId}:${encryptedReplyTab?.id ?? "draft"}`}
        onValueChange={handleEncryptedComposerValueChange}
        leadingContent={
          encryptedReplySession.tabs.length > 1 ? (
            <WorkspaceReplyTabs
              session={encryptedReplySession}
              onSelect={handleEncryptedSelectTab}
              onRemove={handleEncryptedRemoveTab}
              onReorder={handleEncryptedReorderTab}
            />
          ) : null
        }
        allowEmptyActiveValueSend={encryptedReplySession.tabs.some(
          (tab) => tab.answer.trim().length > 0,
        )}
        replyQuote={encryptedReplyQuote}
        outgoingBodyOverride={encryptedReplyBody}
        onClearReply={handleClearEncryptedReply}
        focusKey={encryptedTabFocusSuppressed ? null : encryptedReplyTab?.id}
        optimisticClearOnSend
        aiMessagesContext={[]}
        joinedTop={composerJoinedTop}
      />
    ),
    [
      openComposerMedia,
      syncComposerMedia,
      encryptedComposerScopeKey,
      conversationId,
      currentEncryptedComposer?.text,
      encryptedReplyQuote,
      encryptedReplySession,
      handleEncryptedSelectTab,
      handleEncryptedRemoveTab,
      handleEncryptedReorderTab,
      encryptedReplyBody,
      encryptedReplyTab?.id,
      encryptedTabFocusSuppressed,
      handleEncryptedComposerValueChange,
      handleClearEncryptedReply,
      handleSend,
      encryptedComposerCapabilities,
      encryptedChatAvailable,
      isTopicClosed,
      composerJoinedTop,
      restoredAttachments,
      handleRemoveComposerAttachment,
      handleEditLastMessage,
      effectiveComposerEditSession,
      handleSubmitEdit,
      handleCancelEdit,
    ],
  );
  const renderWorkspaceAttachmentComposer = useCallback(
    (controlledProps: WorkspaceComposerControlledProps) => {
      return (
        <ChatPageComposerSection
          onCreatePoll={canCreatePoll ? () => setPollDialogOpen(true) : undefined}
          {...controlledProps}
          onOpenComposerMedia={openComposerMedia}
          onComposerAttachmentsChange={syncComposerMedia}
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
          optimisticClearOnSend="after-acceptance"
          sendDisabled={workspaceReplyHandoffBlocksSend}
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
          secretFragments={
            stream?.sourceName === "native" && !stream.encryption
              ? { canRotate: encryptedChat.session?.getRights().canSend === true }
              : undefined
          }
          composerCapabilities={workspaceComposerCapabilities}
          resolveMention={resolveMention}
          onLoadWorkspaceFilePreview={handleLoadWorkspaceFilePreview}
          aiMessagesContext={[]}
          aiChatContext={undefined}
          readOnlyReason={composerReadOnlyReason}
          mentionContext={composerMentionContext}
          joinedTop={composerJoinedTop}
        />
      );
    },
    [
      openComposerMedia,
      syncComposerMedia,
      activeWorkspaceReplyQuote,
      activeWorkspaceReplyTab?.answer,
      activeWorkspaceReplyTab?.id,
      composerReadOnlyReason,
      canCreatePoll,
      restoredAttachments,
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
      workspaceReplyHandoffBlocksSend,
      workspaceReplyOutgoingBody,
      workspaceReplySession,
      workspaceReplyTabFocusKeySuppressed,
      stream?.sourceName,
      encryptedChat.session,
      encryptedChat.state,
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
          replyDisabled={selectedMessageUuids.size === 0 || !replyTargetReady}
          forwardDisabled={selectedMessageUuids.size === 0}
          deleteDisabled
          onReply={handleReplySelectedMessages}
          onForward={handleForwardSelectedMessages}
          onDelete={noop}
          onCancel={handleCancelMessageSelection}
          joinedBelow={
            hasInlineComposerNotice ||
            hasDeleteComposerNotice ||
            hasKeyUpdateComposerNotice ||
            !showStreamTopicPrompt
          }
          omitBottomBorder={!hasInlineComposerNotice && !hasDeleteComposerNotice}
        />
        <ChatPageInlineAlerts
          routeResolveError={null}
          actionError={actionError}
          sendError={sendError}
          onDismissRouteResolveError={noop}
          onDismissActionError={() => setActionError(null)}
          onDismissSendError={() => setSendError(null)}
          joinedAbove={hasSelectionComposerNotice}
          joinedBelow={
            hasDeleteComposerNotice || hasKeyUpdateComposerNotice || !showStreamTopicPrompt
          }
        />
        {pendingDeleteMessageUuid != null ? (
          <ChatPageDeleteConfirmBar
            mode="single"
            onConfirm={handleConfirmDeleteMessage}
            onCancel={handleCancelDeleteMessage}
            joinedAbove={hasSelectionComposerNotice || hasInlineComposerNotice}
            joinedBelow={hasKeyUpdateComposerNotice || !showStreamTopicPrompt}
          />
        ) : null}
        {hasKeyUpdateComposerNotice ? (
          <div
            className={chatBottomNoticeBarClassName({
              joinedAbove:
                hasSelectionComposerNotice || hasInlineComposerNotice || hasDeleteComposerNotice,
              joinedBelow: true,
              shellOnly: true,
              className: "border-b-0",
            })}
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 pt-3 text-accent">
              <p role="status" className="text-sm">
                {t("e2ee.keyUpdatedNotice")}
              </p>
              <div className="flex items-center gap-2">
                {encryptedChat.session?.getRights().canRequest ? (
                  <Button
                    size="sm"
                    className="font-normal!"
                    disabled={
                      encryptedChat.loading ||
                      encryptedChat.state.pending ||
                      encryptedChat.state.requestStatus === "requested"
                    }
                    onClick={() => {
                      void encryptedChat.requestKey();
                    }}
                  >
                    {t(
                      encryptedChat.state.requestStatus === "requested"
                        ? "e2ee.statusWaiting"
                        : "e2ee.requestUpdatedKey",
                    )}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  appearance="ghost"
                  className="h-6 w-6 p-0"
                  aria-label={t("common.close")}
                  onClick={() => setDismissedKeyNotice(keyNoticeId)}
                >
                  <Icon name="close" size={16} />
                </Button>
              </div>
              {encryptedChat.error ? (
                <p role="alert" className="w-full text-sm text-danger">
                  {encryptedChat.error}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {stream?.encryption === true && (encryptedChatAvailable || encryptedChat.loading) ? (
          <>
            {encryptedChat.loading && !encryptedChatAvailable ? (
              <span className="sr-only" role="status">
                {t("e2ee.loading")}
              </span>
            ) : null}
            {workspaceAttachmentTarget != null && runtimeContext != null && ownerKey != null ? (
              <WorkspaceComposerAttachments
                key={`${ownerKey}:${runtimeContext.runtimeGeneration}:${conversationId}`}
                runtimeContext={runtimeContext}
                ownerKey={ownerKey}
                target={workspaceAttachmentTarget}
                sessionKey={
                  composerEditMessageUuid == null ? "compose" : `edit:${composerEditMessageUuid}`
                }
                editAttachmentMarkdown={composerEditAttachments.map(
                  (attachment) => attachment.markdown,
                )}
                onSubmitEditFinalMarkdown={handleSubmitEditFinalMarkdown}
                onSendFinalMarkdown={handleSend}
                renderComposer={renderEncryptedComposer}
              />
            ) : (
              renderEncryptedComposer()
            )}
          </>
        ) : stream?.encryption === true ? (
          <div className="border-t border-border-subtle px-4 py-5 text-sm text-text-muted">
            <p role="status">
              {encryptedChat.loading
                ? t("e2ee.loading")
                : encryptedChat.state.requestStatus === "requested"
                  ? t("e2ee.statusWaiting")
                  : encryptedChat.state.requestStatus === "rejected"
                    ? t("e2ee.requestRejected")
                    : t("e2ee.lockedDescription")}
            </p>
            {encryptedChat.error ? (
              <p role="alert" className="mt-2 text-danger">
                {encryptedChat.error}
              </p>
            ) : null}
            {encryptedChat.session?.getRights().canRequest ? (
              <Button
                className="mt-3"
                variant="neutral"
                disabled={encryptedChat.loading || encryptedChat.state.pending}
                onClick={() => {
                  void encryptedChat.requestKey();
                }}
              >
                {t("e2ee.requestAccess")}
              </Button>
            ) : null}
          </div>
        ) : showStreamTopicPrompt ? (
          <ChatPageStreamTopicPrompt
            topics={streamPromptTopics}
            onSelectTopic={handleSelectStreamPromptTopic}
            topBorderVisible={!hasInlineComposerNotice && !hasDeleteComposerNotice}
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
        ) : isTopicClosed ? (
          <ChatPageClosedTopicPrompt
            pending={topicReopenPending}
            onReopenTopic={handleReopenClosedTopic}
            topBorderVisible={!composerJoinedTop}
          />
        ) : (
          <ChatPageComposerSection
            onCreatePoll={canCreatePoll ? () => setPollDialogOpen(true) : undefined}
            isDmView={false}
            activeDmUserIds={null}
            activeStream={stream?.name ?? conversation?.title}
            showTopicPrompt={false}
            streamSlug={undefined}
            onExpandStreamTopics={noop}
            uploadProgress={null}
            onSend={handleSend}
            optimisticClearOnSend="after-acceptance"
            sendDisabled={workspaceReplyHandoffBlocksSend}
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
            secretFragments={
              stream?.sourceName === "native" && !stream.encryption
                ? { canRotate: encryptedChat.session?.getRights().canSend === true }
                : undefined
            }
            composerCapabilities={workspaceComposerCapabilities}
            resolveMention={resolveMention}
            onLoadWorkspaceFilePreview={handleLoadWorkspaceFilePreview}
            aiMessagesContext={[]}
            aiChatContext={undefined}
            readOnlyReason={composerReadOnlyReason}
            mentionContext={composerMentionContext}
            joinedTop={composerJoinedTop}
          />
        )}
        <CreatePollDialog
          key={`${ownerKey}:${conversationId}:${runtimeContext?.runtimeGeneration}`}
          open={pollDialogOpen && canCreatePoll}
          onOpenChange={(open) => {
            setPollDialogOpen(open);
            if (!open) pollAttemptRef.current = null;
          }}
          onCreate={handleCreatePoll}
        />
      </section>
    </div>
  );
};
