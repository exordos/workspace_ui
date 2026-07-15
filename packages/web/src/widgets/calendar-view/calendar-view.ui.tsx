import React, { useCallback, useState } from "react";
import { CalendarEventFormDialog } from "~/features/calendar-event-form/calendar-event-form.ui";
import { CalendarMoveEventDialog } from "~/features/calendar-move-event/calendar-move-event-dialog.ui";
import { CalendarRecurrenceScopeDialog } from "~/features/calendar-recurrence-scope/calendar-recurrence-scope-dialog.ui";
import { CalendarRenameDialog } from "~/features/calendar-rename/calendar-rename-dialog.ui";
import { t } from "~/i18n/i18n";
import { CalendarDayGrid } from "./calendar-day-grid.ui";
import { CalendarEventDetail } from "./calendar-event-detail.ui";
import { CalendarMonthGrid } from "./calendar-month-grid.ui";
import { CalendarSidebarPanel } from "./calendar-sidebar.ui";
import { CalendarToolbar } from "./calendar-toolbar.ui";
import { useCalendarView } from "./calendar-view.hook";
import { CalendarWeekGrid } from "./calendar-week-grid.ui";

export const CalendarView: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    error,
    calendars,
    visibleCalendarIds,
    events,
    focusDate,
    viewMode,
    monthCells,
    weekDays,
    eventsByDay,
    selectedEvent,
    selectedCalendarName,
    selectedCalendarColor,
    selectedIsoDate,
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
    moveDialogOpen,
    renameDialogOpen,
    renamingCalendarId,
    setSearchQuery,
    setViewMode,
    toggleCalendarVisibility,
    selectEvent,
    getEventColor,
    getCalendarColor,
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
    handleScopeDialogOpenChange,
    handleCreateCalendar,
    handleRenameCalendar,
    handleOpenRenameCalendar,
    handleDeleteCalendar,
    handleImportIcs,
    handleMoveEvent,
    handleExportEvent,
    setMoveDialogOpen,
    setRenameDialogOpen,
  } = useCalendarView();

  const handleImportFile = useCallback(
    async (file: File) => {
      const calendarId = visibleCalendarIds[0];
      if (calendarId == null) return;
      const ics = await file.text();
      await handleImportIcs(calendarId, ics);
    },
    [handleImportIcs, visibleCalendarIds],
  );

  const handleOpenMoveDialog = useCallback(() => {
    setMoveDialogOpen(true);
  }, [setMoveDialogOpen]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleExportSelected = useCallback(() => {
    void handleExportEvent();
  }, [handleExportEvent]);

  const handleCloseDetail = useCallback(() => {
    selectEvent(null);
  }, [selectEvent]);

  const renamingCalendar = calendars.find((calendar) => calendar.id === renamingCalendarId) ?? null;

  const handleRenameSubmit = useCallback(
    async (displayName: string, color: string | null) => {
      if (renamingCalendarId == null) return;
      await handleRenameCalendar(renamingCalendarId, displayName, color);
    },
    [handleRenameCalendar, renamingCalendarId],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
      <CalendarToolbar
        viewMode={viewMode}
        title={toolbarTitle}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onImportIcs={handleImportFile}
        onViewModeChange={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onToggleSidebar={handleToggleSidebar}
        onNewEvent={handleNewEvent}
      />
      {error != null && error.length > 0 ? (
        <p className="mb-2 text-sm text-notice-base" role="alert">
          {error}
        </p>
      ) : null}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-bg">
        {sidebarOpen ? (
          <button
            type="button"
            className="bg-bg/70 absolute inset-0 z-dropdown backdrop-blur-sm md:hidden"
            onClick={handleCloseSidebar}
            aria-label={t("common.close")}
          />
        ) : null}
        <CalendarSidebarPanel
          open={sidebarOpen}
          calendars={calendars}
          visibleCalendarIds={visibleCalendarIds}
          focusDate={focusDate}
          loadingCalendars={loadingCalendars}
          onToggleCalendar={toggleCalendarVisibility}
          onSelectDate={handleSelectDay}
          onCreateCalendar={handleCreateCalendar}
          onDeleteCalendar={handleDeleteCalendar}
          onRenameCalendar={handleOpenRenameCalendar}
          getCalendarColor={getCalendarColor}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {loadingEvents ? (
            <p className="text-sm text-text-muted">{t("calendar.loading")}</p>
          ) : null}
          {viewMode === "month" ? (
            <CalendarMonthGrid
              cells={monthCells}
              eventsByDay={eventsByDay}
              selectedIsoDate={selectedIsoDate}
              getEventColor={getEventColor}
              onSelectDay={handleSelectDay}
              onSelectEvent={selectEvent}
            />
          ) : null}
          {viewMode === "week" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <CalendarWeekGrid
                days={weekDays}
                events={events}
                getEventColor={getEventColor}
                onSelectEvent={selectEvent}
                onSelectTimeSlot={handleSelectTimeSlot}
              />
            </div>
          ) : null}
          {viewMode === "day" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <CalendarDayGrid
                date={focusDate}
                events={events}
                getEventColor={getEventColor}
                onSelectEvent={selectEvent}
                onSelectTimeSlot={handleSelectTimeSlot}
              />
            </div>
          ) : null}
        </main>
        <CalendarEventDetail
          event={selectedEvent}
          calendarName={selectedCalendarName}
          calendarColor={selectedCalendarColor}
          saving={saving}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          onMove={handleOpenMoveDialog}
          onExport={handleExportSelected}
          onClose={handleCloseDetail}
        />
      </div>
      <CalendarEventFormDialog
        open={formOpen}
        calendars={calendars}
        initialEvent={editingEvent}
        focusDate={focusDate}
        draftStart={draftStart}
        saving={saving}
        onOpenChange={handleFormOpenChange}
        onSubmit={handleFormSubmit}
      />
      {pendingScopeAction != null ? (
        <CalendarRecurrenceScopeDialog
          open={scopeDialogOpen}
          action={pendingScopeAction}
          onOpenChange={handleScopeDialogOpenChange}
          onSelect={handleRecurrenceScopeSelect}
        />
      ) : null}
      <CalendarMoveEventDialog
        open={moveDialogOpen}
        calendars={calendars}
        currentCalendarId={selectedEvent?.calendarId ?? null}
        saving={saving}
        onOpenChange={setMoveDialogOpen}
        onMove={handleMoveEvent}
      />
      <CalendarRenameDialog
        open={renameDialogOpen}
        calendar={renamingCalendar}
        saving={saving}
        onOpenChange={setRenameDialogOpen}
        onSubmit={handleRenameSubmit}
      />
    </div>
  );
};
