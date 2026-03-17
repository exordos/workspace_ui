import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list";
import { useInboxStore, fetchInboxEntries, groupInboxEntries } from "~/entities/inbox";
import type { InboxEntry } from "~/entities/inbox";
import { t } from "~/i18n";
import { useOpenSearch } from "~/shared/contexts/open-search";
import { formatMessageTime } from "~/shared/lib/format";
import { createLogger } from "~/shared/lib/logger";
import { Icon } from "~/shared/ui";
import { ChatHeader } from "~/widgets/chat-view";
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
              {formatMessageTime(entry.lastMessageTimestamp)}
            </p>
          </div>
          <span className="text-badge-text flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-badge-bg px-1 text-[11px] font-medium">
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
  const loading = useInboxStore((s) => s.loading);
  const error = useInboxStore((s) => s.error);
  const stale = useInboxStore((s) => s.stale);
  const setEntries = useInboxStore((s) => s.setEntries);
  const setLoading = useInboxStore((s) => s.setLoading);
  const setError = useInboxStore((s) => s.setError);
  const sortedEntries = useInboxStore((s) => s.sortedEntries);
  const entries = sortedEntries();
  const grouped = groupInboxEntries(entries);

  const loadInbox = useCallback(() => {
    setLoading(true);
    fetchInboxEntries(currentUserId)
      .then((data) => {
        setEntries(data);
      })
      .catch((err) => {
        setError(String(err));
        log.error("Failed to load inbox", { error: String(err) });
      });
  }, [currentUserId, setEntries, setLoading, setError]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (stale) loadInbox();
  }, [stale, loadInbox]);

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
    <div className="flex max-h-full min-h-0 min-w-0 max-w-[1199px] flex-1 flex-col overflow-hidden">
      <ChatHeader
        channelName={t("inbox.title")}
        hideTopic
        hideParticipants
        onOpenSearch={openSearch ?? undefined}
      />
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-text-muted`}>{t("app.loading")}</div>
        )}
        {!loading && error && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-notice-base`}>{t("inbox.loadError")}</div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className={`${INBOX_STATE_CARD_CLASS} text-text-muted`}>{t("inbox.noUnread")}</div>
        )}
        {!loading && !error && entries.length > 0 && (
          <div className="flex flex-1 flex-col overflow-auto px-3 pb-3 pt-2">
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
                        <span className="text-badge-text flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-badge-bg px-1 text-[11px] font-medium">
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
          </div>
        )}
      </section>
    </div>
  );
};
