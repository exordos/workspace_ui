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
import type { CalendarRecurrenceScope } from "~/features/calendar-recurrence-scope/calendar-recurrence-scope-dialog.ui";

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
  const selectedRecurrenceId = useCalendarStore((s) => s.selectedRecurrenceId);
  const setFocusDate = useCalendarStore((s) => s.setFocusDate);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const toggleCalendarVisibility = useCalendarStore((s) => s.toggleCalendarVisibility);
  const selectEvent = useCalendarStore((s) => s.selectEvent);
  const loadCalendars = useCalendarStore((s) => s.loadCalendars);
  const loadEventsForRange = useCalendarStore((s) => s.loadEventsForRange);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const createCalendar = useCalendarStore((s) => s.createCalendar);
  const deleteCalendar = useCalendarStore((s) => s.deleteCalendar);
  const searchEvents = useCalendarStore((s) => s.searchEvents);
  const importEventIcs = useCalendarStore((s) => s.importEventIcs);

  const [email, setEmail] = useState(instanceEmail);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [selectedIsoDate, setSelectedIsoDate] = useState<string | null>(toIsoDate(new Date()));
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [pendingScopeAction, setPendingScopeAction] = useState<"delete" | "edit" | null>(null);

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
    if (searchQuery.trim().length > 0) return;
    void loadEventsForRange(range.start, range.end);
  }, [session?.token, visibleCalendarIds, range.start, range.end, loadEventsForRange, searchQuery]);

  useEffect(() => {
    if (!session?.token || searchQuery.trim().length === 0) return;
    const timer = setTimeout(() => {
      void searchEvents(searchQuery, range.start, range.end);
    }, 300);
    return () => clearTimeout(timer);
  }, [range.end, range.start, searchEvents, searchQuery, session?.token]);

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
    setDraftStart(null);
    setFormOpen(true);
  }, []);

  const handleSelectTimeSlot = useCallback(
    (day: Date, start: Date) => {
      setEditingEvent(null);
      setDraftStart(start);
      setFocusDate(day);
      setSelectedIsoDate(toIsoDate(day));
      setFormOpen(true);
    },
    [setFocusDate],
  );

  const handleEditEvent = useCallback(() => {
    if (selectedEvent == null) return;
    if (selectedEvent.isRecurringInstance && selectedEvent.recurrenceId != null) {
      setPendingScopeAction("edit");
      setScopeDialogOpen(true);
      return;
    }
    setEditingEvent(selectedEvent);
    setFormOpen(true);
  }, [selectedEvent]);

  const handleDeleteEvent = useCallback(() => {
    if (selectedEvent == null) return;
    if (selectedEvent.isRecurringInstance && selectedEvent.recurrenceId != null) {
      setPendingScopeAction("delete");
      setScopeDialogOpen(true);
      return;
    }
    void deleteEvent(selectedEvent.calendarId, selectedEvent.uid, { scope: "all" });
  }, [deleteEvent, selectedEvent]);

  const handleRecurrenceScopeSelect = useCallback(
    async (scope: CalendarRecurrenceScope) => {
      if (selectedEvent == null || pendingScopeAction == null) return;
      setScopeDialogOpen(false);
      if (pendingScopeAction === "delete") {
        await deleteEvent(selectedEvent.calendarId, selectedEvent.uid, {
          recurrenceId: selectedEvent.recurrenceId,
          scope,
        });
      } else {
        setEditingEvent(selectedEvent);
        setFormOpen(true);
      }
      setPendingScopeAction(null);
    },
    [deleteEvent, pendingScopeAction, selectedEvent],
  );

  const handleCreateCalendar = useCallback(
    async (displayName: string) => {
      await createCalendar(displayName);
    },
    [createCalendar],
  );

  const handleDeleteCalendar = useCallback(
    async (calendarId: string) => {
      await deleteCalendar(calendarId);
    },
    [deleteCalendar],
  );

  const handleImportIcs = useCallback(
    async (calendarId: string, ics: string) => {
      await importEventIcs(calendarId, ics);
      await loadEventsForRange(range.start, range.end);
    },
    [importEventIcs, loadEventsForRange, range.end, range.start],
  );

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
    if (!open) {
      setEditingEvent(null);
      setDraftStart(null);
    }
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
    selectedCalendarName: selectedCalendarMeta.name,
    selectedCalendarColor: selectedCalendarMeta.color,
    selectedIsoDate,
    selectedEventUid,
    loadingCalendars,
    loadingEvents,
    saving,
    formOpen,
    editingEvent,
    draftStart,
    toolbarTitle,
    searchQuery,
    scopeDialogOpen,
    pendingScopeAction,
    setEmail,
    setSearchQuery,
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
    handleSelectTimeSlot,
    handleEditEvent,
    handleDeleteEvent,
    handleFormSubmit,
    handleFormOpenChange,
    handleRecurrenceScopeSelect,
    handleScopeDialogOpenChange: setScopeDialogOpen,
    handleCreateCalendar,
    handleDeleteCalendar,
    handleImportIcs,
  };
}
