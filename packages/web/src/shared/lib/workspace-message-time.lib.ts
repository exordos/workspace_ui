import { getLocale } from "~/i18n/i18n";

/** Only ISO calendar dates with an explicit zone represent a shared instant. */
export function parseWorkspaceMessageTime(value: string): string | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  const zone = match[8] ?? "";
  if (
    year < 1 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6] ?? 0) > 59 ||
    (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace(/\.000Z$/, "Z") : null;
}

export function formatWorkspaceMessageTime(date: Date): string {
  return `<urn:time:${date.toISOString().replace(/\.000Z$/, "Z")}>`;
}

export function formatLocalMessageTime(utc: string): string {
  const date = new Date(utc);
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(date.getSeconds() === 0 ? {} : { second: "2-digit" }),
  }).format(date);
}

export function formatMessageTimeZone(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  const name =
    new Intl.DateTimeFormat(getLocale(), { timeZoneName: "long" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  return `${name} (UTC${offset < 0 ? "-" : "+"}${hours}:${minutes})`.trim();
}
