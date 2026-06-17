import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarInfo,
} from "~/entities/calendar/calendar.types";

export interface CalendarEventFormDialogProps {
  open: boolean;
  calendars: CalendarInfo[];
  initialEvent: CalendarEvent | null;
  focusDate: Date;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CalendarEventInput) => Promise<void>;
}

export type RecurrencePreset = "none" | "daily" | "weekly" | "monthly" | "custom";

export interface CalendarEventFormState {
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  recurrencePreset: RecurrencePreset;
  customRrule: string;
  attendeeEmail: string;
  attendeeName: string;
  attendees: CalendarEvent["attendees"];
  reminderMinutes: string;
  alarms: CalendarEvent["alarms"];
}
