import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  buildEventsByDay,
  buildMonthGrid,
  buildWeekDays,
  defaultCalendarColor,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  toIsoDate,
} from "~/entities/calendar/calendar.lib";
import { useCalendarStore } from "~/entities/calendar/calendar.model";
import type { CalendarEvent, CalendarInfo } from "~/entities/calendar/calendar.types";

interface UseCalendarViewDataOptions {
  sessionToken: string | undefined;
}

export function useCalendarViewData({ sessionToken }: UseCalendarViewDataOptions) {
  const calendars = useCalendarStore((s) => s.calendars);
  const visibleCalendarIds = useCalendarStore((s) => s.visibleCalendarIds);
  const events = useCalendarStore((s) => s.events);
  const focusDate = useCalendarStore((s) => s.focusDate);
  const viewMode = useCalendarStore((s) => s.viewMode);
  const loadingCalendars = useCalendarStore((s) => s.loadingCalendars);
  const loadingEvents = useCalendarStore((s) => s.loadingEvents);
  const calendarError = useCalendarStore((s) => s.error);
  const selectedEventUid = useCalendarStore((s) => s.selectedEventUid);
  const selectedRecurrenceId = useCalendarStore((s) => s.selectedRecurrenceId);
  const setFocusDate = useCalendarStore((s) => s.setFocusDate);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const toggleCalendarVisibility = useCalendarStore((s) => s.toggleCalendarVisibility);
  const selectEvent = useCalendarStore((s) => s.selectEvent);
  const loadCalendars = useCalendarStore((s) => s.loadCalendars);
  const loadEventsForRange = useCalendarStore((s) => s.loadEventsForRange);
  const searchEvents = useCalendarStore((s) => s.searchEvents);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIsoDate, setSelectedIsoDate] = useState<string | null>(toIsoDate(new Date()));

  const range = useMemo(() => {
    if (viewMode === "week") {
      const weekStart = startOfWeek(focusDate);
      return {
        start: toIsoDate(weekStart),
        end: toIsoDate(addDays(weekStart, 7)),
      };
    }
    if (viewMode === "day") {
      return {
        start: toIsoDate(focusDate),
        end: toIsoDate(addDays(focusDate, 1)),
      };
    }
    const grid = buildMonthGrid(focusDate);
    const first = grid[0]?.date ?? startOfMonth(focusDate);
    const last = grid[grid.length - 1]?.date ?? endOfMonth(focusDate);
    return { start: toIsoDate(first), end: toIsoDate(addDays(last, 1)) };
  }, [focusDate, viewMode]);

  useEffect(() => {
    if (sessionToken == null) return;
    void loadCalendars();
  }, [sessionToken, loadCalendars]);

  useEffect(() => {
    if (sessionToken == null || visibleCalendarIds.length === 0) return;
    if (searchQuery.trim().length > 0) return;
    void loadEventsForRange(range.start, range.end);
  }, [sessionToken, visibleCalendarIds, range.start, range.end, loadEventsForRange, searchQuery]);

  useEffect(() => {
    if (sessionToken == null || searchQuery.trim().length === 0) return;
    const timer = setTimeout(() => {
      void searchEvents(searchQuery, range.start, range.end);
    }, 300);
    return () => clearTimeout(timer);
  }, [range.end, range.start, searchEvents, searchQuery, sessionToken]);

  const monthCells = useMemo(() => buildMonthGrid(focusDate), [focusDate]);
  const weekDays = useMemo(() => buildWeekDays(focusDate), [focusDate]);

  const eventsByDay = useMemo(
    () =>
      buildEventsByDay(
        events,
        monthCells.map((cell) => cell.isoDate),
      ),
    [monthCells, events],
  );

  const selectedEvent = useMemo(
    () =>
      events.find(
        (event) =>
          event.uid === selectedEventUid &&
          (selectedRecurrenceId == null
            ? event.recurrenceId == null
            : event.recurrenceId === selectedRecurrenceId),
      ) ??
      events.find((event) => event.uid === selectedEventUid) ??
      null,
    [events, selectedEventUid, selectedRecurrenceId],
  );

  const selectedCalendarMeta = useMemo(() => {
    if (selectedEvent == null) return { name: null, color: null };
    const calendar = calendars.find((c) => c.id === selectedEvent.calendarId);
    const index = calendars.findIndex((c) => c.id === selectedEvent.calendarId);
    return {
      name: calendar?.displayName ?? selectedEvent.calendarId,
      color: calendar?.color ?? defaultCalendarColor(Math.max(index, 0)),
    };
  }, [calendars, selectedEvent]);

  const calendarColorMap = useMemo(() => {
    const map = new Map<string, string>();
    calendars.forEach((cal, index) => {
      map.set(cal.id, cal.color ?? defaultCalendarColor(index));
    });
    return map;
  }, [calendars]);

  const getEventColor = useCallback(
    (event: CalendarEvent) => calendarColorMap.get(event.calendarId) ?? defaultCalendarColor(0),
    [calendarColorMap],
  );

  const getCalendarColor = useCallback(
    (calendar: CalendarInfo, index: number) => calendar.color ?? defaultCalendarColor(index),
    [],
  );

  const toolbarTitle = useMemo(() => {
    if (viewMode === "day") {
      return focusDate.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    return focusDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [focusDate, viewMode]);

  const handlePrev = useCallback(() => {
    if (viewMode === "month") setFocusDate(addMonths(focusDate, -1));
    else if (viewMode === "week") setFocusDate(addDays(focusDate, -7));
    else setFocusDate(addDays(focusDate, -1));
  }, [focusDate, setFocusDate, viewMode]);

  const handleNext = useCallback(() => {
    if (viewMode === "month") setFocusDate(addMonths(focusDate, 1));
    else if (viewMode === "week") setFocusDate(addDays(focusDate, 7));
    else setFocusDate(addDays(focusDate, 1));
  }, [focusDate, setFocusDate, viewMode]);

  const handleToday = useCallback(() => {
    const today = new Date();
    setFocusDate(today);
    setSelectedIsoDate(toIsoDate(today));
  }, [setFocusDate]);

  const handleSelectDay = useCallback(
    (date: Date) => {
      setFocusDate(date);
      setSelectedIsoDate(toIsoDate(date));
      if (viewMode === "month") setViewMode("day");
    },
    [setFocusDate, setViewMode, viewMode],
  );

  return {
    calendars,
    visibleCalendarIds,
    events,
    focusDate,
    viewMode,
    monthCells,
    weekDays,
    eventsByDay,
    selectedEvent,
    selectedCalendarName: selectedCalendarMeta.name,
    selectedCalendarColor: selectedCalendarMeta.color,
    selectedIsoDate,
    selectedEventUid,
    loadingCalendars,
    loadingEvents,
    calendarError,
    toolbarTitle,
    searchQuery,
    range,
    setSearchQuery,
    setViewMode,
    toggleCalendarVisibility,
    selectEvent,
    getEventColor,
    getCalendarColor,
    loadEventsForRange,
    handlePrev,
    handleNext,
    handleToday,
    handleSelectDay,
    setFocusDate,
    setSelectedIsoDate,
  };
}
