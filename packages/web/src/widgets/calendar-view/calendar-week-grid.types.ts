import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export interface CalendarWeekGridProps {
  days: Date[];
  events: CalendarEvent[];
  getEventColor: (event: CalendarEvent) => string;
  onSelectEvent: (uid: string) => void;
}
