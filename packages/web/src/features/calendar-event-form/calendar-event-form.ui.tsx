import React, { useCallback, useEffect, useState } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { buildDefaultFormState, formStateToEventInput } from "./calendar-event-form.lib";
import type {
  CalendarEventFormDialogProps,
  CalendarEventFormState,
} from "./calendar-event-form.types";

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
  const [form, setForm] = useState<CalendarEventFormState>(() =>
    buildDefaultFormState(calendars, focusDate, initialEvent, draftStart),
  );

  useEffect(() => {
    if (open) {
      setForm(buildDefaultFormState(calendars, focusDate, initialEvent, draftStart));
    }
  }, [open, calendars, focusDate, initialEvent, draftStart]);

  const updateField = useCallback(
    <K extends keyof CalendarEventFormState>(key: K, value: CalendarEventFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleAddAttendee = useCallback(() => {
    if (form.attendeeEmail.trim().length === 0) return;
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
  }, [form.attendeeEmail, form.attendeeName]);

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
      maxWidthClassName="max-w-lg"
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
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.eventTitle")}</span>
          <input
            value={form.summary}
            onChange={(e) => updateField("summary", e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.calendar")}</span>
          <select
            value={form.calendarId}
            onChange={(e) => updateField("calendarId", e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
          >
            {calendars.map((cal) => (
              <option key={cal.id} value={cal.id}>
                {cal.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => updateField("allDay", e.target.checked)}
          />
          {t("calendar.allDay")}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">{t("calendar.start")}</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => updateField("startDate", e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
            />
          </label>
          {!form.allDay ? (
            <label className="block text-sm">
              <span className="mb-1 block text-text-muted">{t("calendar.startTime")}</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => updateField("startTime", e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">{t("calendar.end")}</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => updateField("endDate", e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
            />
          </label>
          {!form.allDay ? (
            <label className="block text-sm">
              <span className="mb-1 block text-text-muted">{t("calendar.endTime")}</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => updateField("endTime", e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.location")}</span>
          <input
            value={form.location}
            onChange={(e) => updateField("location", e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.description")}</span>
          <textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.recurrence")}</span>
          <select
            value={form.recurrencePreset}
            onChange={(e) =>
              updateField(
                "recurrencePreset",
                e.target.value as CalendarEventFormState["recurrencePreset"],
              )
            }
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
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
            <span className="mb-1 block text-text-muted">{t("calendar.customRrule")}</span>
            <input
              value={form.customRrule}
              onChange={(e) => updateField("customRrule", e.target.value)}
              placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
              className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
            />
          </label>
        ) : null}
        <div>
          <span className="mb-1 block text-sm text-text-muted">{t("calendar.attendees")}</span>
          <div className="mb-2 flex flex-wrap gap-1">
            {form.attendees.map((a) => (
              <span
                key={a.email}
                className="rounded-full bg-bg px-2 py-0.5 text-xs text-text-primary"
              >
                {a.displayName ?? a.email}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              value={form.attendeeEmail}
              onChange={(e) => updateField("attendeeEmail", e.target.value)}
              placeholder={t("common.email")}
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
            />
            <input
              value={form.attendeeName}
              onChange={(e) => updateField("attendeeName", e.target.value)}
              placeholder={t("calendar.attendeeName")}
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAddAttendee}
              className="rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-primary hover:bg-bg"
            >
              {t("common.add")}
            </button>
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.reminder")}</span>
          <select
            value={form.reminderMinutes}
            onChange={(e) => updateField("reminderMinutes", e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm"
          >
            <option value="">{t("calendar.reminderNone")}</option>
            <option value="5">{t("calendar.reminder5m")}</option>
            <option value="15">{t("calendar.reminder15m")}</option>
            <option value="60">{t("calendar.reminder1h")}</option>
            <option value="1440">{t("calendar.reminder1d")}</option>
          </select>
        </label>
      </form>
    </AppDialog>
  );
};
