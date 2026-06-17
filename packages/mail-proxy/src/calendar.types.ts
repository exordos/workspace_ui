/**
 * Calendar DTO types shared between mail-proxy routes and web client.
 */

export interface CalendarInfo {
  id: string;
  displayName: string;
  color: string | null;
  ctag: string | null;
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
  uid: string;
  calendarId: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  etag: string | null;
  recurrence: CalendarRecurrence | null;
  attendees: CalendarAttendee[];
  alarms: CalendarAlarm[];
  recurrenceId: string | null;
  isRecurringInstance: boolean;
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
  etag?: string | null;
}

export interface CalendarEventsQuery {
  calendarIds: string[];
  start: string;
  end: string;
}
