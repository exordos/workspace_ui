import React, { useCallback, useMemo } from "react";
import type { MailMessageSummary } from "~/entities/mail/mail.types";
import { t } from "~/i18n/i18n";
import { formatMailMessageListTime } from "~/shared/lib/datetime.lib";
import { Icon } from "~/shared/ui/icon";
import { resolveMailMessageRowClasses } from "./mail-message-row.lib";
import type { MailMessageListProps } from "./mail-view.types";

const MailMessageRow = React.memo<{
  message: MailMessageSummary;
  active: boolean;
  batchMode: boolean;
  selected: boolean;
  onSelect: (uid: number) => void;
  onToggleSelect?: (uid: number) => void;
}>(({ message, active, batchMode, selected, onSelect, onToggleSelect }) => {
  const handleClick = useCallback(() => {
    onSelect(message.uid);
  }, [message.uid, onSelect]);

  const handleCheckboxChange = useCallback(() => {
    onToggleSelect?.(message.uid);
  }, [message.uid, onToggleSelect]);

  const unread = !message.seen;
  const flagged = message.flagged;

  const { row: rowStateClass, showUnreadDot } = useMemo(
    () => resolveMailMessageRowClasses({ active, unread, flagged }),
    [active, flagged, unread],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full border-l-2 px-2 py-2.5 text-left transition-colors ${
        active ? "" : "hover:bg-sidebar-hover"
      } ${rowStateClass}`}
    >
      {batchMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
          className="mr-2 mt-1 shrink-0"
          aria-label={message.subject}
        />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
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
            {flagged ? (
              <Icon name="star" size={14} className="text-accent" aria-label={t("mail.star")} />
            ) : null}
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
      </span>
    </button>
  );
});
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
}) => {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-muted">
        {t("app.loading")}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-text-muted">
        {t("mail.emptyFolder")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 divide-y divide-border-subtle overflow-y-auto">
        {messages.map((message) => (
          <MailMessageRow
            key={message.uid}
            message={message}
            active={message.uid === selectedUid}
            batchMode={batchMode}
            selected={selectedUids.includes(message.uid)}
            onSelect={onSelectMessage}
            onToggleSelect={onToggleSelectUid}
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
