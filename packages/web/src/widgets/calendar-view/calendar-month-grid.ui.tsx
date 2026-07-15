import React, { useCallback, useMemo } from "react";
import { toIsoDate } from "~/entities/calendar/calendar.lib";
import { CalendarEventChip } from "./calendar-event-chip.ui";
import type { CalendarMonthGridProps } from "./calendar-month-grid.types";

export const CalendarMonthGrid: React.FC<CalendarMonthGridProps> = ({
  cells,
  eventsByDay,
  selectedIsoDate,
  getEventColor,
  onSelectDay,
  onSelectEvent,
}) => {
  const weekdays = useMemo(() => cells.slice(0, 7), [cells]);
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const handleDayClick = useCallback((date: Date) => () => onSelectDay(date), [onSelectDay]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card-bg" role="grid">
      <div
        className="grid shrink-0 grid-cols-7 border-b border-border-subtle bg-bg text-center text-xs font-semibold uppercase tracking-wide text-text-muted"
        role="row"
      >
        {weekdays.map((cell) => (
          <div key={`wd-${cell.isoDate}`} className="truncate px-1 py-2.5" role="columnheader">
            {cell.date.toLocaleDateString(undefined, { weekday: "short" })}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 min-w-0 flex-1 grid-cols-7 grid-rows-6 overflow-auto"
        role="rowgroup"
      >
        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.isoDate) ?? [];
          const isSelected = selectedIsoDate === cell.isoDate;
          return (
            <div
              key={cell.isoDate}
              role="gridcell"
              aria-label={cell.date.toLocaleDateString()}
              aria-selected={isSelected}
              className={[
                "hover:bg-sidebar-hover/40 group flex min-h-20 min-w-0 flex-col border-b border-r border-border-subtle p-1.5 text-left transition-colors",
                cell.inCurrentMonth ? "bg-card-bg" : "bg-bg text-text-muted opacity-75",
                isSelected ? "bg-accent/5 ring-1 ring-inset ring-accent" : "",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={handleDayClick(cell.date)}
                aria-current={cell.isoDate === todayIso ? "date" : undefined}
                className={[
                  "mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  cell.isoDate === todayIso
                    ? "bg-accent font-semibold text-on-accent"
                    : "group-hover:bg-bg-elevated/60",
                ].join(" ")}
              >
                {cell.date.getDate()}
              </button>
              <div className="min-h-0 flex-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarEventChip
                    key={`${event.uid}-${event.recurrenceId ?? ""}`}
                    event={event}
                    color={getEventColor(event)}
                    showTime
                    onSelect={onSelectEvent}
                  />
                ))}
                {dayEvents.length > 3 ? (
                  <span className="text-xs text-text-muted">+{dayEvents.length - 3}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
