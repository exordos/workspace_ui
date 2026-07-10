/**
 * All-day and range helpers for calendar event display and RRULE expansion.
 */

export function addOneDayIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function normalizeAllDayEndIso(startIso: string, endIso: string): string {
  const startDate = startIso.slice(0, 10);
  const endDate = endIso.slice(0, 10);
  if (endDate <= startDate) {
    return addOneDayIsoDate(startDate);
  }
  return endDate;
}

export function eventIntersectsRange(
  event: { start: string; end: string; allDay: boolean },
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const eventStart = event.allDay
    ? new Date(`${event.start.slice(0, 10)}T00:00:00Z`)
    : new Date(event.start);
  let eventEndExclusive = event.allDay
    ? new Date(`${normalizeAllDayEndIso(event.start, event.end).slice(0, 10)}T00:00:00Z`)
    : new Date(event.end);
  if (event.allDay && eventEndExclusive.getTime() <= eventStart.getTime()) {
    eventEndExclusive = new Date(eventStart.getTime() + 24 * 60 * 60 * 1000);
  }
  return eventStart < rangeEnd && eventEndExclusive > rangeStart;
}
