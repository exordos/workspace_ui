import { useId, useRef, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import {
  calendarDays,
  dayKey,
  dayValue,
  monthKey,
  moveDay,
  moveMonth,
  startOfDay,
  validDate,
} from "./date-picker.lib";
import type { DatePickerProps } from "./date-picker.types";
import type { KeyboardEvent } from "react";

export function DatePicker({
  value,
  onValueChange,
  defaultMonth,
  min,
  max,
  disabled = false,
  className = "",
  ...ariaProps
}: Readonly<DatePickerProps>) {
  const { t, locale } = useTranslation();
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selection = validDate(value);
  const lower = validDate(min);
  const upper = validDate(max);
  const valueTime = selection?.getTime();
  const [navigation, setNavigation] = useState(() => {
    const initial = selection ?? validDate(defaultMonth) ?? new Date();
    return { date: startOfDay(initial), valueTime };
  });
  let cursor =
    navigation.valueTime === valueTime ? navigation.date : (selection ?? navigation.date);
  if (lower != null && startOfDay(cursor) < startOfDay(lower)) cursor = startOfDay(lower);
  if (upper != null && startOfDay(cursor) > startOfDay(upper)) cursor = startOfDay(upper);
  const setCursor = (date: Date) => setNavigation({ date, valueTime });
  const days = calendarDays(cursor);
  const available = (day: Date) => dayValue(day, min, max);
  const focusDay =
    days.find((day) => dayKey(day) === dayKey(cursor) && available(day) != null) ??
    days.find((day) => monthKey(day) === monthKey(cursor) && available(day) != null);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    cursor,
  );
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const todayDate = new Date();
  const todayKey = dayKey(todayDate);
  const todayAvailable = available(todayDate) != null;
  const canVisit = (month: Date) =>
    calendarDays(month).some((day) => monthKey(day) === monthKey(month) && available(day) != null);
  const navigate = (next: Date, focus: boolean) => {
    const allowed = available(next);
    if (allowed == null) return;
    setCursor(startOfDay(allowed));
    if (focus)
      requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(allowed)}"]`)
          ?.focus();
      });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: Date) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    let next: Date;
    const weekOffset = (day.getDay() + 6) % 7;
    switch (event.key) {
      case "ArrowLeft":
        next = moveDay(day, -1);
        break;
      case "ArrowRight":
        next = moveDay(day, 1);
        break;
      case "ArrowUp":
        next = moveDay(day, -7);
        break;
      case "ArrowDown":
        next = moveDay(day, 7);
        break;
      case "Home":
        next = moveDay(day, -weekOffset);
        break;
      case "End":
        next = moveDay(day, 6 - weekOffset);
        break;
      case "PageUp":
        next = moveMonth(day, event.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = moveMonth(day, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (lower != null && startOfDay(next) < startOfDay(lower)) next = startOfDay(lower);
    if (upper != null && startOfDay(next) > startOfDay(upper)) next = startOfDay(upper);
    navigate(next, true);
  };
  const visitMonth = (offset: number) => {
    const next = moveMonth(cursor, offset);
    const firstAvailable = calendarDays(next).find(
      (day) => monthKey(day) === monthKey(next) && available(day) != null,
    );
    if (firstAvailable != null) navigate(available(next) == null ? firstAvailable : next, false);
  };

  const renderMonthButton = (direction: 1 | -1) => (
    <button
      type="button"
      disabled={disabled || !canVisit(moveMonth(cursor, direction))}
      aria-label={t(direction === -1 ? "datePicker.previousMonth" : "datePicker.nextMonth")}
      data-icon-hover="custom"
      className={`row-start-1 flex size-7 shrink-0 items-center justify-center rounded-md text-text-primary hover:bg-card-bg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30 ${direction === -1 ? "col-start-1 justify-self-start" : "col-start-3 justify-self-end"}`}
      onClick={() => visitMonth(direction)}
    >
      <Icon name="calendar-next" size={20} className={direction === -1 ? "rotate-180" : ""} />
    </button>
  );

  return (
    <div
      {...ariaProps}
      ref={rootRef}
      role="group"
      aria-label={
        ariaProps["aria-label"] ??
        (ariaProps["aria-labelledby"] == null ? t("datePicker.label") : undefined)
      }
      aria-disabled={disabled || undefined}
      className={`@container w-[371px] max-w-full rounded-xl border border-border-subtle bg-bg-elevated p-5 text-text-primary ${className}`.trim()}
    >
      <div className="mb-3 grid grid-cols-[minmax(28px,1fr)_auto_minmax(28px,1fr)] items-center gap-x-1 gap-y-1">
        {renderMonthButton(-1)}
        <div
          id={headingId}
          aria-live="polite"
          className="col-start-2 row-start-1 min-w-0 truncate text-center text-base font-medium leading-9 first-letter:uppercase"
        >
          {monthTitle}
        </div>
        <Button
          type="button"
          size="sm"
          appearance="ghost"
          className="@[320px]:col-span-1 @[320px]:col-start-3 @[320px]:row-start-1 @[320px]:mr-8 col-span-3 row-start-2 !h-6 justify-self-end !px-1 !text-[10px]"
          disabled={disabled || !todayAvailable}
          onClick={() => {
            const next = available(new Date());
            if (next != null) {
              setCursor(next);
              onValueChange(next);
            }
          }}
        >
          {t("datePicker.today")}
        </Button>
        {renderMonthButton(1)}
      </div>
      <table
        role="grid"
        aria-labelledby={headingId}
        className="w-full table-fixed border-collapse text-center text-sm"
      >
        <thead>
          <tr className="border-b border-border-subtle">
            {Array.from({ length: 7 }, (_, index) => (
              <th
                key={index}
                scope="col"
                className={`h-[26px] p-0 font-normal ${index > 4 ? "text-text-muted" : "text-text-primary"}`}
              >
                <abbr
                  className="no-underline"
                  title={new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
                    new Date(2024, 0, index + 1),
                  )}
                >
                  {weekdayFormatter.format(new Date(2024, 0, index + 1))}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: days.length / 7 }, (_, week) => (
            <tr key={week}>
              {days.slice(week * 7, week * 7 + 7).map((day) => {
                const selected = selection != null && dayKey(day) === dayKey(selection);
                const today = dayKey(day) === todayKey;
                const outsideMonth = monthKey(day) !== monthKey(cursor);
                const unavailable = disabled || available(day) == null;
                return (
                  <td
                    key={dayKey(day)}
                    role="gridcell"
                    aria-selected={selected}
                    className="h-[26px] p-0"
                  >
                    <button
                      type="button"
                      data-day={dayKey(day)}
                      aria-label={dateFormatter.format(day)}
                      aria-current={today ? "date" : undefined}
                      disabled={unavailable}
                      tabIndex={focusDay != null && dayKey(day) === dayKey(focusDay) ? 0 : -1}
                      className={`inline-flex size-[25px] items-center justify-center rounded-full text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed ${selected ? "bg-accent text-on-accent" : "hover:bg-card-bg-active"} ${today ? "ring-1 ring-inset ring-accent" : ""} ${today && !selected ? "font-semibold text-accent" : ""} ${!selected && !today && (outsideMonth || day.getDay() === 0 || day.getDay() === 6 || unavailable) ? "text-text-muted" : ""} ${unavailable ? "opacity-40" : ""}`}
                      onKeyDown={(event) => handleKeyDown(event, day)}
                      onClick={() => {
                        const next = available(day);
                        if (next != null) {
                          setCursor(startOfDay(next));
                          onValueChange(next);
                        }
                      }}
                    >
                      {day.getDate()}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
