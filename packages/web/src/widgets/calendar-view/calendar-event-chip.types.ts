import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export interface CalendarEventChipProps {
  event: CalendarEvent;
  color: string;
  onSelect: (uid: string) => void;
}
