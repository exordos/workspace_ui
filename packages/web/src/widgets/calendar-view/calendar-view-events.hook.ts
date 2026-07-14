import { useCallback, useState } from "react";
import { toIsoDate } from "~/entities/calendar/calendar.lib";
import { useCalendarStore } from "~/entities/calendar/calendar.model";
import type { CalendarEvent, CalendarEventInput } from "~/entities/calendar/calendar.types";
import type { CalendarRecurrenceScope } from "~/features/calendar-recurrence-scope/calendar-recurrence-scope-dialog.ui";

interface UseCalendarViewEventsOptions {
  selectedEvent: CalendarEvent | null;
  range: { start: string; end: string };
  loadEventsForRange: (start: string, end: string) => Promise<void>;
  setFocusDate: (date: Date) => void;
  setSelectedIsoDate: (iso: string) => void;
}

export function useCalendarViewEvents({
  selectedEvent,
  range,
  loadEventsForRange,
  setFocusDate,
  setSelectedIsoDate,
}: UseCalendarViewEventsOptions) {
  const saving = useCalendarStore((s) => s.saving);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const createCalendar = useCalendarStore((s) => s.createCalendar);
  const updateCalendar = useCalendarStore((s) => s.updateCalendar);
  const deleteCalendar = useCalendarStore((s) => s.deleteCalendar);
  const importEventIcs = useCalendarStore((s) => s.importEventIcs);
  const moveEvent = useCalendarStore((s) => s.moveEvent);
  const exportEventIcs = useCalendarStore((s) => s.exportEventIcs);
  const loadEventForEdit = useCalendarStore((s) => s.loadEventForEdit);

  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [pendingScopeAction, setPendingScopeAction] = useState<"delete" | "edit" | null>(null);
  const [pendingScope, setPendingScope] = useState<CalendarRecurrenceScope | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingCalendarId, setRenamingCalendarId] = useState<string | null>(null);

  const handleNewEvent = useCallback(() => {
    setEditingEvent(null);
    setDraftStart(null);
    setPendingScope(null);
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
    [setFocusDate, setSelectedIsoDate],
  );

  const handleEditEvent = useCallback(() => {
    if (selectedEvent == null) return;
    if (selectedEvent.isRecurringInstance && selectedEvent.recurrenceId != null) {
      setPendingScopeAction("edit");
      setScopeDialogOpen(true);
      return;
    }
    void loadEventForEdit(selectedEvent.calendarId, selectedEvent.uid).then((event) => {
      setEditingEvent(event ?? selectedEvent);
      setFormOpen(true);
    });
  }, [loadEventForEdit, selectedEvent]);

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
        setPendingScope(scope);
        const event = await loadEventForEdit(selectedEvent.calendarId, selectedEvent.uid);
        setEditingEvent(event ?? selectedEvent);
        setFormOpen(true);
      }
      setPendingScopeAction(null);
    },
    [deleteEvent, loadEventForEdit, pendingScopeAction, selectedEvent],
  );

  const handleCreateCalendar = useCallback(
    async (displayName: string) => {
      await createCalendar(displayName);
    },
    [createCalendar],
  );

  const handleRenameCalendar = useCallback(
    async (calendarId: string, displayName: string, color?: string | null) => {
      await updateCalendar(calendarId, displayName, color);
      setRenameDialogOpen(false);
      setRenamingCalendarId(null);
    },
    [updateCalendar],
  );

  const handleOpenRenameCalendar = useCallback((calendarId: string) => {
    setRenamingCalendarId(calendarId);
    setRenameDialogOpen(true);
  }, []);

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
        await updateEvent(editingEvent.uid, {
          ...input,
          etag: editingEvent.etag,
          scope: pendingScope ?? undefined,
          recurrenceId: editingEvent.recurrenceId,
        });
      } else {
        await createEvent(input);
      }
      setFormOpen(false);
      setEditingEvent(null);
      setPendingScope(null);
      await loadEventsForRange(range.start, range.end);
    },
    [
      createEvent,
      editingEvent,
      loadEventsForRange,
      pendingScope,
      range.end,
      range.start,
      updateEvent,
    ],
  );

  const handleFormOpenChange = useCallback((open: boolean) => {
    setFormOpen(open);
    if (!open) {
      setEditingEvent(null);
      setDraftStart(null);
      setPendingScope(null);
    }
  }, []);

  const handleMoveEvent = useCallback(
    async (toCalendarId: string) => {
      if (selectedEvent == null) return;
      await moveEvent(selectedEvent.uid, selectedEvent.calendarId, toCalendarId);
      setMoveDialogOpen(false);
      await loadEventsForRange(range.start, range.end);
    },
    [loadEventsForRange, moveEvent, range.end, range.start, selectedEvent],
  );

  const handleExportEvent = useCallback(async () => {
    if (selectedEvent == null) return;
    const ics = await exportEventIcs(selectedEvent.calendarId, selectedEvent.uid);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedEvent.summary || "event"}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }, [exportEventIcs, selectedEvent]);

  return {
    saving,
    formOpen,
    editingEvent,
    draftStart,
    scopeDialogOpen,
    pendingScopeAction,
    moveDialogOpen,
    renameDialogOpen,
    renamingCalendarId,
    setMoveDialogOpen,
    setRenameDialogOpen,
    handleNewEvent,
    handleSelectTimeSlot,
    handleEditEvent,
    handleDeleteEvent,
    handleFormSubmit,
    handleFormOpenChange,
    handleRecurrenceScopeSelect,
    handleScopeDialogOpenChange: setScopeDialogOpen,
    handleCreateCalendar,
    handleRenameCalendar,
    handleOpenRenameCalendar,
    handleDeleteCalendar,
    handleImportIcs,
    handleMoveEvent,
    handleExportEvent,
  };
}
