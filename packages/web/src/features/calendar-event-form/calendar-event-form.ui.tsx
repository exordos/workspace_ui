import React, { useCallback, useEffect, useState } from "react";
import { useCalendarStore } from "~/entities/calendar/calendar.model";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { buildDefaultFormState, formStateToEventInput } from "./calendar-event-form.lib";
import type {
  CalendarEventFormDialogProps,
  CalendarEventFormState,
} from "./calendar-event-form.types";

const FIELD_CLASS =
  "w-full rounded-lg border border-border-subtle bg-text-field-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent";
const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-medium text-text-muted";
const PANEL_CLASS = "rounded-xl border border-border-subtle bg-card-bg p-4";

export const CalendarEventFormDialog: React.FC<CalendarEventFormDialogProps> = ({
  open,
  calendars,
  initialEvent,
  focusDate,
  draftStart = null,
  saving,
  onOpenChange,
  onSubmit,
}) => {
  const calendarSetKey = calendars
    .map((calendar) => calendar.id)
    .toSorted((left, right) => left.localeCompare(right))
    .join("\u0000");
  const initialEventKey =
    initialEvent == null
      ? null
      : JSON.stringify({
          uid: initialEvent.uid,
          calendarId: initialEvent.calendarId,
          summary: initialEvent.summary,
          description: initialEvent.description,
          location: initialEvent.location,
          start: initialEvent.start,
          end: initialEvent.end,
          allDay: initialEvent.allDay,
          recurrence: initialEvent.recurrence,
          attendees: initialEvent.attendees,
          alarms: initialEvent.alarms,
        });
  const focusDateKey = focusDate.getTime();
  const draftStartKey = draftStart?.getTime() ?? null;
  const checkAttendeeBusy = useCalendarStore((s) => s.checkAttendeeBusy);
  const [form, setForm] = useState<CalendarEventFormState>(() =>
    buildDefaultFormState(calendars, focusDate, initialEvent, draftStart),
  );
  const [attendeeBusyWarning, setAttendeeBusyWarning] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Resetting controlled fields is intentional when the dialog input changes logically.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(buildDefaultFormState(calendars, focusDate, initialEvent, draftStart));
    }
    // Object identities are intentionally replaced by the logical keys above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, calendarSetKey, focusDateKey, initialEventKey, draftStartKey]);

  const updateField = useCallback(
    <K extends keyof CalendarEventFormState>(key: K, value: CalendarEventFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleAddAttendee = useCallback(async () => {
    if (form.attendeeEmail.trim().length === 0) return;
    const input = formStateToEventInput(form);
    const busy = await checkAttendeeBusy(form.attendeeEmail.trim(), input.start, input.end);
    setAttendeeBusyWarning(busy ? t("calendar.attendeeBusy") : null);
    setForm((prev) => ({
      ...prev,
      attendees: [
        ...prev.attendees,
        {
          email: prev.attendeeEmail.trim(),
          displayName: prev.attendeeName.trim().length > 0 ? prev.attendeeName.trim() : null,
          partstat: "NEEDS-ACTION",
          role: "REQ-PARTICIPANT",
        },
      ],
      attendeeEmail: "",
      attendeeName: "",
    }));
  }, [checkAttendeeBusy, form]);

  const handleSubmit = useCallback(async () => {
    if (form.summary.trim().length === 0) return;
    await onSubmit(formStateToEventInput(form));
  }, [form, onSubmit]);

  const title = initialEvent != null ? t("calendar.editEvent") : t("calendar.newEvent");

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      maxWidthClassName="max-w-3xl"
      showCloseButton
      footer={
        <DialogPrimaryButton
          type="button"
          onClick={handleSubmit}
          isSubmitting={saving}
          disabled={form.summary.trim().length === 0}
        >
          {t("common.save")}
        </DialogPrimaryButton>
      }
    >
      <form className="space-y-4 pr-1" onSubmit={(e) => e.preventDefault()}>
        <section className={PANEL_CLASS}>
          <label className="block text-sm">
            <span className={FIELD_LABEL_CLASS}>{t("calendar.eventTitle")}</span>
            <input
              value={form.summary}
              onChange={(e) => updateField("summary", e.target.value)}
              className={`${FIELD_CLASS} text-base font-medium`}
              required
            />
          </label>
          <label className="mt-3 block text-sm sm:max-w-sm">
            <span className={FIELD_LABEL_CLASS}>{t("calendar.calendar")}</span>
            <select
              value={form.calendarId}
              onChange={(e) => updateField("calendarId", e.target.value)}
              className={FIELD_CLASS}
            >
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.displayName}
                </option>
              ))}
            </select>
          </label>
        </section>

        <fieldset className={PANEL_CLASS}>
          <legend className="px-1 text-sm font-semibold text-text-primary">
            {t("calendar.when")}
          </legend>
          <label className="mb-4 mt-1 flex w-fit items-center gap-2 rounded-lg px-1 py-1 text-sm text-text-primary hover:bg-bg">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => updateField("allDay", e.target.checked)}
            />
            {t("calendar.allDay")}
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className={FIELD_LABEL_CLASS}>{t("calendar.start")}</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => updateField("startDate", e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            {!form.allDay ? (
              <label className="block text-sm">
                <span className={FIELD_LABEL_CLASS}>{t("calendar.startTime")}</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => updateField("startTime", e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            ) : null}
            <label className="block text-sm">
              <span className={FIELD_LABEL_CLASS}>{t("calendar.end")}</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => updateField("endDate", e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            {!form.allDay ? (
              <label className="block text-sm">
                <span className={FIELD_LABEL_CLASS}>{t("calendar.endTime")}</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => updateField("endTime", e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            ) : null}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className={`${PANEL_CLASS} space-y-3`}>
            <label className="block text-sm">
              <span className={FIELD_LABEL_CLASS}>{t("calendar.recurrence")}</span>
              <select
                value={form.recurrencePreset}
                onChange={(e) =>
                  updateField(
                    "recurrencePreset",
                    e.target.value as CalendarEventFormState["recurrencePreset"],
                  )
                }
                className={FIELD_CLASS}
              >
                <option value="none">{t("calendar.recurrenceNone")}</option>
                <option value="daily">{t("calendar.recurrenceDaily")}</option>
                <option value="weekly">{t("calendar.recurrenceWeekly")}</option>
                <option value="monthly">{t("calendar.recurrenceMonthly")}</option>
                <option value="custom">{t("calendar.recurrenceCustom")}</option>
              </select>
            </label>
            {form.recurrencePreset === "custom" ? (
              <label className="block text-sm">
                <span className={FIELD_LABEL_CLASS}>{t("calendar.customRrule")}</span>
                <input
                  value={form.customRrule}
                  onChange={(e) => updateField("customRrule", e.target.value)}
                  placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
                  className={FIELD_CLASS}
                />
              </label>
            ) : null}
          </section>

          <section className={`${PANEL_CLASS} grid grid-cols-1 content-start gap-3`}>
            <label className="block text-sm">
              <span className={FIELD_LABEL_CLASS}>{t("calendar.location")}</span>
              <div className="relative">
                <Icon
                  name="marker"
                  size={16}
                  className="pointer-events-none absolute left-3 top-2.5 text-text-muted"
                />
                <input
                  value={form.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  className={`${FIELD_CLASS} pl-9`}
                />
              </div>
            </label>
            <label className="block text-sm">
              <span className={FIELD_LABEL_CLASS}>{t("calendar.reminder")}</span>
              <select
                value={form.reminderMinutes}
                onChange={(e) => updateField("reminderMinutes", e.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">{t("calendar.reminderNone")}</option>
                <option value="5">{t("calendar.reminder5m")}</option>
                <option value="15">{t("calendar.reminder15m")}</option>
                <option value="60">{t("calendar.reminder1h")}</option>
                <option value="1440">{t("calendar.reminder1d")}</option>
              </select>
            </label>
          </section>
        </div>

        <fieldset className={PANEL_CLASS}>
          <legend className="px-1 text-sm font-semibold text-text-primary">
            {t("calendar.attendees")}
          </legend>
          <div className="mb-2 flex flex-wrap gap-1">
            {form.attendees.map((attendee) => (
              <span
                key={attendee.email}
                className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg px-2.5 py-1 text-xs text-text-primary"
              >
                <Icon name="profile" size={13} className="text-text-muted" />
                {attendee.displayName ?? attendee.email}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={form.attendeeEmail}
              onChange={(e) => updateField("attendeeEmail", e.target.value)}
              placeholder={t("common.email")}
              className={`${FIELD_CLASS} min-w-0 flex-1 basis-48`}
            />
            <input
              value={form.attendeeName}
              onChange={(e) => updateField("attendeeName", e.target.value)}
              placeholder={t("calendar.attendeeName")}
              className={`${FIELD_CLASS} min-w-0 flex-1 basis-40`}
            />
            <button
              type="button"
              onClick={handleAddAttendee}
              className="hover:bg-bg-elevated/60 rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm font-medium text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("common.add")}
            </button>
          </div>
          {attendeeBusyWarning != null ? (
            <p className="mt-1 text-xs text-notice-base" role="status">
              {attendeeBusyWarning}
            </p>
          ) : null}
        </fieldset>

        <section className={PANEL_CLASS}>
          <label className="block text-sm">
            <span className={FIELD_LABEL_CLASS}>{t("calendar.description")}</span>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              className={`${FIELD_CLASS} resize-y`}
            />
          </label>
        </section>
      </form>
    </AppDialog>
  );
};
