// Страница /activity/:filter.
// Для mentions/starred/reactions используем cache-first паттерн:
// локальный hydrate -> фоновый refresh -> authoritative replace на newest.
// Для drafts берём уже гидрейтнутый global store без дополнительного initial fetch.
import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  hydrateActivityMessagesFromCache,
  isActivityMessagesSnapshotFresher,
} from "~/entities/activity/activity-cache.lib";
import {
  ensureStarredLoaded,
  STARRED_SUMMARY_PAGE_SIZE,
} from "~/entities/activity/activity-starred-loader.lib";
import { fetchActivityMessagesPageWithPersist } from "~/entities/activity/activity.api";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { deleteDraftOnServer, updateDraftOnServer } from "~/entities/draft/draft.api";
import { useDraftStore } from "~/entities/draft/draft.model";
import type { Draft } from "~/entities/draft/draft.types";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { removeMessageFlag } from "~/shared/api/zulip-messages";
import type { ActivityFilter, ZulipRawMessage } from "~/shared/api/zulip.types";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTime } from "~/shared/lib/format";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { createLogger } from "~/shared/lib/logger";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildNavigableRouteFromMessage } from "~/shared/lib/push-click";
import { runInFlightDeduped } from "~/shared/lib/request-lifecycle.lib";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { MY_ACTIVITY, messageToDmEntry, slugForStream } from "~/widgets/sidebar/sidebar.lib";
import type { ActivityPageExtendedFilter } from "./activity-page.types";

const log = createLogger("activity-page");

