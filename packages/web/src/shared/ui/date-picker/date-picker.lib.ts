export function validDate(value: Date | null | undefined): Date | null {
  return value != null && Number.isFinite(value.getTime()) ? value : null;
}

export function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function dayKey(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

export function moveDay(value: Date, offset: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + offset);
  return result;
}

export function moveMonth(value: Date, offset: number): Date {
  const result = new Date(value);
  result.setDate(1);
  result.setMonth(result.getMonth() + offset);
  const lastDay = new Date(result);
  lastDay.setMonth(lastDay.getMonth() + 1, 0);
  result.setDate(Math.min(value.getDate(), lastDay.getDate()));
  return result;
}

export function monthKey(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}`;
}

export function calendarDays(month: Date): Date[] {
  const first = startOfDay(month);
  first.setDate(1);
  const offset = (first.getDay() + 6) % 7;
  const last = moveMonth(first, 1);
  last.setDate(0);
  const count = Math.max(35, Math.ceil((offset + last.getDate()) / 7) * 7);
  return Array.from({ length: count }, (_, index) => moveDay(first, index - offset));
}

/** Bounds compare local calendar days; the caller owns time-of-day constraints. */
export function dayValue(day: Date, min?: Date, max?: Date): Date | null {
  const result = startOfDay(day);
  const lower = validDate(min);
  const upper = validDate(max);
  if (lower != null && result < startOfDay(lower)) return null;
  if (upper != null && result > startOfDay(upper)) return null;
  return result;
}
