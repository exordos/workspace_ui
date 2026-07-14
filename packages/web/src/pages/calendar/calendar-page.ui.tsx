import React from "react";
import { CalendarView } from "~/widgets/calendar-view/calendar-view.ui";
import { useCalendarPageBootstrap } from "./calendar-page.hook";

export const CalendarPage: React.FC = () => {
  useCalendarPageBootstrap();

  return <CalendarView />;
};
