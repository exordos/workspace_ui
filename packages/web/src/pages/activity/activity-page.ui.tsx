// /activity/:filter keeps Zulip-backed mentions/reactions cache-first; Workspace starred uses native messages.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  hydrateActivityMessagesFromCache,
  isActivityMessagesSnapshotFresher,
} from "~/entities/activity/activity-cache.lib";
import { ensureReactionsLoaded } from "~/entities/activity/activity-reactions-loader.lib";
import { fetchWorkspaceStarredMessages } from "~/entities/activity/activity-workspace-starred.api";
import { loadLegacyActivityEmptyPage } from "~/entities/activity/activity.api";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import type { Draft } from "~/entities/draft/draft.types";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestInvalidated,
  isActiveOrgRequestContextCurrent,
  useInstancesStore,
} from "~/entities/instance/instance.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { t } from "~/i18n/i18n";
import { unstarMessageUnsupported } from "~/shared/api/messenger-messages.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import type { ActivityFilter, ZulipRawMessage } from "~/shared/api/zulip.types";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatActivityItemTime } from "~/shared/lib/datetime.lib";
import { buildDmRouteSlugFromRecipients } from "~/shared/lib/dm-route-slug.lib";
import { createLogger } from "~/shared/lib/logger";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildNavigableRouteFromMessage } from "~/shared/lib/push-click";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";
import { scrollToBottom } from "~/shared/lib/scroll-position.lib";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import type { WorkspaceMessageSummaryOptions } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import {
  workspaceActivityRoute,
  workspaceInboxRoute,
  workspaceMessengerMessageRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { AppDialog, DialogCancelButton, DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { MY_ACTIVITY, messageToDmEntry } from "~/widgets/sidebar/sidebar.lib";
import { ActivityPeerReactionsRow } from "./activity-page-peer-reactions.ui";
import {
  buildMessageNavigateRoute,
  formatActivityMessageContext,
  formatDraftMessageContext,
} from "./activity-page.lib";
import type { ActivityPageExtendedFilter } from "./activity-page.types";

const log = createLogger("activity-page");

const ACTIVITY_FILTERS: ActivityFilter[] = ["starred", "mentions", "reactions"];
const ALL_FILTERS = [
  ...ACTIVITY_FILTERS,
  "drafts",
] as const satisfies readonly ActivityPageExtendedFilter[];
const EMPTY_ACTIVITY_MESSAGES: ZulipRawMessage[] = [];
const EMPTY_WORKSPACE_STARRED_MESSAGES: WorkspaceMessengerMessageDto[] = [];
const ACTIVITY_PAGE_SIZE = 200;
const ACTIVITY_WORKSPACE_SUMMARY_OPTIONS = {
  maxLength: 80,
  includeMediaLabel: true,
  includeAttachmentLabel: true,
  includeQuotePrefix: true,
} as const satisfies WorkspaceMessageSummaryOptions;

interface WorkspaceStarredState {
  ownerKey: string | null;
  messages: WorkspaceMessengerMessageDto[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function getActivityTitle(filter: ActivityPageExtendedFilter): string {
  const item = MY_ACTIVITY.find(
    (i) =>
      (filter === "starred" && i.key === "favorites") ||
      (filter === "mentions" && i.key === "mentions") ||
      (filter === "reactions" && i.key === "reactions") ||
      (filter === "drafts" && i.key === "drafts"),
  );
  return item ? t(item.labelKey) : filter;
}

function truncateText(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function formatItemTime(ts: number): string {
  return formatActivityItemTime(ts);
}

function ActivitySenderName({ fallback }: { fallback: string }) {
  return <>{fallback}</>;
}

function ActivityWorkspaceSenderName({
  authorUuid,
  fallback,
}: {
  authorUuid: string;
  fallback: string;
}) {
  const user = useUsersStore((s) => s.usersById[authorUuid]);
  return <>{selectUserDisplayName(user, fallback)}</>;
}

function formatWorkspaceItemTime(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return "";
  return formatItemTime(Math.floor(parsed / 1000));
}

function isRuntimeContextCurrent(runtimeContext: WorkspaceRuntimeContext): boolean {
  return isWorkspaceRuntimeRequestContextCurrent(runtimeContext, () =>
    useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  );
}

const DraftChatContextLabel = React.memo<{ draft: Draft }>(({ draft }) => {
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const context = formatDraftMessageContext({
    draft,
    streamsMap,
    currentUserId,
    getUserDisplayName: () => "",
    generalChatLabel: t("chat.generalChat"),
    privateLabel: t("dm.private"),
    groupChatLabel: t("dm.groupChat"),
  });
  if (draft.type === "stream" && draft.to.length > 0) {
    const streamId = draft.to[0]!;
    const streamName = streamsMap.get(streamId)?.name ?? String(streamId);
    const topicDisplay = resolveTopicDisplayInfo(draft.topic ?? "");
    return (
      <>
        <span>{`#${streamName} · `}</span>
        <span className={topicDisplay.isSystem ? "italic" : ""}>{topicDisplay.label}</span>
      </>
    );
  }
  return <>{context}</>;
});
DraftChatContextLabel.displayName = "DraftChatContextLabel";

export const ActivityPage: React.FC = () => {
  const { filter, orgId, projectId } = useParams<{
    filter: string;
    orgId?: string;
    projectId?: string;
  }>();
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = React.useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const ownerKey = React.useMemo(
    () => (runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext)),
    [runtimeContext],
  );
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const workspaceStreamsById = useMessengerStore((s) => s.streamsById);
  const workspaceTopicsById = useMessengerStore((s) => s.topicsById);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const [pendingUnstarIds, setPendingUnstarIds] = useState<Set<string>>(() => new Set());
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [workspaceStarredState, setWorkspaceStarredState] = useState<WorkspaceStarredState>({
    ownerKey: null,
    messages: EMPTY_WORKSPACE_STARRED_MESSAGES,
    isInitialLoading: false,
    isRefreshing: false,
  });
  const listScrollRef = useRef<HTMLUListElement>(null);
  const initialScrollPositionKeyRef = useRef<string | null>(null);
  const editDraftTextareaRef = useRef<HTMLTextAreaElement>(null);

  const drafts = useDraftStore((s) => s.drafts);
  const activityStaleVersion = useActivityStore((s) => s.staleVersion);
  const activityFilters = useActivityStore((s) => s.filters);
  const setFilterCache = useActivityStore((s) => s.setFilterCache);
  const startFilterRequest = useActivityStore((s) => s.startFilterRequest);
  const setFilterPageIfActual = useActivityStore((s) => s.setFilterPageIfActual);
  const setFilterErrorIfActual = useActivityStore((s) => s.setFilterErrorIfActual);
  const openWorkspaceForward = useWorkspaceForwardMessageStore((s) => s.open);

  const validFilter: ActivityPageExtendedFilter | null =
    filter && (ALL_FILTERS as readonly string[]).includes(filter)
      ? (filter as ActivityPageExtendedFilter)
      : null;

  const isDrafts = validFilter === "drafts";
  const activityRefreshVersion = isDrafts ? 0 : activityStaleVersion;
  const activityFilterState =
    validFilter != null && !isDrafts ? activityFilters[validFilter] : null;
  const messages =
    validFilter === "starred"
      ? EMPTY_ACTIVITY_MESSAGES
      : (activityFilterState?.messages ?? EMPTY_ACTIVITY_MESSAGES);
  const workspaceStarredMessages =
    workspaceStarredState.ownerKey === ownerKey
      ? workspaceStarredState.messages
      : EMPTY_WORKSPACE_STARRED_MESSAGES;
  const loading = isDrafts
    ? false
    : validFilter === "starred"
      ? workspaceStarredState.ownerKey === ownerKey && workspaceStarredState.isInitialLoading
      : (activityFilterState?.isInitialLoading ?? false);
  const isRefreshing = isDrafts
    ? false
    : validFilter === "starred"
      ? workspaceStarredState.ownerKey === ownerKey && workspaceStarredState.isRefreshing
      : (activityFilterState?.isRefreshing ?? false);
  const initialScrollPositionKey =
    validFilter != null ? `${ownerKey ?? currentInstanceId ?? "none"}:${validFilter}` : null;
  const listLength = isDrafts
    ? drafts.length
    : validFilter === "starred"
      ? workspaceStarredMessages.length
      : messages.length;

  useEffect(() => {
    if (!validFilter) {
      const fallback =
        orgId != null && projectId != null
          ? workspaceActivityRoute({ orgId, projectId, filter: "mentions" })
          : withCurrentOrgRoute("/activity/mentions");
      void navigate(fallback, { replace: true });
      return;
    }
    if (validFilter === "drafts") return;

    const controller = new AbortController();
    const orgContext = captureActiveOrgRequestContext();

    if (validFilter === "starred") return;

    if (validFilter === "reactions") {
      void ensureReactionsLoaded({
        currentInstanceId,
        currentUserId,
        forceRefresh: activityRefreshVersion > 0,
        pageSize: ACTIVITY_PAGE_SIZE,
        signal: controller.signal,
      }).catch((error) => {
        if (!isAbortError(error)) {
          log.error("Failed to bootstrap reactions activity", { error: String(error) });
        }
      });
      return () => {
        controller.abort();
      };
    }

    void (async () => {
      const activityFilter = validFilter;
      // Local filter bootstrap from IDB.
      const cached = await hydrateActivityMessagesFromCache(
        currentInstanceId,
        activityFilter,
        currentUserId,
        ACTIVITY_PAGE_SIZE,
      );
      if (controller.signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;

      const currentMessages = useActivityStore.getState().filters[activityFilter].messages;
      // Apply cached snapshot only when objectively fresher than in-memory — avoids IDB rollback.
      const shouldApplyCached =
        cached.length > 0 &&
        (currentMessages.length === 0 ||
          isActivityMessagesSnapshotFresher(cached, currentMessages));
      if (shouldApplyCached) {
        setFilterCache(activityFilter, cached, true);
      }

      // Server refresh with race protection and in-flight dedupe.
      const hasCachedData =
        shouldApplyCached ||
        useActivityStore.getState().filters[activityFilter].messages.length > 0;
      const requestVersion = startFilterRequest(activityFilter, hasCachedData);
      const requestKey = `${currentInstanceId ?? "none"}:activity:${activityFilter}:newest:${ACTIVITY_PAGE_SIZE}`;

      try {
        // Best-effort IDB persist after refresh.
        const page = await runInFlightDeduped(requestKey, () =>
          loadLegacyActivityEmptyPage(activityFilter, currentUserId, "newest", ACTIVITY_PAGE_SIZE, {
            signal: controller.signal,
          }),
        );
        if (controller.signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;
        setFilterPageIfActual(activityFilter, requestVersion, page.messages, !page.foundOldest);
      } catch (err) {
        if (
          isAbortError(err) ||
          controller.signal.aborted ||
          !isActiveOrgRequestContextCurrent(orgContext)
        ) {
          return;
        }
        setFilterErrorIfActual(activityFilter, requestVersion, String(err));
        log.error("Failed to load activity messages", {
          error: String(err),
          filter: activityFilter,
        });
      }
    })().catch(() => {});

    return () => {
      controller.abort();
    };
  }, [
    activityRefreshVersion,
    currentInstanceId,
    currentUserId,
    navigate,
    setFilterCache,
    setFilterErrorIfActual,
    setFilterPageIfActual,
    startFilterRequest,
    orgId,
    projectId,
    validFilter,
  ]);

  useEffect(() => {
    if (validFilter !== "starred") return;

    if (runtimeContext == null || ownerKey == null) {
      setWorkspaceStarredState({
        ownerKey,
        messages: EMPTY_WORKSPACE_STARRED_MESSAGES,
        isInitialLoading: false,
        isRefreshing: false,
      });
      return;
    }

    const controller = new AbortController();
    setWorkspaceStarredState({
      ownerKey,
      messages: EMPTY_WORKSPACE_STARRED_MESSAGES,
      isInitialLoading: true,
      isRefreshing: false,
    });

    const requestRuntimeContext = runtimeContext;
    void fetchWorkspaceStarredMessages({
      runtimeContext: requestRuntimeContext,
      signal: controller.signal,
    })
      .then((page) => {
        if (controller.signal.aborted || !isRuntimeContextCurrent(requestRuntimeContext)) return;
        setWorkspaceStarredState({
          ownerKey,
          messages: page.messages,
          isInitialLoading: false,
          isRefreshing: false,
        });
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (!isRuntimeContextCurrent(requestRuntimeContext)) return;
        setWorkspaceStarredState((current) => ({
          ownerKey,
          messages:
            current.ownerKey === ownerKey ? current.messages : EMPTY_WORKSPACE_STARRED_MESSAGES,
          isInitialLoading: false,
          isRefreshing: false,
        }));
        log.error("Failed to load Workspace starred activity", { error: String(error) });
      });

    return () => {
      controller.abort();
    };
  }, [ownerKey, runtimeContext, validFilter]);

  useEffect(() => {
    setPendingUnstarIds(new Set());
    setEditingDraft(null);
    setEditingContent("");
  }, [currentInstanceId]);

  useLayoutEffect(() => {
    if (initialScrollPositionKey == null) {
      initialScrollPositionKeyRef.current = null;
      return;
    }
    if (loading || listLength === 0) return;
    if (initialScrollPositionKeyRef.current === initialScrollPositionKey) return;
    const el = listScrollRef.current;
    if (!el) return;
    scrollToBottom(el);
    initialScrollPositionKeyRef.current = initialScrollPositionKey;
  }, [initialScrollPositionKey, listLength, loading]);

  const handleMessageClick = useCallback(
    (m: ZulipRawMessage, mode: "open" | "forward" = "open") => {
      const route = buildNavigableRouteFromMessage(
        {
          id: m.id,
          stream_id: m.stream_id,
          display_recipient: m.display_recipient,
          subject: m.subject,
          sender_id: m.sender_id,
        },
        currentUserId,
      );
      if (route) {
        const nextRoute = buildMessageNavigateRoute(route, m.id, mode);
        void navigate(nextRoute);
      }
    },
    [navigate, currentUserId],
  );

  const handleUnstarMessage = useCallback(async (messageUuid: string) => {
    const orgContext = captureActiveOrgRequestContext();
    setPendingUnstarIds((current) => {
      const next = new Set(current);
      next.add(messageUuid);
      return next;
    });
    try {
      await unstarMessageUnsupported(messageUuid);
      if (isActiveOrgRequestInvalidated(orgContext)) {
        return;
      }
    } catch (err) {
      if (isActiveOrgRequestInvalidated(orgContext)) {
        return;
      }
      log.error("Workspace unstar action is unsupported", {
        messageUuid,
        error: String(err),
      });
    } finally {
      if (!isActiveOrgRequestInvalidated(orgContext)) {
        setPendingUnstarIds((current) => {
          const next = new Set(current);
          next.delete(messageUuid);
          return next;
        });
      }
    }
  }, []);

  const handleWorkspaceMessageForward = useCallback(
    (messageUuid: string) => {
      openWorkspaceForward({ messageUuids: [messageUuid] });
    },
    [openWorkspaceForward],
  );

  const handleWorkspaceMessageClick = useCallback(
    (m: WorkspaceMessengerMessageDto) => {
      if (runtimeContext == null) return;
      void navigate(
        workspaceMessengerMessageRoute({
          orgId: runtimeContext.organizationId,
          projectId: runtimeContext.projectId,
          messageUuid: m.uuid,
        }),
      );
    },
    [navigate, runtimeContext],
  );

  const handleDraftClick = useCallback(
    (draft: Draft) => {
      if (draft.type === "stream" && draft.to.length > 0) {
        const streamId = draft.to[0]!;
        const streamName = streamsMap.get(streamId)?.name ?? String(streamId);
        void navigate(
          withCurrentOrgRoute(
            `/stream/${buildStreamSlug(streamId, streamName)}/topic/${encodeURIComponent(
              encodeTopicForRoute(draft.topic ?? ""),
            )}`,
          ),
        );
        return;
      }

      if (draft.type === "private" && draft.to.length > 0) {
        const recipients = draft.to.map((id) => ({ id }));
        const slug = buildDmRouteSlugFromRecipients(recipients, currentUserId);
        const fallback =
          orgId != null && projectId != null
            ? workspaceInboxRoute(orgId, projectId)
            : withCurrentOrgRoute("/inbox");
        void navigate(slug != null ? withCurrentOrgRoute(`/dm/${slug}`) : fallback);
      }
    },
    [currentUserId, navigate, orgId, projectId, streamsMap],
  );

  const handleDeleteDraft = useCallback((e: React.MouseEvent, draft: Draft) => {
    e.preventDefault();
    e.stopPropagation();

    useDraftStore.getState().removeDraftByIdentifier(draft.id ?? draft.timestamp);
  }, []);

  const handleStartEditDraft = useCallback((draft: Draft) => {
    setEditingDraft(draft);
    setEditingContent(draft.content);
  }, []);

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    if (open) return;
    setEditingDraft(null);
  }, []);

  const handleSaveDraftEdit = useCallback(() => {
    if (editingDraft == null) return;
    const draftIdentifier = editingDraft.id ?? editingDraft.timestamp;
    if (!editingContent.trim()) {
      useDraftStore.getState().removeDraftByIdentifier(draftIdentifier);
      setEditingDraft(null);
      return;
    }
    if (editingContent === editingDraft.content) {
      setEditingDraft(null);
      return;
    }

    if (editingDraft.id != null) {
      useDraftStore.getState().updateDraft(editingDraft.id, {
        content: editingContent,
      });
    } else {
      useDraftStore.getState().setLocalDraft({
        ...editingDraft,
        content: editingContent,
        timestamp: Math.floor(Date.now() / 1000),
      });
    }
    setEditingDraft(null);
  }, [editingDraft, editingContent]);

  useEffect(() => {
    if (editingDraft == null) return;
    const timer = window.setTimeout(() => {
      const textarea = editDraftTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const cursorPosition = textarea.value.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [editingDraft]);

  if (!validFilter) return null;

  const title = getActivityTitle(validFilter);

  const renderActivityContent = () => {
    if (loading) {
      return <div className="p-4 text-sm text-text-muted">{t("app.loading")}</div>;
    }
    if (isDrafts) {
      if (drafts.length === 0) {
        return <div className="p-4 text-sm text-text-muted">{t("draft.noDrafts")}</div>;
      }
      return (
        <ul ref={listScrollRef} className="flex flex-col space-y-1 overflow-auto scroll-auto p-2">
          {drafts.map((d) => (
            <li key={d.id ?? d.timestamp}>
              <div className="flex items-start gap-2 rounded-lg p-3 transition-colors hover:bg-card-bg">
                <button
                  type="button"
                  onClick={() => handleDraftClick(d)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {formatItemTime(d.timestamp)}
                    </span>
                    <span className="truncate text-[11px] text-text-muted">
                      <DraftChatContextLabel draft={d} />
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-text-primary">
                    {truncateText(d.content)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleStartEditDraft(d)}
                  className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-card-bg hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t("activity.editDraft")}
                  title={t("activity.editDraft")}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    handleDeleteDraft(e, d);
                  }}
                  className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-card-bg hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t("activity.deleteDraft")}
                  title={t("activity.deleteDraft")}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      );
    }
    if (validFilter === "starred") {
      if (workspaceStarredMessages.length === 0) {
        return <div className="p-4 text-sm text-text-muted">{t("chat.noMessages")}</div>;
      }
      return (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ul
            ref={listScrollRef}
            className="flex min-h-0 flex-1 flex-col space-y-1 overflow-auto scroll-auto p-2"
          >
            {workspaceStarredMessages.map((m) => {
              const stream = workspaceStreamsById[m.stream_uuid];
              const topic = workspaceTopicsById[m.topic_uuid];
              const streamName = stream?.name.trim() ?? "";
              const topicName = topic?.name.trim() ?? "";
              const topicDisplay = topicName.length > 0 ? resolveTopicDisplayInfo(topicName) : null;
              const isPrivate = stream?.isPrivate ?? false;
              const privateContext =
                isPrivate && streamName.length > 0 ? `${t("dm.private")} · ${streamName}` : null;
              const isUnstarPending = pendingUnstarIds.has(m.uuid);
              const preview = summarizeWorkspaceMessageMarkdown(
                m.payload.content,
                ACTIVITY_WORKSPACE_SUMMARY_OPTIONS,
              ).text;

              return (
                <li key={m.uuid}>
                  <div className="group flex items-start gap-2 rounded-lg p-3 transition-colors hover:bg-card-bg">
                    <button
                      type="button"
                      onClick={() => handleWorkspaceMessageClick(m)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="shrink-0 text-[11px] text-text-muted">
                          {formatWorkspaceItemTime(m.created_at)}
                        </span>
                        {streamName.length > 0 && !isPrivate ? (
                          <span className="truncate text-[11px] text-text-muted">
                            <span>{`#${streamName}`}</span>
                            {topicDisplay != null ? (
                              <>
                                <span>{` · `}</span>
                                <span className={topicDisplay.isSystem ? "italic" : ""}>
                                  {topicDisplay.label}
                                </span>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                        {privateContext != null ? (
                          <span className="truncate text-[11px] text-text-muted">
                            {privateContext}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-sidebar-sender">
                        <ActivityWorkspaceSenderName authorUuid={m.author_uuid} fallback="" />
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-text-primary">
                        {truncateText(preview)}
                      </p>
                    </button>
                    <div className="mt-0.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          void handleUnstarMessage(m.uuid);
                        }}
                        disabled={isUnstarPending}
                        className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={t("message.unstar")}
                        title={t("message.unstar")}
                      >
                        <Icon name="star" size={16} className="text-current" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWorkspaceMessageClick(m)}
                        className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
                        aria-label={t("message.openInChat")}
                        title={t("message.openInChat")}
                      >
                        <Icon name="newWindow" size={16} className="text-current" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWorkspaceMessageForward(m.uuid)}
                        className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
                        aria-label={t("message.forward")}
                        title={t("message.forward")}
                      >
                        <Icon name="send" size={16} className="text-current" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <FloatingLoadingOverlay visible={isRefreshing} />
        </div>
      );
    }
    if (messages.length === 0) {
      if (validFilter === "reactions") {
        return (
          <div className="space-y-1 p-4 text-sm text-text-muted">
            <p>{t("activity.reactionsEmpty")}</p>
            <p className="text-xs">{t("activity.reactionsEmptyHint")}</p>
          </div>
        );
      }
      return <div className="p-4 text-sm text-text-muted">{t("chat.noMessages")}</div>;
    }
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ul
          ref={listScrollRef}
          className="flex min-h-0 flex-1 flex-col space-y-1 overflow-auto scroll-auto p-2"
        >
          {messages.map((m) => {
            const isStream = m.type === "stream" && m.stream_id != null;
            const streamName =
              isStream && typeof m.display_recipient === "string" ? m.display_recipient : null;
            const topic = isStream ? (m.subject ?? "").trim() : null;
            const topicDisplay = isStream ? resolveTopicDisplayInfo(topic ?? "") : null;
            let dmName: string | null = null;
            if (m.type === "private" && Array.isArray(m.display_recipient)) {
              const entry = messageToDmEntry(m, currentUserId);
              dmName = entry?.name ?? null;
            }
            const context = formatActivityMessageContext({
              isStream,
              streamName,
              topic,
              dmName,
              generalChatLabel: t("chat.generalChat"),
              privateLabel: t("dm.private"),
            });
            return (
              <li key={m.id}>
                <div className="group flex items-start gap-2 rounded-lg p-3 transition-colors hover:bg-card-bg">
                  <button
                    type="button"
                    onClick={() => handleMessageClick(m)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {formatItemTime(m.timestamp)}
                      </span>
                      <span className="truncate text-[11px] text-text-muted">
                        {isStream && streamName != null && topicDisplay != null ? (
                          <>
                            <span>{`#${streamName} · `}</span>
                            <span className={topicDisplay.isSystem ? "italic" : ""}>
                              {topicDisplay.label}
                            </span>
                          </>
                        ) : (
                          context
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-sidebar-sender">
                      <ActivitySenderName fallback={m.sender_full_name ?? ""} />
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-text-primary">
                      {truncateText(plainTextPreviewFromMessageBody(m.content))}
                    </p>
                    {validFilter === "reactions" && (
                      <ActivityPeerReactionsRow message={m} currentUserId={currentUserId} />
                    )}
                  </button>
                  <div className="mt-0.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleMessageClick(m)}
                      className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
                      aria-label={t("message.openInChat")}
                      title={t("message.openInChat")}
                    >
                      <Icon name="newWindow" size={16} className="text-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMessageClick(m, "forward")}
                      className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
                      aria-label={t("message.forward")}
                      title={t("message.forward")}
                    >
                      <Icon name="send" size={16} className="text-current" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <FloatingLoadingOverlay visible={isRefreshing} />
      </div>
    );
  };

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <ChatHeader
        channelName={title}
        hideTopic
        hideParticipants
        onOpenSearch={openSearch ?? undefined}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {renderActivityContent()}
      </section>
      <AppDialog
        open={editingDraft != null}
        onOpenChange={handleEditDialogOpenChange}
        title={t("activity.editDraft")}
        maxWidthClassName="max-w-lg"
        footer={
          <>
            <DialogCancelButton useDialogClose={false} onClick={() => setEditingDraft(null)}>
              {t("common.cancel")}
            </DialogCancelButton>
            <DialogPrimaryButton
              onClick={() => {
                handleSaveDraftEdit();
              }}
              disabled={editingContent === (editingDraft?.content ?? "")}
            >
              {t("common.save")}
            </DialogPrimaryButton>
          </>
        }
      >
        <textarea
          ref={editDraftTextareaRef}
          value={editingContent}
          onChange={(e) => setEditingContent(e.target.value)}
          className="min-h-32 w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
        />
      </AppDialog>
    </div>
  );
};
