import React, { useCallback, useMemo, useState } from "react";
import { buildMonthGrid, toIsoDate } from "~/entities/calendar/calendar.lib";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import type { CalendarSidebarProps } from "./calendar-sidebar.types";

export const CalendarSidebarPanel = React.memo<CalendarSidebarProps>(function CalendarSidebarPanel({
  calendars,
  visibleCalendarIds,
  focusDate,
  onToggleCalendar,
  onSelectDate,
  onCreateCalendar,
  onDeleteCalendar,
  getCalendarColor,
}) {
  const [newCalendarName, setNewCalendarName] = useState("");

  const handleCreate = useCallback(() => {
    const trimmed = newCalendarName.trim();
    if (trimmed.length === 0) return;
    onCreateCalendar(trimmed);
    setNewCalendarName("");
  }, [newCalendarName, onCreateCalendar]);

  const handleDelete = useCallback(
    (calendarId: string) => () => {
      onDeleteCalendar(calendarId);
    },
    [onDeleteCalendar],
  );
  const miniGrid = useMemo(() => buildMonthGrid(focusDate), [focusDate]);
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const handleMiniDayClick = useCallback((date: Date) => () => onSelectDate(date), [onSelectDate]);

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-border-subtle pr-3">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text-primary">{t("calendar.myCalendars")}</h2>
        </div>
        <div className="mb-2 flex gap-1">
          <input
            type="text"
            value={newCalendarName}
            onChange={(e) => setNewCalendarName(e.target.value)}
            placeholder={t("calendar.newCalendarName")}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg px-2 py-1 text-xs text-text-primary"
          />
          <Button type="button" size="sm" variant="ghost" onClick={handleCreate}>
            {t("common.create")}
          </Button>
        </div>
        <ul className="space-y-1">
          {calendars.map((calendar, index) => {
            const checked = visibleCalendarIds.includes(calendar.id);
            const color = getCalendarColor(calendar, index);
            return (
              <li key={calendar.id} className="group flex items-center gap-1">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCalendar(calendar.id)}
                    className="rounded border-border-subtle"
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-text-primary">{calendar.displayName}</span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={handleDelete(calendar.id)}
                  aria-label={t("calendar.deleteCalendar")}
                >
                  ×
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          {t("calendar.miniMonth")}
        </h3>
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
          {miniGrid.slice(0, 7).map((cell) => (
            <span key={`head-${cell.isoDate}`} className="py-1 text-text-muted">
              {cell.date.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          ))}
          {miniGrid.map((cell) => {
            const isToday = cell.isoDate === todayIso;
            const isFocus = cell.isoDate === toIsoDate(focusDate);
            return (
              <button
                key={cell.isoDate}
                type="button"
                onClick={handleMiniDayClick(cell.date)}
                className={[
                  "rounded p-1",
                  cell.inCurrentMonth ? "text-text-primary" : "text-text-muted",
                  isToday ? "bg-accent/20 font-medium" : "",
                  isFocus ? "ring-1 ring-accent" : "hover:bg-bg",
                ].join(" ")}
              >
                {cell.date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
});

export const CalendarSidebar = CalendarSidebarPanel;
