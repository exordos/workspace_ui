import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import type { CalendarEventDetailProps } from "./calendar-event-detail.types";

export const CalendarEventDetail: React.FC<CalendarEventDetailProps> = ({
  event,
  saving,
  onEdit,
  onDelete,
  onClose,
}) => {
  const handleClose = useCallback(() => onClose(), [onClose]);

  if (event == null) {
    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-border-subtle pl-3">
        <p className="text-sm text-text-muted">{t("calendar.selectEvent")}</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 border-l border-border-subtle pl-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-medium text-text-primary">{event.summary}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={handleClose}>
          {t("common.close")}
        </Button>
      </div>
      {event.description ? <p className="text-sm text-text-muted">{event.description}</p> : null}
      {event.location ? <p className="text-sm text-text-muted">{event.location}</p> : null}
      {event.attendees.length > 0 ? (
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase text-text-muted">
            {t("calendar.attendees")}
          </h3>
          <ul className="space-y-1 text-sm text-text-primary">
            {event.attendees.map((a) => (
              <li key={a.email}>{a.displayName ?? a.email}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {event.recurrence?.rrule ? (
        <p className="text-sm text-text-muted">{event.recurrence.rrule}</p>
      ) : null}
      <div className="mt-auto flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onEdit} disabled={saving}>
          {t("calendar.editEvent")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete} disabled={saving}>
          {t("common.delete")}
        </Button>
      </div>
    </aside>
  );
};
