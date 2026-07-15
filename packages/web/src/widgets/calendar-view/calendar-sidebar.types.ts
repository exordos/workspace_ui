import type { CalendarInfo } from "~/entities/calendar/calendar.types";

export interface CalendarSidebarProps {
  open: boolean;
  calendars: CalendarInfo[];
  visibleCalendarIds: string[];
  focusDate: Date;
  onToggleCalendar: (calendarId: string) => void;
  onSelectDate: (date: Date) => void;
  onCreateCalendar: (displayName: string) => void;
  onDeleteCalendar: (calendarId: string) => void;
  onRenameCalendar: (calendarId: string) => void;
  loadingCalendars?: boolean;
  getCalendarColor: (calendar: CalendarInfo, index: number) => string;
}
