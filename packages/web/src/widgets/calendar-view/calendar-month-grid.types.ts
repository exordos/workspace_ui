import type { CalendarDayCell } from "~/entities/calendar/calendar.lib";
import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export interface CalendarMonthGridProps {
  cells: CalendarDayCell[];
  eventsByDay: Map<string, CalendarEvent[]>;
  selectedIsoDate: string | null;
  getEventColor: (event: CalendarEvent) => string;
  onSelectDay: (date: Date) => void;
  onSelectEvent: (uid: string) => void;
}
