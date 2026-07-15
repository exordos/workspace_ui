import React, { useMemo } from "react";
import { CalendarTimeGrid } from "./calendar-time-grid.ui";
import type { CalendarWeekGridProps } from "./calendar-week-grid.types";

export interface CalendarDayGridProps extends Omit<CalendarWeekGridProps, "days"> {
  date: Date;
}

export const CalendarDayGrid: React.FC<CalendarDayGridProps> = ({
  date,
  events,
  getEventColor,
  onSelectEvent,
  onSelectTimeSlot,
}) => {
  const days = useMemo(() => [date], [date]);

  return (
    <CalendarTimeGrid
      days={days}
      events={events}
      getEventColor={getEventColor}
      onSelectEvent={onSelectEvent}
      onSelectTimeSlot={onSelectTimeSlot}
      layout="day"
    />
  );
};
