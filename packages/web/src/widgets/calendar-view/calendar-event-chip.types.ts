import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export interface CalendarEventChipProps {
  event: CalendarEvent;
  color: string;
  showTime?: boolean;
  onSelect: (uid: string, recurrenceId?: string | null) => void;
}
