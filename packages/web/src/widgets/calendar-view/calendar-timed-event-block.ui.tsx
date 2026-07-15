import React, { useCallback } from "react";
import type { CalendarEvent } from "~/entities/calendar/calendar.types";
import { ProviderDeliveryBadge } from "~/shared/ui/provider-delivery-badge";

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
    const startTime = new Date(event.start).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return (
      <button
        type="button"
        onClick={handleClick}
        className="absolute z-sticky overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-xs text-text-primary shadow-sm transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{
          top: topPx,
          height: heightPx,
          left: `calc(${leftPercent}% + 1px)`,
          width: `calc(${widthPercent}% - 2px)`,
          borderLeftColor: color,
          backgroundColor: `color-mix(in srgb, ${color} 18%, var(--color-card-bg))`,
        }}
        title={event.summary}
        aria-label={event.summary}
      >
        <span className="block truncate font-semibold leading-tight">{event.summary}</span>
        {heightPx >= 36 ? (
          <span className="mt-0.5 block truncate text-text-muted">{startTime}</span>
        ) : null}
        {heightPx >= 56 ? (
          <span className="mt-1 block">
            <ProviderDeliveryBadge provider={event.provider} delivery={event.delivery} />
          </span>
        ) : null}
      </button>
    );
  },
);
