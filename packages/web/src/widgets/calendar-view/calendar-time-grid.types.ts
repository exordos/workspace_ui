import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export type CalendarTimeGridLayout = "week" | "day";

export interface CalendarTimeGridProps {
  days: Date[];
  events: CalendarEvent[];
  getEventColor: (event: CalendarEvent) => string;
  onSelectEvent: (uid: string, recurrenceId?: string | null) => void;
  onSelectTimeSlot?: (day: Date, start: Date) => void;
  layout?: CalendarTimeGridLayout;
}
