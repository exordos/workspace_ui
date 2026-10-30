export function validDate(value: Date | null | undefined): Date | null {
  return value != null && Number.isFinite(value.getTime()) ? value : null;
}

export function timeBound(
  value: Date | undefined,
  direction: "min" | "max",
  showSeconds: boolean,
): Date | null {
  const date = validDate(value);
  if (date == null) return null;
  const round = direction === "min" ? Math.ceil : Math.floor;
  const precision = showSeconds ? 1000 : 60_000;
  return new Date(round(date.getTime() / precision) * precision);
}

export function localTime(value: Date, showSeconds: boolean): string {
  const parts = [value.getHours(), value.getMinutes()];
  if (showSeconds) parts.push(value.getSeconds());
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function mergeDateAndTime(day: Date, time: string): Date | null {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  const seconds = time.length === 8 ? Number(time.slice(6)) : 0;
  const result = new Date(day);
  result.setHours(hours, minutes, seconds, 0);
  // A local clock can skip times when daylight saving starts.
  return result.getHours() === hours && result.getMinutes() === minutes ? result : null;
}

export function dayValue(
  day: Date,
  time: Date | null,
  min: Date | null,
  max: Date | null,
  showSeconds: boolean,
): Date | null {
  const result = new Date(day);
  result.setHours(
    time?.getHours() ?? 0,
    time?.getMinutes() ?? 0,
    showSeconds ? (time?.getSeconds() ?? 0) : 0,
    0,
  );
  result.setTime(
    Math.min(max?.getTime() ?? Infinity, Math.max(min?.getTime() ?? -Infinity, result.getTime())),
  );
  return result.getFullYear() === day.getFullYear() &&
    result.getMonth() === day.getMonth() &&
    result.getDate() === day.getDate()
    ? result
    : null;
}
