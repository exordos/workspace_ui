import { useTranslation } from "~/i18n/i18n";
import { DatePicker } from "~/shared/ui/date-picker";
import { TimePicker } from "~/shared/ui/time-picker";
import {
  dayValue,
  localTime,
  mergeDateAndTime,
  timeBound,
  validDate,
} from "./date-time-picker.lib";
import type { DateTimePickerProps } from "./date-time-picker.types";

export function DateTimePicker({
  value,
  onValueChange,
  defaultMonth,
  min,
  max,
  disabled = false,
  showSeconds = false,
  showArrows = true,
  datePickerProps,
  timePickerProps,
  className = "",
  ...ariaProps
}: Readonly<DateTimePickerProps>) {
  const { t } = useTranslation();
  const selected = validDate(value);
  const lower = timeBound(min, "min", showSeconds);
  const upper = timeBound(max, "max", showSeconds);
  const unavailable = disabled || (lower != null && upper != null && lower > upper);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  return (
    <div
      {...ariaProps}
      role="group"
      aria-label={
        ariaProps["aria-label"] ??
        (ariaProps["aria-labelledby"] == null ? t("dateTimePicker.label") : undefined)
      }
      aria-disabled={unavailable || undefined}
      className={`flex w-[371px] max-w-full flex-col ${className}`.trim()}
    >
      <DatePicker
        {...datePickerProps}
        className={`!w-full !rounded-b-none ${datePickerProps?.className ?? ""}`.trim()}
        value={selected}
        defaultMonth={defaultMonth}
        min={lower ?? undefined}
        max={upper ?? undefined}
        disabled={unavailable}
        onValueChange={(day) => {
          const next = dayValue(day, selected, lower, upper, showSeconds);
          if (next != null) onValueChange(next);
        }}
      />
      <TimePicker
        {...timePickerProps}
        className={`-mt-px !w-full !rounded-t-none ${timePickerProps?.className ?? ""}`.trim()}
        value={selected == null ? null : localTime(selected, showSeconds)}
        showSeconds={showSeconds}
        showArrows={showArrows}
        min={
          selected != null && lower != null && sameDay(selected, lower)
            ? localTime(lower, showSeconds)
            : undefined
        }
        max={
          selected != null && upper != null && sameDay(selected, upper)
            ? localTime(upper, showSeconds)
            : undefined
        }
        disabled={unavailable || selected == null}
        isTimeDisabled={(time) => selected == null || mergeDateAndTime(selected, time) == null}
        onValueChange={(time) => {
          if (selected == null) return;
          const next = mergeDateAndTime(selected, time);
          if (next != null && (lower == null || next >= lower) && (upper == null || next <= upper))
            onValueChange(next);
        }}
      />
    </div>
  );
}
