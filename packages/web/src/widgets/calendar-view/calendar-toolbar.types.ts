import type { CalendarViewMode } from "~/entities/calendar/calendar.types";

export interface CalendarToolbarProps {
  viewMode: CalendarViewMode;
  title: string;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent: () => void;
  onSignOut: () => void;
}
