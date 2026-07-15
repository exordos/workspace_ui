import React, { useCallback, useMemo } from "react";
import type { MailMessageSummary } from "~/entities/mail/mail.types";
import { t } from "~/i18n/i18n";
import { formatMailMessageListTime } from "~/shared/lib/datetime.lib";
import { Icon } from "~/shared/ui/icon";
import { ProviderDeliveryBadge } from "~/shared/ui/provider-delivery-badge";
import { Skeleton } from "~/shared/ui/skeleton.ui";
import { resolveMailMessageRowClasses } from "./mail-message-row.lib";
import type { MailMessageListProps } from "./mail-view.types";

const MailMessageRow = React.memo<{
  message: MailMessageSummary;
  active: boolean;
  batchMode: boolean;
  selected: boolean;
  onSelect: (uid: string) => void;
  onToggleSelect?: (uid: string) => void;
  onToggleStar?: (uid: string) => void;
  onToggleRead?: (uid: string) => void;
}>(
  ({
    message,
    active,
    batchMode,
    selected,
    onSelect,
    onToggleSelect,
    onToggleStar,
    onToggleRead,
  }) => {
    const handleClick = useCallback(() => {
      onSelect(message.uid);
    }, [message.uid, onSelect]);

    const handleCheckboxChange = useCallback(() => {
      onToggleSelect?.(message.uid);
    }, [message.uid, onToggleSelect]);

    const handleToggleStar = useCallback(() => {
      onToggleStar?.(message.uid);
    }, [message.uid, onToggleStar]);

    const handleToggleRead = useCallback(() => {
      onToggleRead?.(message.uid);
    }, [message.uid, onToggleRead]);

    const unread = !message.seen;
    const flagged = message.flagged;

    const { row: rowStateClass, showUnreadDot } = useMemo(
      () => resolveMailMessageRowClasses({ active, unread, flagged }),
      [active, flagged, unread],
    );

    return (
      <div
        role="option"
        aria-selected={active}
        className={`group flex min-h-[76px] w-full items-start border-l-2 px-2.5 py-2.5 text-left transition-colors ${
          active ? "" : "hover:bg-sidebar-hover"
        } ${rowStateClass}`}
      >
        {batchMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={handleCheckboxChange}
            className="mr-2 mt-1.5 shrink-0"
            aria-label={message.subject}
          />
        ) : null}
        <button
          type="button"
          onClick={handleClick}
          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={message.subject}
        >
          <span className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {showUnreadDot ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              ) : null}
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  unread ? "font-semibold text-text-primary" : "text-text-secondary"
                }`}
              >
                {message.from}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <ProviderDeliveryBadge provider={message.provider} delivery={message.delivery} />
              <span className="text-xs text-text-muted">
                {formatMailMessageListTime(message.date)}
              </span>
            </span>
          </span>
          <span
            className={`truncate text-sm ${
              unread ? "font-semibold text-text-primary" : "text-text-primary"
            }`}
          >
            {message.subject}
          </span>
          {message.snippet.length > 0 ? (
            <span className="truncate text-xs text-text-muted">{message.snippet}</span>
          ) : null}
        </button>
        {!batchMode ? (
          <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={handleToggleStar}
              className="hover:bg-bg/70 flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={flagged ? t("mail.unstar") : t("mail.star")}
              title={flagged ? t("mail.unstar") : t("mail.star")}
            >
              <Icon name={flagged ? "star" : "star_outline"} size={16} />
            </button>
            <button
              type="button"
              onClick={handleToggleRead}
              className="hover:bg-bg/70 flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={message.seen ? t("mail.markUnread") : t("mail.markRead")}
              title={message.seen ? t("mail.markUnread") : t("mail.markRead")}
            >
              <Icon name={message.seen ? "mail_outline" : "mail"} size={16} />
            </button>
          </div>
        ) : null}
      </div>
    );
  },
);
MailMessageRow.displayName = "MailMessageRow";

export const MailMessageList: React.FC<MailMessageListProps> = ({
  messages,
  selectedUid,
  loading,
  loadingMore = false,
  hasMore = false,
  batchMode = false,
  selectedUids = [],
  onLoadMore,
  onSelectMessage,
  onToggleSelectUid,
  onToggleStar,
  onToggleRead,
}) => {
  if (loading) {
    return (
      <div className="flex flex-1 flex-col" role="status" aria-label={t("app.loading")}>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex min-h-[76px] flex-col gap-2 border-b border-border-subtle px-3 py-3"
            aria-hidden
          >
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-text-muted">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card-bg text-text-muted">
          <Icon name="mail_outline" size={22} />
        </span>
        <span>{t("mail.emptyFolder")}</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 divide-y divide-border-subtle overflow-y-auto"
        role="listbox"
        aria-label={t("nav.mail")}
        aria-multiselectable={batchMode || undefined}
      >
        {messages.map((message) => (
          <MailMessageRow
            key={message.uid}
            message={message}
            active={message.uid === selectedUid}
            batchMode={batchMode}
            selected={selectedUids.includes(message.uid)}
            onSelect={onSelectMessage}
            onToggleSelect={onToggleSelectUid}
            onToggleStar={onToggleStar}
            onToggleRead={onToggleRead}
          />
        ))}
      </div>
      {hasMore && onLoadMore != null ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="shrink-0 border-t border-border-subtle px-3 py-2 text-sm text-accent hover:bg-sidebar-hover disabled:opacity-50"
        >
          {loadingMore ? t("app.loading") : t("common.loadMore")}
        </button>
      ) : null}
    </div>
  );
};
