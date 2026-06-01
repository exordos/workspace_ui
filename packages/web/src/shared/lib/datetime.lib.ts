/**
 * Date/time formatting for UI labels (messages, feed, profiles).
 *
 * Use explicit function names — semantics differ:
 * - `formatMessageTimeShort` — HH:MM only (bubbles, same-day lists)
 * - `formatMessageTimeRelative` — today time / yesterday / short date (sidebar)
 * - `formatMessageTimeWithDate` — today HH:MM, else locale date + HH:MM (feed, activity)
 * - `formatDateJoined` — profile "joined" dates
 */
import { t, getLocale } from "~/i18n/i18n";

function localeTag(): string {
  return getLocale() === "ru" ? "ru-RU" : "en-US";
}

/** Local wall-clock HH:MM (24h). Avoids Intl — used on every message bubble. */
function formatLocalHoursMinutes(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${hours < 10 ? "0" : ""}${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
}

/** Unix seconds → HH:MM (24h, local timezone). */
export function formatMessageTimeShort(timestamp: number): string {
  return formatLocalHoursMinutes(new Date(timestamp * 1000));
}

/** Sidebar / chat-list: today → time; yesterday label; else short date. */
export function formatMessageTimeRelative(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const locale = localeTag();
  if (sameDay) {
    return formatLocalHoursMinutes(d);
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth()) {
    return t("chat.yesterday");
  }
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** Feed/inbox rows: same day → short time; otherwise date + short time. */
export function formatMessageTimeWithDate(ts: number): string {
  const date = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) return formatMessageTimeShort(ts);
  const datePart = date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${datePart} ${formatMessageTimeShort(ts)}`;
}

/** Activity/starred rows: today → time; yesterday → label + time; else short date. */
export function formatActivityItemTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) return formatMessageTimeShort(ts);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth()) {
    return `${t("chat.yesterday")} ${formatMessageTimeShort(ts)}`;
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** ISO or parseable date string → localized join date; returns input if unparseable. */
export function formatDateJoined(dateJoined: string | undefined): string | undefined {
  if (!dateJoined) return undefined;
  const trimmed = dateJoined.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}
