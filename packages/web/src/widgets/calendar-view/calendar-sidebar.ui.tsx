import React, { useCallback, useMemo, useState } from "react";
import { addMonths, buildMonthGrid, toIsoDate } from "~/entities/calendar/calendar.lib";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { CalendarSidebarProps } from "./calendar-sidebar.types";

export const CalendarSidebarPanel = React.memo<CalendarSidebarProps>(function CalendarSidebarPanel({
  open,
  calendars,
  visibleCalendarIds,
  focusDate,
  onToggleCalendar,
  onSelectDate,
  onCreateCalendar,
  onDeleteCalendar,
  onRenameCalendar,
  loadingCalendars = false,
  getCalendarColor,
}) {
  const [newCalendarName, setNewCalendarName] = useState("");
  const [miniFocusDate, setMiniFocusDate] = useState(focusDate);

  const handleCreate = useCallback(() => {
    const trimmed = newCalendarName.trim();
    if (trimmed.length === 0) return;
    onCreateCalendar(trimmed);
    setNewCalendarName("");
  }, [newCalendarName, onCreateCalendar]);

  const handleRename = useCallback(
    (calendarId: string) => () => {
      onRenameCalendar(calendarId);
    },
    [onRenameCalendar],
  );
  const handleDelete = useCallback(
    (calendarId: string) => () => {
      onDeleteCalendar(calendarId);
    },
    [onDeleteCalendar],
  );
  const miniGrid = useMemo(() => buildMonthGrid(miniFocusDate), [miniFocusDate]);
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const miniMonthTitle = useMemo(
    () => miniFocusDate.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [miniFocusDate],
  );

  const handleMiniDayClick = useCallback((date: Date) => () => onSelectDate(date), [onSelectDate]);
  const handleMiniPrev = useCallback(() => {
    setMiniFocusDate((date) => addMonths(date, -1));
  }, []);
  const handleMiniNext = useCallback(() => {
    setMiniFocusDate((date) => addMonths(date, 1));
  }, []);

  return (
    <aside
      id="calendar-sidebar"
      className={[
        "absolute inset-y-0 left-0 z-overlay w-64 shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-card-bg p-3 shadow-lg md:static md:z-base md:w-16 md:p-2 md:shadow-none lg:w-60 lg:p-3",
        open ? "flex" : "hidden md:flex",
      ].join(" ")}
    >
      <div className="order-last min-h-0 flex-1 pt-4 md:order-none md:pt-1 lg:pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted md:sr-only lg:not-sr-only">
            {t("calendar.myCalendars")}
          </h2>
          {loadingCalendars ? (
            <span className="text-xs text-text-muted md:hidden lg:inline">
              {t("calendar.loading")}
            </span>
          ) : null}
        </div>
        <div className="mb-3 flex gap-1 md:hidden lg:flex">
          <input
            type="text"
            value={newCalendarName}
            onChange={(e) => setNewCalendarName(e.target.value)}
            placeholder={t("calendar.newCalendarName")}
            className="h-8 min-w-0 flex-1 rounded-lg border border-border-subtle bg-text-field-bg px-2 text-xs text-text-primary outline-none focus:border-accent"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-8 px-0"
            onClick={handleCreate}
            aria-label={t("common.create")}
          >
            <Icon name="add" size={17} />
          </Button>
        </div>
        <ul className="space-y-0.5">
          {calendars.map((calendar, index) => {
            const checked = visibleCalendarIds.includes(calendar.id);
            const color = getCalendarColor(calendar, index);
            return (
              <li key={calendar.id} className="group flex items-center gap-1">
                <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm transition-colors hover:bg-sidebar-hover md:justify-center md:px-0 lg:justify-start lg:px-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCalendar(calendar.id)}
                    className="sr-only"
                  />
                  <span
                    className={[
                      "h-3 w-3 shrink-0 rounded-full ring-offset-2 ring-offset-card-bg transition-opacity",
                      checked ? "ring-1 ring-current" : "opacity-30",
                    ].join(" ")}
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-text-primary md:hidden lg:block">
                    {calendar.displayName}
                  </span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-8 px-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 md:hidden lg:inline-flex"
                  onClick={handleRename(calendar.id)}
                  aria-label={t("calendar.renameCalendar")}
                >
                  <Icon name="pen" size={14} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-8 px-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 md:hidden lg:inline-flex"
                  onClick={handleDelete(calendar.id)}
                  aria-label={t("calendar.deleteCalendar")}
                >
                  <Icon name="close" size={14} />
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="order-first border-b border-border-subtle pb-4 md:hidden lg:block">
        <div className="mb-3 flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-8 px-0"
            onClick={handleMiniPrev}
            aria-label={t("calendar.prev")}
          >
            <Icon name="chevron-right" size={14} className="rotate-180" />
          </Button>
          <h3 className="min-w-0 flex-1 text-center text-sm font-semibold text-text-primary">
            {miniMonthTitle}
          </h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-8 px-0"
            onClick={handleMiniNext}
            aria-label={t("calendar.next")}
          >
            <Icon name="chevron-right" size={14} />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center text-xs">
          {miniGrid.slice(0, 7).map((cell) => (
            <span key={`head-${cell.isoDate}`} className="py-1 font-medium text-text-muted">
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
                aria-label={cell.date.toLocaleDateString()}
                aria-current={isToday ? "date" : undefined}
                className={[
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  cell.inCurrentMonth ? "text-text-primary" : "text-text-muted opacity-60",
                  isFocus ? "bg-accent font-semibold text-on-accent" : "hover:bg-sidebar-hover",
                  isToday && !isFocus ? "ring-1 ring-inset ring-accent" : "",
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
