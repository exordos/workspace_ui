import React, { useCallback } from "react";
import { ProviderDeliveryBadge } from "~/shared/ui/provider-delivery-badge";
import type { CalendarEventChipProps } from "./calendar-event-chip.types";

export const CalendarEventChip = React.memo<CalendarEventChipProps>(function CalendarEventChip({
  event,
  color,
  showTime = false,
  onSelect,
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(event.uid, event.recurrenceId);
    },
    [event.recurrenceId, event.uid, onSelect],
  );
  const time =
    showTime && !event.allDay
      ? new Date(event.start).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : null;
  const label = time == null ? event.summary : `${time} ${event.summary}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mb-0.5 flex min-h-6 w-full items-center gap-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs text-text-primary shadow-sm transition-[filter,transform] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{
        borderLeftColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 18%, var(--color-card-bg))`,
      }}
      title={event.summary}
      aria-label={label}
    >
      {time != null ? <span className="shrink-0 font-medium text-text-muted">{time}</span> : null}
      <span className="min-w-0 flex-1 truncate font-medium">{event.summary}</span>
      <ProviderDeliveryBadge provider={event.provider} delivery={event.delivery} />
    </button>
  );
});
