import type { CalendarEvent } from "~/entities/calendar/calendar.types";

export interface CalendarEventDetailProps {
  event: CalendarEvent | null;
  calendarName: string | null;
  calendarColor: string | null;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}
