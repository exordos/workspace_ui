import type { CalendarViewMode } from "~/entities/calendar/calendar.types";

export interface CalendarToolbarProps {
  viewMode: CalendarViewMode;
  title: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onImportIcs: (file: File) => void;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent: () => void;
}
