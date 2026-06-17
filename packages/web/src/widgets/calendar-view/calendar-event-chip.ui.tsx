import React, { useCallback } from "react";
import type { CalendarEventChipProps } from "./calendar-event-chip.types";

export const CalendarEventChip = React.memo<CalendarEventChipProps>(function CalendarEventChip({
  event,
  color,
  onSelect,
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(event.uid);
    },
    [event.uid, onSelect],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mb-0.5 w-full truncate rounded px-1 py-0.5 text-left text-xs text-text-primary"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)` }}
      title={event.summary}
    >
      {event.summary}
    </button>
  );
});
