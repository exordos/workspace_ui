import React from "react";
import { CalendarEventFormDialog } from "~/features/calendar-event-form/calendar-event-form.ui";
import { MailSignInDialog } from "~/features/mail-sign-in/mail-sign-in.ui";
import { t } from "~/i18n/i18n";
import { CalendarDayGrid } from "./calendar-day-grid.ui";
import { CalendarEventDetail } from "./calendar-event-detail.ui";
import { CalendarMonthGrid } from "./calendar-month-grid.ui";
import { CalendarSidebar } from "./calendar-sidebar.ui";
import { CalendarToolbar } from "./calendar-toolbar.ui";
import { useCalendarView } from "./calendar-view.hook";
import { CalendarWeekGrid } from "./calendar-week-grid.ui";

export const CalendarView: React.FC = () => {
  const {
    session,
    signingIn,
    error,
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
    handleSignOut,
    handlePrev,
    handleNext,
    handleToday,
    handleSelectDay,
    handleNewEvent,
    handleEditEvent,
    handleDeleteEvent,
    handleFormSubmit,
    handleFormOpenChange,
  } = useCalendarView();

  if (!session) {
    return (
      <MailSignInDialog
        open
        email={email}
        signingIn={signingIn}
        error={error}
        onEmailChange={setEmail}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col p-3">
      <CalendarToolbar
        viewMode={viewMode}
        title={toolbarTitle}
        onViewModeChange={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onNewEvent={handleNewEvent}
        onSignOut={handleSignOut}
      />
      <div className="flex min-h-0 flex-1 gap-3">
        <CalendarSidebar
          calendars={calendars}
          visibleCalendarIds={visibleCalendarIds}
          focusDate={focusDate}
          onToggleCalendar={toggleCalendarVisibility}
          onSelectDate={handleSelectDay}
          getCalendarColor={getCalendarColor}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
              />
            </div>
          ) : null}
        </div>
        <CalendarEventDetail
          event={selectedEvent}
          saving={saving}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          onClose={() => selectEvent(null)}
        />
      </div>
      <CalendarEventFormDialog
        open={formOpen}
        calendars={calendars}
        initialEvent={editingEvent}
        focusDate={focusDate}
        saving={saving}
        onOpenChange={handleFormOpenChange}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
};
