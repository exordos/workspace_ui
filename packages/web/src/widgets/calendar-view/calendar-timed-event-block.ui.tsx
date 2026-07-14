import React, { useCallback } from "react";
import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export interface CalendarTimedEventBlockProps {
  event: CalendarEvent;
  color: string;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  onSelect: (uid: string, recurrenceId?: string | null) => void;
}

export const CalendarTimedEventBlock = React.memo<CalendarTimedEventBlockProps>(
  function CalendarTimedEventBlock({
    event,
    color,
    topPx,
    heightPx,
    leftPercent,
    widthPercent,
    onSelect,
  }) {
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(event.uid, event.recurrenceId);
      },
      [event.recurrenceId, event.uid, onSelect],
    );

    return (
      <button
        type="button"
        onClick={handleClick}
        className="absolute z-sticky overflow-hidden rounded border-l-2 px-1 py-0.5 text-left text-xs text-text-primary"
        style={{
          top: topPx,
          height: heightPx,
          left: `calc(${leftPercent}% + 1px)`,
          width: `calc(${widthPercent}% - 2px)`,
          borderLeftColor: color,
          backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
        }}
        title={event.summary}
      >
        <span className="line-clamp-2 font-medium leading-tight">{event.summary}</span>
      </button>
    );
  },
);
