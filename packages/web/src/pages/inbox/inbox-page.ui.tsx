// /inbox — IDB bootstrap (apply if fresher than memory), then background unread refresh without clearing UI.
import React, { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { fetchInboxEntries, hydrateInboxEntriesFromCache } from "~/entities/inbox/inbox.api";
import { groupInboxEntries, isInboxEntriesSnapshotFresher } from "~/entities/inbox/inbox.lib";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { isActiveOrgRequestContextCurrent, useInstancesStore } from "~/entities/instance/instance.model";
import { topicKey, useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { t } from "~/i18n/i18n";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";
import { createLogger } from "~/shared/lib/logger";
import { useCacheFirstPageLoad } from "~/shared/lib/use-cache-first-page.hook";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";
import { buildInboxEntryRoute } from "./inbox-navigation.lib";

const log = createLogger("inbox-page");
const INBOX_STATE_CARD_CLASS =
  "m-3 rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";
const INBOX_ROW_CLASS =
  "group flex w-full items-center gap-2 rounded-xl border border-border-subtle bg-bg-elevated/50 p-2.5 text-left transition-colors hover:border-accent-soft/40 hover:bg-card-bg";

const InboxRow = React.memo<{ entry: InboxEntry; onClick: (entry: InboxEntry) => void }>(
  ({ entry, onClick }) => {
    const isStream = entry.streamId != null;
    const streamTopicLabel =
      entry.topic != null && entry.topic.trim().length > 0 ? entry.topic : t("inbox.allMessages");
    const label = isStream
      ? `#${entry.streamName ?? entry.streamId} · ${streamTopicLabel}`
      : (entry.senderName ?? t("dm.private"));

    return (
      <li>
        <button type="button" onClick={() => onClick(entry)} className={INBOX_ROW_CLASS}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted transition-colors group-hover:text-text-primary">
            <Icon name={isStream ? "channels" : "profile"} size={18} className="shrink-0" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{label}</p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {formatMessageTimeShort(entry.lastMessageTimestamp)}
            </p>
          </div>
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-badge-bg px-1 text-[11px] font-medium text-badge-text">
            {entry.unreadCount}
          </span>
        </button>
      </li>
    );
  },
);
InboxRow.displayName = "InboxRow";

export const InboxPage: React.FC = () => {
  const navigate = useNavigate();
  const openSearch = useOpenSearch();
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const loading = useInboxStore((s) => s.isInitialLoading);
  const isRefreshing = useInboxStore((s) => s.isRefreshing);
  const error = useInboxStore((s) => s.error);
  const staleVersion = useInboxStore((s) => s.staleVersion);
  const setEntries = useInboxStore((s) => s.setEntries);
  const startRequest = useInboxStore((s) => s.startRequest);
  const setError = useInboxStore((s) => s.setError);
  const entries = useInboxStore((s) => s.sortedEntries());
  const mutedStreamIds = useMuteStore((s) => s.mutedStreamIds);
  const mutedTopicKeys = useMuteStore((s) => s.mutedTopicKeys);
  const unmutedTopicKeys = useMuteStore((s) => s.unmutedTopicKeys);
  const followedTopicKeys = useMuteStore((s) => s.followedTopicKeys);
  const isStreamMuted = useMuteStore((s) => s.isStreamMuted);
  const isEffectivelyMuted = useMuteStore((s) => s.isEffectivelyMuted);
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (entry.streamId == null) return true;
        if (mutedStreamIds.has(entry.streamId)) return false;
        if (entry.topic == null) return true;
        const key = topicKey(entry.streamId, entry.topic);
        if (unmutedTopicKeys.has(key) || followedTopicKeys.has(key)) return true;
        if (mutedTopicKeys.has(key)) return false;
        return true;
      }),
    [entries, followedTopicKeys, mutedStreamIds, mutedTopicKeys, unmutedTopicKeys],
  );
  const grouped = useMemo(() => groupInboxEntries(visibleEntries), [visibleEntries]);
  const lastInstanceIdRef = useRef<string | null>(null);

  useCacheFirstPageLoad({
    instanceId: currentInstanceId,
    dedupeKey: `${currentInstanceId ?? "none"}:inbox:newest`,
    refreshVersion: staleVersion,
    onInstanceChange: (instanceId) => {
      if (lastInstanceIdRef.current != null && lastInstanceIdRef.current !== instanceId) {
        useInboxStore.getState().clear();
      }
      lastInstanceIdRef.current = instanceId;
    },
    hydrate: async ({ instanceId, signal, orgContext }) => {
      const cached = await hydrateInboxEntriesFromCache(instanceId, currentUserId, {
        isStreamMuted,
        isEffectivelyMuted,
      });
      if (signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;
      const currentEntries = useInboxStore.getState().entries;
      const shouldApplyCached =
        cached.length > 0 &&
        (currentEntries.length === 0 || isInboxEntriesSnapshotFresher(cached, currentEntries));
      if (shouldApplyCached) {
        setEntries(cached);
      }
    },
    hasCachedData: () => useInboxStore.getState().entries.length > 0,
    startRequest: (hasCached) => startRequest(hasCached),
    fetch: async ({ orgContext, requestVersion, signal }) => {
      const data = await fetchInboxEntries(
        currentUserId,
        { isStreamMuted, isEffectivelyMuted },
        { signal },
      );
      if (signal.aborted || !isActiveOrgRequestContextCurrent(orgContext)) return;
      setEntries(data, requestVersion);
    },
    onFetchError: (err, requestVersion) => {
      setError(String(err), requestVersion);
      log.error("Failed to load inbox", { error: String(err) });
    },
  });

  const handleEntryClick = useCallback(
    (entry: InboxEntry) => {
      const route = buildInboxEntryRoute(entry);
      if (route) {
        void navigate(route);
      }
    },
    [navigate],
  );

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <ChatHeader
        channelName={t("inbox.title")}
        hideTopic
        hideParticipants
        onOpenSearch={openSearch ?? undefined}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading && visibleEntries.length === 0 && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-text-muted`}>{t("app.loading")}</div>
        )}
        {!loading && error && visibleEntries.length === 0 && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-notice-base`}>{t("inbox.loadError")}</div>
        )}
        {!loading && !error && visibleEntries.length === 0 && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-text-muted`}>{t("inbox.noUnread")}</div>
        )}
        {visibleEntries.length > 0 && (
          <div className="relative flex flex-1 flex-col overflow-auto px-3 pb-3 pt-2">
            {grouped.dms.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="flex items-center gap-2 px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("inbox.dm")}
                  <span className="bg-border-subtle/60 h-px flex-1" />
                </h3>
                <ul className="flex flex-col space-y-1.5">
                  {grouped.dms.map((entry) => (
                    <InboxRow key={entry.key} entry={entry} onClick={handleEntryClick} />
                  ))}
                </ul>
              </section>
            )}

            {grouped.streams.length > 0 && (
              <section className="mt-4 space-y-2">
                <h3 className="flex items-center gap-2 px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("inbox.channels")}
                  <span className="bg-border-subtle/60 h-px flex-1" />
                </h3>
                <div className="space-y-2.5">
                  {grouped.streams.map((group) => (
                    <div
                      key={`stream-group-${group.streamId}`}
                      className="bg-bg-elevated/45 rounded-xl border border-border-subtle p-2"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2 px-1 py-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted">
                            <Icon name="channels" size={16} className="shrink-0" />
                          </span>
                          <span className="truncate text-sm font-semibold text-text-primary">
                            #{group.streamName}
                          </span>
                        </div>
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-badge-bg px-1 text-[11px] font-medium text-badge-text">
                          {group.unreadCount}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {group.topics.map((entry) => (
                          <InboxRow key={entry.key} entry={entry} onClick={handleEntryClick} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <FloatingLoadingOverlay visible={isRefreshing} />
          </div>
        )}
      </section>
    </div>
  );
};
