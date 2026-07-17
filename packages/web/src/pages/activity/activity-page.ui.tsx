// /activity/:filter — cache-first for mentions/starred/reactions (IDB hydrate → background refresh → newest replace); drafts use hydrated global store.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  hydrateActivityMessagesFromCache,
  isActivityMessagesSnapshotFresher,
} from "~/entities/activity/activity-cache.lib";
import { ensureReactionsLoaded } from "~/entities/activity/activity-reactions-loader.lib";
import {
  ensureStarredLoaded,
  STARRED_SUMMARY_PAGE_SIZE,
} from "~/entities/activity/activity-starred-loader.lib";
import { fetchActivityMessagesPageWithPersist } from "~/entities/activity/activity.api";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { loadNextDraftPage } from "~/entities/draft/draft-hydration";
import {
  deleteDraftOnServer,
  DraftPreconditionError,
  updateDraftOnServer,
} from "~/entities/draft/draft.api";
import { useDraftStore } from "~/entities/draft/draft.model";
import type { Draft } from "~/entities/draft/draft.types";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestInvalidated,
  isActiveOrgRequestContextCurrent,
  useInstancesStore,
} from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { removeMessageFlag } from "~/shared/api/messenger-messages";
import type { ActivityFilter, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatActivityItemTime } from "~/shared/lib/datetime.lib";
import { createLogger } from "~/shared/lib/logger";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildNavigableRouteFromMessage } from "~/shared/lib/push-click";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";
import { scrollToBottom } from "~/shared/lib/scroll-position.lib";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { AppDialog, DialogCancelButton, DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { MY_ACTIVITY, messageToDmEntry, slugForStream } from "~/widgets/sidebar/sidebar.lib";
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
const EMPTY_ACTIVITY_MESSAGES: WorkspaceRawMessage[] = [];

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

function ActivitySenderName({ senderId, fallback }: { senderId: number; fallback: string }) {
  const displayName = useUsersStore((s) => s.getDisplayName(senderId));
  return <>{displayName !== "Unknown" ? displayName : fallback}</>;
}

function nonEmptyText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

function resolveActivityTopicName(
  message: WorkspaceRawMessage,
  streamsMap: ReturnType<typeof useChatListStore.getState>["streamsMap"],
): string | null {
  const topicUuid = nonEmptyText(message.topic_uuid);
  if (message.stream_uuid != null && topicUuid != null) {
    const stream = streamsMap.get(message.stream_uuid);
    if (stream != null) {
      for (const topic of stream.topics.values()) {
        if (topic.topicUuid === topicUuid) {
          return nonEmptyText(topic.subject);
        }
      }
    }
  }
  return nonEmptyText(message.subject);
}

const DraftChatContextLabel = React.memo<{ draft: Draft }>(({ draft }) => {
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const context = formatDraftMessageContext({
    draft,
    streamsMap,
    generalChatLabel: t("chat.generalChat"),
    privateLabel: t("dm.private"),
  });
  return <>{context}</>;
});
DraftChatContextLabel.displayName = "DraftChatContextLabel";

const ACTIVITY_PAGE_SIZE = STARRED_SUMMARY_PAGE_SIZE;

export const ActivityPage: React.FC = () => {
  const { filter } = useParams<{ filter: string }>();
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [pendingUnstarIds, setPendingUnstarIds] = useState<Set<MessageId>>(() => new Set());
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [draftEditError, setDraftEditError] = useState<string | null>(null);
  const listScrollRef = useRef<HTMLUListElement>(null);
  const initialScrollPositionKeyRef = useRef<string | null>(null);
  const editDraftTextareaRef = useRef<HTMLTextAreaElement>(null);

  const drafts = useDraftStore((s) => s.drafts);
  const draftsLoading = useDraftStore((s) => s.loading);
  const draftsHasMore = useDraftStore((s) => s.hasMore);
  const activityStaleVersion = useActivityStore((s) => s.staleVersion);
  const activityFilters = useActivityStore((s) => s.filters);
  const setFilterCache = useActivityStore((s) => s.setFilterCache);
  const startFilterRequest = useActivityStore((s) => s.startFilterRequest);
  const setFilterPageIfActual = useActivityStore((s) => s.setFilterPageIfActual);
  const setFilterErrorIfActual = useActivityStore((s) => s.setFilterErrorIfActual);
  const removeMessageFromFilter = useActivityStore((s) => s.removeMessageFromFilter);

  const validFilter: ActivityPageExtendedFilter | null =
    filter && (ALL_FILTERS as readonly string[]).includes(filter)
      ? (filter as ActivityPageExtendedFilter)
      : null;

  const isDrafts = validFilter === "drafts";
  const activityRefreshVersion = isDrafts ? 0 : activityStaleVersion;
  const activityFilterState =
    validFilter != null && !isDrafts ? activityFilters[validFilter] : null;
  const messages = activityFilterState?.messages ?? EMPTY_ACTIVITY_MESSAGES;
  const loading = isDrafts ? draftsLoading : (activityFilterState?.isInitialLoading ?? false);
  const isRefreshing = isDrafts ? false : (activityFilterState?.isRefreshing ?? false);
  const initialScrollPositionKey =
    validFilter != null ? `${currentInstanceId ?? "none"}:${validFilter}` : null;
  const listLength = isDrafts ? drafts.length : messages.length;

  useEffect(() => {
    if (!validFilter) {
      void navigate("/activity/mentions", { replace: true });
      return;
    }
    if (validFilter === "drafts") return;

    const controller = new AbortController();
    const orgContext = captureActiveOrgRequestContext();

    if (validFilter === "starred") {
      void ensureStarredLoaded({
        currentInstanceId,
        currentUserId,
        forceRefresh: false,
        pageSize: ACTIVITY_PAGE_SIZE,
        signal: controller.signal,
      }).catch((error) => {
        if (!isAbortError(error)) {
          log.error("Failed to bootstrap starred activity", { error: String(error) });
        }
      });
      return () => {
        controller.abort();
      };
    }

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
          fetchActivityMessagesPageWithPersist(
            activityFilter,
            currentUserId,
            "newest",
            ACTIVITY_PAGE_SIZE,
            { signal: controller.signal },
          ),
        );
        if (controller.signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;
        for (const message of page.messages) useUsersStore.getState().mergeFromMessage(message);
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
    validFilter,
  ]);

  useEffect(() => {
    setPendingDraftId(null);
    setPendingUnstarIds(new Set());
    setEditingDraft(null);
    setEditingContent("");
    setDraftEditError(null);
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
    (m: WorkspaceRawMessage, mode: "open" | "forward" = "open") => {
      const route = buildNavigableRouteFromMessage(
        {
          id: m.id,
          stream_uuid: m.stream_uuid,
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

  const handleUnstarMessage = useCallback(
    async (messageId: MessageId) => {
      const orgContext = captureActiveOrgRequestContext();
      setPendingUnstarIds((current) => {
        const next = new Set(current);
        next.add(messageId);
        return next;
      });
      try {
        await removeMessageFlag([messageId], "starred");
        if (isActiveOrgRequestInvalidated(orgContext)) {
          return;
        }
        removeMessageFromFilter("starred", messageId);
      } catch (err) {
        if (isActiveOrgRequestInvalidated(orgContext)) {
          return;
        }
        log.error("Failed to remove star in activity", {
          messageId,
          error: String(err),
        });
      } finally {
        if (!isActiveOrgRequestInvalidated(orgContext)) {
          setPendingUnstarIds((current) => {
            const next = new Set(current);
            next.delete(messageId);
            return next;
          });
        }
      }
    },
    [removeMessageFromFilter],
  );

  const handleDraftClick = useCallback(
    (draft: Draft) => {
      const dm = useChatListStore
        .getState()
        .dms()
        .find((candidate) => candidate.streamUuid === draft.stream_uuid);
      if (dm != null) {
        const dmTarget = dm.userIds?.join(",") ?? dm.slug;
        void navigate(
          withCurrentOrgRoute(
            `/dm/${encodeURIComponent(dmTarget)}?draft=${encodeURIComponent(draft.uuid)}`,
          ),
        );
        return;
      }
      const stream = streamsMap.get(draft.stream_uuid);
      if (stream != null) {
        const topic = [...stream.topics.values()].find(
          (candidate) => candidate.topicUuid === draft.topic_uuid,
        )?.subject;
        if (topic == null) return;
        const slug = slugForStream({ streamUuid: draft.stream_uuid });
        void navigate(
          withCurrentOrgRoute(
            `/stream/${slug}/topic/${encodeURIComponent(
              encodeTopicForRoute(topic),
            )}?draft=${encodeURIComponent(draft.uuid)}`,
          ),
        );
      }
    },
    [navigate, streamsMap],
  );

  const handleDeleteDraft = useCallback(async (e: React.MouseEvent, draft: Draft) => {
    e.preventDefault();
    e.stopPropagation();

    const orgContext = captureActiveOrgRequestContext();
    setPendingDraftId(draft.uuid);
    try {
      await deleteDraftOnServer(draft.uuid, draft.etag);
      if (isActiveOrgRequestInvalidated(orgContext)) {
        return;
      }
      useDraftStore.getState().removeDraft(draft.uuid);
    } catch (err) {
      if (err instanceof DraftPreconditionError) {
        useDraftStore.getState().markDraftConflict(draft.uuid, err.current.draft);
      }
      log.error("Failed to delete draft", {
        draftId: draft.uuid,
        error: String(err),
      });
    } finally {
      if (!isActiveOrgRequestInvalidated(orgContext)) {
        setPendingDraftId((current) => (current === draft.uuid ? null : current));
      }
    }
  }, []);

  const handleStartEditDraft = useCallback((draft: Draft) => {
    setEditingDraft(draft);
    setEditingContent(draft.payload.content);
    setDraftEditError(null);
  }, []);

  const handleEditDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open || pendingDraftId != null) return;
      setEditingDraft(null);
    },
    [pendingDraftId],
  );

  const handleSaveDraftEdit = useCallback(async () => {
    if (editingDraft == null) return;
    const orgContext = captureActiveOrgRequestContext();
    if (!editingContent.trim()) {
      setPendingDraftId(editingDraft.uuid);
      try {
        await deleteDraftOnServer(editingDraft.uuid, editingDraft.etag);
        if (isActiveOrgRequestInvalidated(orgContext)) {
          return;
        }
        useDraftStore.getState().removeDraft(editingDraft.uuid);
        setEditingDraft(null);
      } catch (error) {
        if (error instanceof DraftPreconditionError) {
          useDraftStore.getState().markDraftConflict(editingDraft.uuid, error.current.draft);
          setDraftEditError(t("draft.conflict"));
        }
      } finally {
        if (!isActiveOrgRequestInvalidated(orgContext)) {
          setPendingDraftId((current) => (current === editingDraft.uuid ? null : current));
        }
      }
      return;
    }
    if (editingContent === editingDraft.payload.content) {
      setEditingDraft(null);
      return;
    }

    setPendingDraftId(editingDraft.uuid);
    try {
      const updated = await updateDraftOnServer(
        editingDraft.uuid,
        { payload: { kind: "markdown", content: editingContent } },
        editingDraft.etag,
      );
      if (isActiveOrgRequestInvalidated(orgContext)) {
        return;
      }
      useDraftStore.getState().upsertDraft(updated);
      setEditingDraft(null);
    } catch (error) {
      if (error instanceof DraftPreconditionError) {
        useDraftStore.getState().markDraftConflict(editingDraft.uuid, error.current.draft);
        setDraftEditError(t("draft.conflict"));
      } else {
        setDraftEditError(t("draft.saveError"));
      }
    } finally {
      if (!isActiveOrgRequestInvalidated(orgContext)) {
        setPendingDraftId((current) => (current === editingDraft.uuid ? null : current));
      }
    }
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
        <ul
          ref={listScrollRef}
          className="flex flex-col space-y-1 overflow-auto scroll-auto p-2"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (
              draftsHasMore &&
              !draftsLoading &&
              element.scrollHeight - element.scrollTop - element.clientHeight < 160
            ) {
              void loadNextDraftPage();
            }
          }}
        >
          {drafts.map((d) => {
            const isPendingDelete = pendingDraftId === d.uuid;
            return (
              <li key={d.uuid}>
                <div className="flex items-start gap-2 rounded-lg p-3 transition-colors hover:bg-card-bg">
                  <button
                    type="button"
                    onClick={() => handleDraftClick(d)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {formatItemTime(Date.parse(d.updated_at) / 1000)}
                      </span>
                      <span className="truncate text-[11px] text-text-muted">
                        <DraftChatContextLabel draft={d} />
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-text-primary">
                      {truncateText(d.payload.content)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEditDraft(d)}
                    disabled={isPendingDelete}
                    className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-card-bg hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t("activity.editDraft")}
                    title={t("activity.editDraft")}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      void handleDeleteDraft(e, d);
                    }}
                    disabled={isPendingDelete}
                    className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-card-bg hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t("activity.deleteDraft")}
                    title={t("activity.deleteDraft")}
                  >
                    🗑
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
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
            const isStream = m.type === "stream" && m.stream_uuid != null;
            const streamName =
              isStream && typeof m.display_recipient === "string" ? m.display_recipient : null;
            const topic = isStream ? resolveActivityTopicName(m, streamsMap) : null;
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
            const isUnstarPending = pendingUnstarIds.has(m.id);

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
                      <ActivitySenderName
                        senderId={m.sender_id}
                        fallback={m.sender_full_name ?? ""}
                      />
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-text-primary">
                      {truncateText(plainTextPreviewFromMessageBody(m.content))}
                    </p>
                    {validFilter === "reactions" && <ActivityPeerReactionsRow message={m} />}
                  </button>
                  <div className="mt-0.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {validFilter === "starred" && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleUnstarMessage(m.id);
                        }}
                        disabled={isUnstarPending}
                        className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={t("message.unstar")}
                        title={t("message.unstar")}
                      >
                        <Icon name="star" size={16} className="text-current" />
                      </button>
                    )}
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
            <DialogCancelButton
              useDialogClose={false}
              onClick={() => setEditingDraft(null)}
              disabled={pendingDraftId === editingDraft?.uuid}
            >
              {t("common.cancel")}
            </DialogCancelButton>
            <DialogPrimaryButton
              onClick={() => {
                void handleSaveDraftEdit();
              }}
              disabled={
                editingContent === (editingDraft?.payload.content ?? "") ||
                pendingDraftId === editingDraft?.uuid
              }
            >
              {t("common.save")}
            </DialogPrimaryButton>
          </>
        }
      >
        {draftEditError != null && (
          <p role="alert" className="mb-2 text-sm text-notice-base">
            {draftEditError}
          </p>
        )}
        <textarea
          ref={editDraftTextareaRef}
          value={editingContent}
          onChange={(e) => setEditingContent(e.target.value)}
          className="min-h-32 w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
          disabled={pendingDraftId === editingDraft?.uuid}
        />
      </AppDialog>
    </div>
  );
};
