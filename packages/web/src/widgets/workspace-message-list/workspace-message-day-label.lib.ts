import type { Locale } from "~/i18n/i18n";

interface FormatWorkspaceMessageDayLabelOptions {
  locale: Locale;
  now?: Date;
  t: (key: string) => string;
}

function padDatePart(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function parseLocalDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (match == null) {
    return null;
  }

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function formatWorkspaceMessageDayLabel(
  dateKey: string,
  { locale, now = new Date(), t }: FormatWorkspaceMessageDayLabelOptions,
): string {
  if (dateKey === formatLocalDateKey(now)) {
    return t("chat.today");
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateKey === formatLocalDateKey(yesterday)) {
    return t("chat.yesterday");
  }

  const date = parseLocalDateKey(dateKey);

  if (date == null) {
    return dateKey;
  }

  return date.toLocaleDateString(locale, { day: "numeric", month: "long" });
}
