import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";

export interface CalendarInfo {
  id: string;
  displayName: string;
  color: string | null;
  provider?: ProviderSummary | null;
  delivery?: Delivery | null;
}

export interface CalendarAttendee {
  email: string;
  displayName: string | null;
  partstat: string | null;
  role: string | null;
}

export interface CalendarAlarm {
  triggerMinutes: number | null;
  triggerAbsolute: string | null;
  action: string;
}

export interface CalendarRecurrence {
  rrule: string | null;
}

export interface CalendarEvent {
  resourceId?: string;
  uid: string;
  calendarId: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: CalendarRecurrence | null;
  attendees: CalendarAttendee[];
  alarms: CalendarAlarm[];
  recurrenceId: string | null;
  isRecurringInstance: boolean;
  provider?: ProviderSummary | null;
  delivery?: Delivery | null;
}

export interface CalendarEventInput {
  calendarId: string;
  uid?: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: string;
  end: string;
  allDay?: boolean;
  recurrence?: CalendarRecurrence | null;
  attendees?: CalendarAttendee[];
  alarms?: CalendarAlarm[];
}

export type CalendarViewMode = "month" | "week" | "day";
