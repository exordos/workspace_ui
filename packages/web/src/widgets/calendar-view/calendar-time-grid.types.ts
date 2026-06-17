import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export type CalendarTimeGridLayout = "week" | "day";

export interface CalendarTimeGridProps {
  days: Date[];
  events: CalendarEvent[];
  getEventColor: (event: CalendarEvent) => string;
  onSelectEvent: (uid: string) => void;
  layout?: CalendarTimeGridLayout;
}
