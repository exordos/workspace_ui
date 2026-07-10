import React, { useCallback, useMemo } from "react";
import {
  formatAlarmLabel,
  formatAttendeeLabel,
  formatAttendeePartstat,
  formatEventDuration,
  formatEventWhen,
  formatRecurrenceLabel,
} from "~/entities/calendar/calendar-display.lib";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { CalendarEventDetailProps } from "./calendar-event-detail.types";

interface DetailSectionProps {
  label: string;
  children: React.ReactNode;
}

const DetailSection = React.memo<DetailSectionProps>(function DetailSection({ label, children }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">{label}</h3>
      <div className="text-sm text-text-primary">{children}</div>
    </section>
  );
});

export const CalendarEventDetail: React.FC<CalendarEventDetailProps> = ({
  event,
  calendarName,
  calendarColor,
  saving,
  onEdit,
  onDelete,
  onClose,
}) => {
  const handleClose = useCallback(() => onClose(), [onClose]);

  const when = useMemo(() => (event != null ? formatEventWhen(event) : null), [event]);
  const duration = useMemo(() => (event != null ? formatEventDuration(event) : null), [event]);
  const recurrence = useMemo(
    () => (event?.recurrence?.rrule != null ? formatRecurrenceLabel(event.recurrence.rrule) : null),
    [event],
  );

  if (event == null) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-border-subtle pl-3">
        <p className="text-sm text-text-muted">{t("calendar.selectEvent")}</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border-subtle pl-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-medium text-text-primary">{event.summary}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={handleClose}>
          {t("common.close")}
        </Button>
      </div>

      {calendarName != null ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: calendarColor ?? "var(--accent)" }}
            aria-hidden
          />
          <span>{calendarName}</span>
        </div>
      ) : null}

      {event.isRecurringInstance ? (
        <p className="text-xs text-text-muted">{t("calendar.recurringInstance")}</p>
      ) : null}

      {when != null ? (
        <DetailSection label={t("calendar.when")}>
          <div className="flex items-start gap-2">
            <Icon name="calendar" size={16} className="mt-0.5 shrink-0 text-text-muted" />
            <div>
              <p>{when.dateLine}</p>
              {when.timeLine != null ? <p className="text-text-muted">{when.timeLine}</p> : null}
              {duration != null ? <p className="mt-1 text-text-muted">{duration}</p> : null}
            </div>
          </div>
        </DetailSection>
      ) : null}

      {event.location != null && event.location.length > 0 ? (
        <DetailSection label={t("calendar.location")}>
          <div className="flex items-start gap-2">
            <Icon name="marker" size={16} className="mt-0.5 shrink-0 text-text-muted" />
            <p className="break-words">{event.location}</p>
          </div>
        </DetailSection>
      ) : null}

      {event.description != null && event.description.length > 0 ? (
        <DetailSection label={t("calendar.description")}>
          <p className="whitespace-pre-wrap break-words text-text-muted">{event.description}</p>
        </DetailSection>
      ) : null}

      {recurrence != null ? (
        <DetailSection label={t("calendar.recurrence")}>
          <p>{recurrence}</p>
        </DetailSection>
      ) : null}

      {event.alarms.length > 0 ? (
        <DetailSection label={t("calendar.reminder")}>
          <ul className="space-y-1">
            {event.alarms.map((alarm, index) => (
              <li key={`${alarm.action}-${alarm.triggerMinutes ?? alarm.triggerAbsolute ?? index}`}>
                {formatAlarmLabel(alarm)}
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {event.attendees.length > 0 ? (
        <DetailSection label={t("calendar.attendees")}>
          <ul className="space-y-2">
            {event.attendees.map((attendee) => {
              const partstat = formatAttendeePartstat(attendee.partstat);
              return (
                <li key={attendee.email} className="flex items-start gap-2">
                  <Icon name="profile" size={16} className="mt-0.5 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <p className="truncate">{formatAttendeeLabel(attendee)}</p>
                    {attendee.displayName != null && attendee.displayName.length > 0 ? (
                      <p className="truncate text-xs text-text-muted">{attendee.email}</p>
                    ) : null}
                    {partstat != null ? (
                      <p className="text-xs text-text-muted">{partstat}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </DetailSection>
      ) : null}

      <div className="mt-auto flex gap-2 pt-2">
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
