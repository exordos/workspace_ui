import React, { useCallback, useMemo } from "react";
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

  const handleDayClick = useCallback((date: Date) => () => onSelectDay(date), [onSelectDay]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-card-bg">
      <div className="grid grid-cols-7 border-b border-border-subtle text-center text-xs font-medium text-text-muted">
        {weekdays.map((cell) => (
          <div key={`wd-${cell.isoDate}`} className="py-2">
            {cell.date.toLocaleDateString(undefined, { weekday: "short" })}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-auto">
        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.isoDate) ?? [];
          const isSelected = selectedIsoDate === cell.isoDate;
          return (
            <button
              key={cell.isoDate}
              type="button"
              onClick={handleDayClick(cell.date)}
              className={[
                "flex min-h-20 flex-col border-b border-r border-border-subtle p-1 text-left",
                cell.inCurrentMonth ? "bg-card-bg" : "bg-bg text-text-muted",
                isSelected ? "ring-1 ring-inset ring-accent" : "",
              ].join(" ")}
            >
              <span className="mb-1 text-xs font-medium">{cell.date.getDate()}</span>
              <div className="min-h-0 flex-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarEventChip
                    key={`${event.uid}-${event.recurrenceId ?? ""}`}
                    event={event}
                    color={getEventColor(event)}
                    onSelect={onSelectEvent}
                  />
                ))}
                {dayEvents.length > 3 ? (
                  <span className="text-xs text-text-muted">+{dayEvents.length - 3}</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
