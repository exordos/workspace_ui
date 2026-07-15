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
import { ProviderDeliveryBadge } from "~/shared/ui/provider-delivery-badge";
import type { CalendarEventDetailProps } from "./calendar-event-detail.types";

interface DetailSectionProps {
  label: string;
  children: React.ReactNode;
}

const DetailSection = React.memo<DetailSectionProps>(function DetailSection({ label, children }) {
  return (
    <section className="rounded-lg bg-bg px-3 py-2.5">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </h3>
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
  onMove,
  onExport,
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
    return null;
  }

  return (
    <aside
      className="absolute inset-x-2 bottom-2 z-overlay flex max-h-[min(36rem,calc(100%-1rem))] flex-col overflow-hidden rounded-xl border border-border-subtle bg-card-bg shadow-xl sm:bottom-auto sm:left-auto sm:right-3 sm:top-3 sm:w-96 sm:max-w-[calc(100%-1.5rem)]"
      role="dialog"
      aria-modal="false"
      aria-label={event.summary}
    >
      <div className="h-1 shrink-0" style={{ backgroundColor: calendarColor ?? "var(--accent)" }} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold leading-snug text-text-primary">
              {event.summary}
            </h2>
            {calendarName != null ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-text-muted">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: calendarColor ?? "var(--accent)" }}
                  aria-hidden
                />
                <span className="truncate">{calendarName}</span>
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-8 shrink-0 px-0"
            onClick={handleClose}
            aria-label={t("common.close")}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ProviderDeliveryBadge provider={event.provider} delivery={event.delivery} />
          {event.isRecurringInstance ? (
            <span className="rounded-full bg-bg px-2 py-1 text-xs text-text-muted">
              {t("calendar.recurringInstance")}
            </span>
          ) : null}
        </div>

        <div className="space-y-2.5">
          {when != null ? (
            <DetailSection label={t("calendar.when")}>
              <div className="flex items-start gap-2.5">
                <Icon name="calendar" size={17} className="mt-0.5 shrink-0 text-text-muted" />
                <div>
                  <p className="font-medium">{when.dateLine}</p>
                  {when.timeLine != null ? (
                    <p className="text-text-muted">{when.timeLine}</p>
                  ) : null}
                  {duration != null ? (
                    <p className="mt-1 text-xs text-text-muted">{duration}</p>
                  ) : null}
                </div>
              </div>
            </DetailSection>
          ) : null}

          {event.location != null && event.location.length > 0 ? (
            <DetailSection label={t("calendar.location")}>
              <div className="flex items-start gap-2.5">
                <Icon name="marker" size={17} className="mt-0.5 shrink-0 text-text-muted" />
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
                  <li
                    key={`${alarm.action}-${alarm.triggerMinutes ?? alarm.triggerAbsolute ?? index}`}
                  >
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
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-border-subtle bg-bg px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={onEdit}
          disabled={saving}
          className="gap-1.5"
        >
          <Icon name="pen" size={14} className="text-on-accent" />
          {t("calendar.editEvent")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onMove} disabled={saving}>
          {t("calendar.moveEvent")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onExport}
          disabled={saving}
          className="gap-1.5"
        >
          <Icon name="download" size={14} />
          {t("calendar.exportIcs")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={saving}
          className="ml-auto w-8 px-0 text-notice-base hover:text-notice-base"
          aria-label={t("common.delete")}
        >
          <Icon name="delete" size={15} />
        </Button>
      </div>
    </aside>
  );
};
