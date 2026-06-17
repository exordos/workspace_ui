import React from "react";
import { CalendarTimeGrid } from "./calendar-time-grid.ui";
import type { CalendarWeekGridProps } from "./calendar-week-grid.types";

export const CalendarWeekGrid: React.FC<CalendarWeekGridProps> = (props) => (
  <CalendarTimeGrid {...props} />
);