const ACTIVITY_FILTERS: ActivityFilter[] = ["starred", "mentions", "reactions"];
const ALL_FILTERS = [
  ...ACTIVITY_FILTERS,
  "drafts",
] as const satisfies readonly ActivityPageExtendedFilter[];
const EMPTY_ACTIVITY_MESSAGES: ZulipRawMessage[] = [];

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
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) return formatMessageTime(ts);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth())
    return t("chat.yesterday") + " " + formatMessageTime(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ActivitySenderName({ senderId, fallback }: { senderId: number; fallback: string }) {
  const displayName = useUsersStore((s) => s.getDisplayName(senderId));
  return <>{displayName !== "Unknown" ? displayName : fallback}</>;
}

const ACTIVITY_PAGE_SIZE = STARRED_SUMMARY_PAGE_SIZE;

export const ActivityPage: React.FC = () => {
  const { filter } = useParams<{ filter: string }>();
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingDraftId, setPendingDraftId] = useState<number | null>(null);
  const [pendingUnstarIds, setPendingUnstarIds] = useState<Set<number>>(() => new Set());
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const listScrollRef = useRef<HTMLUListElement>(null);
  const editDraftTextareaRef = useRef<HTMLTextAreaElement>(null);

  const drafts = useDraftStore((s) => s.drafts);
  const draftsLoading = useDraftStore((s) => s.loading);
  const activityStaleVersion = useActivityStore((s) => s.staleVersion);
  const activityFilters = useActivityStore((s) => s.filters);
  const setFilterCache = useActivityStore((s) => s.setFilterCache);
  const startFilterRequest = useActivityStore((s) => s.startFilterRequest);
  const setFilterPageIfActual = useActivityStore((s) => s.setFilterPageIfActual);
  const appendOlderIfActual = useActivityStore((s) => s.appendOlderIfActual);
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
  const hasMore = activityFilterState?.hasMore ?? true;
  const loading = isDrafts ? draftsLoading : (activityFilterState?.isInitialLoading ?? false);
  const isRefreshing = isDrafts ? false : (activityFilterState?.isRefreshing ?? false);

  useEffect(() => {
    if (!validFilter) {
      void navigate("/activity/mentions", { replace: true });
      return;
    }
    if (validFilter === "drafts") return;

    if (validFilter === "starred") {
      void ensureStarredLoaded({
        currentInstanceId,
        currentUserId,
        forceRefresh: false,
        pageSize: ACTIVITY_PAGE_SIZE,
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const activityFilter = validFilter;
      // 1) Локальный bootstrap фильтра из IDB.
      const cached = await hydrateActivityMessagesFromCache(
        currentInstanceId,
        activityFilter,
        currentUserId,
        ACTIVITY_PAGE_SIZE,
      );
      if (cancelled) return;

      const currentMessages = useActivityStore.getState().filters[activityFilter].messages;
      // Применяем cached snapshot только если он объективно свежее текущего in-memory состояния.
      // Это защищает UI от отката на устаревший IDB-кэш.
      const shouldApplyCached =
        cached.length > 0 &&
        (currentMessages.length === 0 ||
          isActivityMessagesSnapshotFresher(cached, currentMessages));
      if (shouldApplyCached) {
        setFilterCache(activityFilter, cached, true);
      }

      // 2) Серверный refresh с защитой от гонок и dedupe одинаковых запросов.
      const hasCachedData =
        shouldApplyCached ||
        useActivityStore.getState().filters[activityFilter].messages.length > 0;
      const requestVersion = startFilterRequest(activityFilter, hasCachedData);
      const requestKey = `${currentInstanceId ?? "none"}:activity:${activityFilter}:newest:${ACTIVITY_PAGE_SIZE}`;

      try {
        // Используем fetch с best-effort persist, чтобы после refresh локальный IDB тоже обновлялся.
        const page = await runInFlightDeduped(requestKey, () =>
          fetchActivityMessagesPageWithPersist(
            activityFilter,
            currentUserId,
            "newest",
            ACTIVITY_PAGE_SIZE,
          ),
        );
        if (cancelled) return;
        for (const message of page.messages) useUsersStore.getState().mergeFromMessage(message);
        setFilterPageIfActual(activityFilter, requestVersion, page.messages, !page.foundOldest);
      } catch (err) {
        if (cancelled) return;
        setFilterErrorIfActual(activityFilter, requestVersion, String(err));
        log.error("Failed to load activity messages", {
          error: String(err),
          filter: activityFilter,
        });
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
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
    if (loading || isDrafts || messages.length === 0) return;
    const el = listScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [loading, messages.length, isDrafts]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || messages.length === 0 || isDrafts || !validFilter) return;
    const oldest = messages[0];
    if (!oldest) return;
    const activityFilter = validFilter as ActivityFilter;
    const requestVersion = useActivityStore.getState().filters[activityFilter].requestVersion;
    setLoadingMore(true);
    const requestKey = `${currentInstanceId ?? "none"}:activity:${activityFilter}:${oldest.id}:${ACTIVITY_PAGE_SIZE}`;
    runInFlightDeduped(requestKey, () =>
      // Пагинацию тоже пропускаем через persist-обертку, чтобы кэш пополнялся старыми страницами.
      fetchActivityMessagesPageWithPersist(
        activityFilter,
        currentUserId,
        oldest.id,
        ACTIVITY_PAGE_SIZE,
      ),
    )
      .then((page) => {
        // Для пагинации удаляем anchor и добавляем только уникальные старые элементы.
        const withoutAnchor = page.messages.filter((m) => m.id !== oldest.id);
        for (const m of withoutAnchor) useUsersStore.getState().mergeFromMessage(m);
        appendOlderIfActual(activityFilter, requestVersion, withoutAnchor, !page.foundOldest);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [
    appendOlderIfActual,
    currentInstanceId,
    currentUserId,
    hasMore,
    isDrafts,
    loadingMore,
    messages,
    validFilter,
  ]);

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
        const nextRoute =
          mode === "forward" ? `${route}${route.includes("?") ? "&" : "?"}forward=${m.id}` : route;
        void navigate(nextRoute);
      }
    },
    [navigate, currentUserId],
  );

  const handleUnstarMessage = useCallback(
    async (messageId: number) => {
      setPendingUnstarIds((current) => {
        const next = new Set(current);
        next.add(messageId);
        return next;
      });
      try {
        await removeMessageFlag([messageId], "starred");
        removeMessageFromFilter("starred", messageId);
      } catch (err) {
        log.error("Failed to remove star in activity", {
          messageId,
          error: String(err),
        });
      } finally {
        setPendingUnstarIds((current) => {
          const next = new Set(current);
          next.delete(messageId);
          return next;
        });
      }
    },
    [removeMessageFromFilter],
  );

  const handleDraftClick = useCallback(
    (draft: Draft) => {
      if (draft.type === "stream" && draft.to.length > 0) {
        const streamId = draft.to[0]!;
        const streamName = streamsMap.get(streamId)?.name ?? String(streamId);
        const slug = slugForStream({ stream_id: streamId, name: streamName });
        const topic = draft.topic || "general";
        void navigate(withCurrentOrgRoute(`/stream/${slug}/topic/${encodeURIComponent(topic)}`));
      } else if (draft.type === "private" && draft.to.length > 0) {
        void navigate(withCurrentOrgRoute(`/dm/${draft.to.join(",")}`));
      }
    },
    [navigate, streamsMap],
  );

  const handleDeleteDraft = useCallback(async (e: React.MouseEvent, draft: Draft) => {
    e.preventDefault();
    e.stopPropagation();

    if (draft.id == null) {
      useDraftStore.getState().removeDraftByIdentifier(draft.timestamp);
      return;
    }

    setPendingDraftId(draft.id);
    try {
      const deleted = await deleteDraftOnServer(draft.id);
      if (!deleted) {
        log.error("Failed to delete draft", { draftId: draft.id });
        return;
      }
      useDraftStore.getState().removeDraftByIdentifier(draft.id);
    } catch (err) {
      log.error("Failed to delete draft", {
        draftId: draft.id,
        error: String(err),
      });
    } finally {
      setPendingDraftId((current) => (current === draft.id ? null : current));
    }
  }, []);

  const handleStartEditDraft = useCallback((draft: Draft) => {
    if (draft.id == null) return;
    setEditingDraft(draft);
    setEditingContent(draft.content);
  }, []);

  const handleEditDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open || pendingDraftId != null) return;
      setEditingDraft(null);
    },
    [pendingDraftId],
  );

  const handleSaveDraftEdit = useCallback(async () => {
    if (editingDraft?.id == null) return;
    if (!editingContent.trim()) {
      setPendingDraftId(editingDraft.id);
      try {
        const deleted = await deleteDraftOnServer(editingDraft.id);
        if (!deleted) {
          log.error("Failed to delete draft from edit dialog", {
            draftId: editingDraft.id,
          });
          return;
        }
        useDraftStore.getState().removeDraftByIdentifier(editingDraft.id);
        setEditingDraft(null);
      } finally {
        setPendingDraftId((current) => (current === editingDraft.id ? null : current));
      }
      return;
    }
    if (editingContent === editingDraft.content) {
      setEditingDraft(null);
      return;
    }

    setPendingDraftId(editingDraft.id);
    try {
      const updated = await updateDraftOnServer(editingDraft.id, {
        type: editingDraft.type,
        to: editingDraft.to,
        topic: editingDraft.topic ?? "",
        content: editingContent,
      });
      if (!updated) {
        log.error("Failed to edit draft", { draftId: editingDraft.id });
        return;
      }
      useDraftStore.getState().updateDraft(editingDraft.id, {
        content: editingContent,
      });
      setEditingDraft(null);
    } finally {
      setPendingDraftId((current) => (current === editingDraft.id ? null : current));
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

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <ChatHeader
        channelName={title}
        hideTopic
        hideParticipants
        onOpenSearch={openSearch ?? undefined}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm text-text-muted">{t("app.loading")}</div>
        ) : isDrafts ? (
          drafts.length === 0 ? (
            <div className="p-4 text-sm text-text-muted">{t("draft.noDrafts")}</div>
          ) : (
            <ul className="flex flex-col space-y-1 overflow-auto p-2">
              {drafts.map((d) => {
                const isPendingDelete = d.id != null && pendingDraftId === d.id;
                return (
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
                            {d.type === "stream" ? t("draft.streamDraft") : t("draft.privateDraft")}
                          </span>
                        </div>
                        {d.type === "stream" && d.topic && (
                          <p className="mt-0.5 text-xs text-sidebar-sender">
                            {t("draft.topic", { topic: d.topic })}
                          </p>
                        )}
                        <p className="mt-1 line-clamp-2 text-sm text-text-primary">
                          {truncateText(d.content)}
                        </p>
                      </button>
                      {d.id != null && (
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
                      )}
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
          )
        ) : messages.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">{t("chat.noMessages")}</div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">
            <ul
              ref={listScrollRef}
              className="flex min-h-0 flex-1 flex-col space-y-1 overflow-auto p-2"
            >
              {messages.map((m) => {
                const isStream = m.type === "stream" && m.stream_id != null;
                const streamName =
                  isStream && typeof m.display_recipient === "string" ? m.display_recipient : null;
                const topic = isStream ? (m.subject ?? "").trim() || "general" : null;
                let dmName: string | null = null;
                if (m.type === "private" && Array.isArray(m.display_recipient)) {
                  const entry = messageToDmEntry(m, currentUserId);
                  dmName = entry?.name ?? null;
                }
                const context = isStream
                  ? `#${streamName} · ${topic}`
                  : dmName
                    ? `${t("dm.private")} · ${dmName}`
                    : t("dm.private");
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
                          <span className="truncate text-[11px] text-text-muted">{context}</span>
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
              {hasMore && !loadingMore && (
                <li className="py-2 text-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="rounded-lg px-4 py-2 text-sm text-accent hover:bg-card-bg"
                  >
                    {t("common.loadMore")}
                  </button>
                </li>
              )}
            </ul>
            <FloatingLoadingOverlay visible={isRefreshing || loadingMore} />
          </div>
        )}
      </section>
      <Dialog.Root open={editingDraft != null} onOpenChange={handleEditDialogOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content
            className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-[20%] z-modal w-full max-w-lg -translate-x-1/2 rounded-xl border border-border-subtle bg-bg-elevated p-6 shadow-xl"
            onCloseAutoFocus={(e) => e.preventDefault()}
            aria-describedby={undefined}
          >
            <Dialog.Title className="mb-4 text-base font-semibold text-text-primary">
              {t("activity.editDraft")}
            </Dialog.Title>
            <textarea
              ref={editDraftTextareaRef}
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="mb-4 min-h-32 w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
              disabled={editingDraft?.id != null && pendingDraftId === editingDraft.id}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingDraft(null)}
                disabled={editingDraft?.id != null && pendingDraftId === editingDraft.id}
                className="hover:bg-bg/60 rounded-lg px-4 py-2 text-sm text-text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveDraftEdit();
                }}
                disabled={
                  editingContent === (editingDraft?.content ?? "") ||
                  (editingDraft?.id != null && pendingDraftId === editingDraft.id)
                }
                className="hover:bg-accent/90 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
