import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  CALENDAR_HOUR_HEIGHT_PX,
  dateFromGridOffsetPx,
  eventOccursOnDay,
  getNowIndicatorTopPx,
  layoutTimedEventsOnDay,
  sortEventsByStart,
  toIsoDate,
} from "~/entities/calendar/calendar.lib";
import type { CalendarEvent } from "~/entities/calendar/calendar.types";
import { t } from "~/i18n/i18n";
import { CalendarEventChip } from "./calendar-event-chip.ui";
import { CalendarNowIndicator } from "./calendar-now-indicator.ui";
import { useCalendarNow } from "./calendar-time-grid.hook";
import { CalendarTimedEventBlock } from "./calendar-timed-event-block.ui";
import type { CalendarTimeGridProps } from "./calendar-time-grid.types";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DEFAULT_SCROLL_HOUR = 7;

function timeGridColumns(dayCount: number): string {
  return `3rem repeat(${dayCount}, minmax(0, 1fr))`;
}

function formatDayHeader(day: Date, layout: CalendarTimeGridProps["layout"]): React.ReactNode {
  if (layout === "day") {
    return (
      <div className="text-sm font-medium text-text-primary">
        {day.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </div>
    );
  }
  return (
    <>
      <div className="text-xs text-text-muted">
        {day.toLocaleDateString(undefined, { weekday: "short" })}
      </div>
      <div className="text-sm font-medium text-text-primary">{day.getDate()}</div>
    </>
  );
}

export const CalendarTimeGrid: React.FC<CalendarTimeGridProps> = ({
  days,
  events,
  getEventColor,
  onSelectEvent,
  onSelectTimeSlot,
  layout = "week",
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useCalendarNow();
  const todayIso = toIsoDate(now);
  const nowTopPx = getNowIndicatorTopPx(now);
  const gridColumns = useMemo(() => timeGridColumns(days.length), [days.length]);
  const gridHeightPx = HOURS.length * CALENDAR_HOUR_HEIGHT_PX;
  const primaryIsoDate = days[0] != null ? toIsoDate(days[0]) : "";

  const eventsByDay = useMemo(() => {
    const map = new Map<
      string,
      { allDay: CalendarEvent[]; timed: ReturnType<typeof layoutTimedEventsOnDay> }
    >();
    for (const day of days) {
      const iso = toIsoDate(day);
      const dayEvents = sortEventsByStart(events.filter((e) => eventOccursOnDay(e, iso)));
      map.set(iso, {
        allDay: dayEvents.filter((e) => e.allDay),
        timed: layoutTimedEventsOnDay(dayEvents, iso),
      });
    }
    return map;
  }, [days, events]);

  const scrollHour = useMemo(() => {
    if (layout !== "day") return DEFAULT_SCROLL_HOUR;
    if (primaryIsoDate !== todayIso) return DEFAULT_SCROLL_HOUR;
    const hour = now.getHours();
    return Math.max(0, hour - 1);
  }, [layout, primaryIsoDate, todayIso, now]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el == null) return;
    el.scrollTop = scrollHour * CALENDAR_HOUR_HEIGHT_PX;
  }, [scrollHour, primaryIsoDate]);

  const showNowInGutter = days.some((day) => toIsoDate(day) === todayIso);

  const handleSelect = useCallback(
    (uid: string, recurrenceId?: string | null) => onSelectEvent(uid, recurrenceId),
    [onSelectEvent],
  );

  const handleDayColumnClick = useCallback(
    (day: Date) => (event: React.MouseEvent<HTMLButtonElement>) => {
      if (onSelectTimeSlot == null) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const offsetPx = event.clientY - rect.top;
      onSelectTimeSlot(day, dateFromGridOffsetPx(offsetPx, day));
    },
    [onSelectTimeSlot],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card-bg"
      data-testid="calendar-time-grid"
      data-layout={layout}
    >
      <div
        className="grid shrink-0 border-b border-border-subtle bg-bg"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <div className="border-r border-border-subtle" />
        {days.map((day) => (
          <div
            key={toIsoDate(day)}
            className={[
              "border-r border-border-subtle px-2 py-2 text-center",
              toIsoDate(day) === todayIso ? "bg-accent/5" : "",
            ].join(" ")}
          >
            <div
              className={
                toIsoDate(day) === todayIso && layout !== "day"
                  ? "mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-full bg-accent text-on-accent"
                  : ""
              }
            >
              {formatDayHeader(day, layout)}
            </div>
          </div>
        ))}
      </div>

      <div
        className="grid shrink-0 border-b border-border-subtle bg-bg"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <div className="border-r border-border-subtle px-2 py-1 text-xs text-text-muted">
          {t("calendar.allDay")}
        </div>
        {days.map((day) => {
          const iso = toIsoDate(day);
          const allDay = eventsByDay.get(iso)?.allDay ?? [];
          return (
            <div key={`allday-${iso}`} className="min-h-9 border-r border-border-subtle p-1">
              {allDay.map((event) => (
                <CalendarEventChip
                  key={`${event.uid}-${event.recurrenceId ?? ""}`}
                  event={event}
                  color={getEventColor(event)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: gridColumns, minHeight: gridHeightPx }}>
          <div className="relative border-r border-border-subtle">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b border-border-subtle pr-2 text-right text-xs text-text-muted"
                style={{ height: CALENDAR_HOUR_HEIGHT_PX }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
            {showNowInGutter ? <CalendarNowIndicator topPx={nowTopPx} showLeadingDot /> : null}
          </div>

          {days.map((day) => {
            const iso = toIsoDate(day);
            const timed = eventsByDay.get(iso)?.timed ?? [];
            const isToday = iso === todayIso;
            return (
              <div
                key={iso}
                data-testid={`calendar-day-column-${iso}`}
                role="gridcell"
                className={[
                  "relative min-w-0 border-r border-border-subtle",
                  isToday ? "bg-accent/[0.025]" : "",
                ].join(" ")}
                style={{ height: gridHeightPx }}
              >
                {onSelectTimeSlot != null ? (
                  <button
                    type="button"
                    data-testid={`calendar-day-slot-${iso}`}
                    aria-label={day.toLocaleDateString()}
                    className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    onClick={handleDayColumnClick(day)}
                  />
                ) : null}
                {HOURS.map((hour) => (
                  <React.Fragment key={hour}>
                    <div
                      className="pointer-events-none absolute left-0 right-0 border-b border-border-subtle"
                      style={{
                        top: hour * CALENDAR_HOUR_HEIGHT_PX,
                        height: CALENDAR_HOUR_HEIGHT_PX,
                      }}
                    />
                    <div
                      className="border-border-subtle/40 pointer-events-none absolute left-0 right-0 border-b"
                      style={{ top: (hour + 0.5) * CALENDAR_HOUR_HEIGHT_PX }}
                    />
                  </React.Fragment>
                ))}
                {isToday ? <CalendarNowIndicator topPx={nowTopPx} /> : null}
                {timed.map(({ event, topPx, heightPx, leftPercent, widthPercent }) => (
                  <CalendarTimedEventBlock
                    key={`${event.uid}-${event.recurrenceId ?? ""}`}
                    event={event}
                    color={getEventColor(event)}
                    topPx={topPx}
                    heightPx={heightPx}
                    leftPercent={leftPercent}
                    widthPercent={widthPercent}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
