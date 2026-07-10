import type { CalendarInfo } from "~/entities/calendar/calendar.types";

export interface CalendarSidebarProps {
  calendars: CalendarInfo[];
  visibleCalendarIds: string[];
  focusDate: Date;
  onToggleCalendar: (calendarId: string) => void;
  onSelectDate: (date: Date) => void;
  onCreateCalendar: (displayName: string) => void;
  onDeleteCalendar: (calendarId: string) => void;
  getCalendarColor: (calendar: CalendarInfo, index: number) => string;
}
