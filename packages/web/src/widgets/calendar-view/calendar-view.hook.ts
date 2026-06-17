import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  buildMonthGrid,
  buildWeekDays,
  defaultCalendarColor,
  endOfMonth,
  eventOccursOnDay,
  startOfMonth,
  startOfWeek,
  toIsoDate,
} from "~/entities/calendar/calendar.lib";
import { useCalendarStore } from "~/entities/calendar/calendar.model";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarInfo,
} from "~/entities/calendar/calendar.types";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useMailStore } from "~/entities/mail/mail.model";

export function useCalendarView() {
  const instanceEmail = useInstancesStore((s) => s.getCurrentInstance()?.email ?? "");
  const session = useMailStore((s) => s.session);
  const signingIn = useMailStore((s) => s.signingIn);
  const mailError = useMailStore((s) => s.error);
  const signIn = useMailStore((s) => s.signIn);
  const signOut = useMailStore((s) => s.signOut);

  const calendars = useCalendarStore((s) => s.calendars);
  const visibleCalendarIds = useCalendarStore((s) => s.visibleCalendarIds);
  const events = useCalendarStore((s) => s.events);
  const focusDate = useCalendarStore((s) => s.focusDate);
  const viewMode = useCalendarStore((s) => s.viewMode);
  const loadingCalendars = useCalendarStore((s) => s.loadingCalendars);
  const loadingEvents = useCalendarStore((s) => s.loadingEvents);
  const saving = useCalendarStore((s) => s.saving);
  const calendarError = useCalendarStore((s) => s.error);
  const selectedEventUid = useCalendarStore((s) => s.selectedEventUid);
  const setFocusDate = useCalendarStore((s) => s.setFocusDate);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const toggleCalendarVisibility = useCalendarStore((s) => s.toggleCalendarVisibility);
  const selectEvent = useCalendarStore((s) => s.selectEvent);
  const loadCalendars = useCalendarStore((s) => s.loadCalendars);
  const loadEventsForRange = useCalendarStore((s) => s.loadEventsForRange);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);

  const [email, setEmail] = useState(instanceEmail);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedIsoDate, setSelectedIsoDate] = useState<string | null>(toIsoDate(new Date()));

  useEffect(() => {
    if (instanceEmail.length > 0) setEmail(instanceEmail);
  }, [instanceEmail]);

  const range = useMemo(() => {
    // Send local calendar dates (YYYY-MM-DD); exclusive end date for CalDAV time-range.
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
    if (!session?.token) return;
    void loadCalendars();
  }, [session?.token, loadCalendars]);

  useEffect(() => {
    if (!session?.token || visibleCalendarIds.length === 0) return;
    void loadEventsForRange(range.start, range.end);
  }, [session?.token, visibleCalendarIds, range.start, range.end, loadEventsForRange]);

  const monthCells = useMemo(() => buildMonthGrid(focusDate), [focusDate]);
  const weekDays = useMemo(() => buildWeekDays(focusDate), [focusDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const cell of monthCells) {
      map.set(
        cell.isoDate,
        events.filter((e) => eventOccursOnDay(e, cell.isoDate)),
      );
    }
    return map;
  }, [monthCells, events]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.uid === selectedEventUid) ?? null,
    [events, selectedEventUid],
  );

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

  const handleAuthSubmit = useCallback(
    async (password: string) => {
      await signIn(email, password);
    },
    [email, signIn],
  );

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

  const handleNewEvent = useCallback(() => {
    setEditingEvent(null);
    setFormOpen(true);
  }, []);

  const handleEditEvent = useCallback(() => {
    if (selectedEvent == null) return;
    setEditingEvent(selectedEvent);
    setFormOpen(true);
  }, [selectedEvent]);

  const handleDeleteEvent = useCallback(async () => {
    if (selectedEvent == null) return;
    await deleteEvent(selectedEvent.calendarId, selectedEvent.uid);
  }, [deleteEvent, selectedEvent]);

  const handleFormSubmit = useCallback(
    async (input: CalendarEventInput) => {
      if (editingEvent != null) {
        await updateEvent(editingEvent.uid, { ...input, etag: editingEvent.etag });
      } else {
        await createEvent(input);
      }
      setFormOpen(false);
      setEditingEvent(null);
      await loadEventsForRange(range.start, range.end);
    },
    [createEvent, editingEvent, loadEventsForRange, range.end, range.start, updateEvent],
  );

  const handleFormOpenChange = useCallback((open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingEvent(null);
  }, []);

  return {
    session,
    signingIn,
    error: mailError ?? calendarError,
    email,
    calendars,
    visibleCalendarIds,
    events,
    focusDate,
    viewMode,
    monthCells,
    weekDays,
    eventsByDay,
    selectedEvent,
    selectedIsoDate,
    selectedEventUid,
    loadingCalendars,
    loadingEvents,
    saving,
    formOpen,
    editingEvent,
    toolbarTitle,
    setEmail,
    setViewMode,
    toggleCalendarVisibility,
    selectEvent,
    getEventColor,
    getCalendarColor,
    handleAuthSubmit,
    handleSignOut: signOut,
    handlePrev,
    handleNext,
    handleToday,
    handleSelectDay,
    handleNewEvent,
    handleEditEvent,
    handleDeleteEvent,
    handleFormSubmit,
    handleFormOpenChange,
  };
}
