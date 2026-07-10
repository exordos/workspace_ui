/**
 * iCalendar parse/serialize helpers for SOGo CalDAV integration.
 */

import ICAL from "ical.js";
import rruleModule from "rrule";
import { eventIntersectsRange, normalizeAllDayEndIso } from "./calendar-date.lib";
import type {
  CalendarAlarm,
  CalendarAttendee,
  CalendarEvent,
  CalendarEventInput,
  CalendarRecurrence,
} from "@mail/api/mail-api.generated";

function parseIcalDate(value: ICAL.Time): { iso: string; allDay: boolean } {
  const allDay = value.isDate;
  if (allDay) {
    const y = value.year;
    const m = String(value.month).padStart(2, "0");
    const d = String(value.day).padStart(2, "0");
    return { iso: `${y}-${m}-${d}`, allDay: true };
  }
  return { iso: value.toJSDate().toISOString(), allDay: false };
}

function toIcalTime(iso: string, allDay: boolean): ICAL.Time {
  if (allDay) {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return ICAL.Time.fromDateTimeString(
      `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`,
    );
  }
  return ICAL.Time.fromJSDate(new Date(iso), true);
}

function paramAsString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseAttendees(vevent: ICAL.Component): CalendarAttendee[] {
  const props = vevent.getAllProperties("attendee");
  return props.map((prop) => {
    const value = prop.getFirstValue();
    const email =
      typeof value === "string"
        ? value.replace(/^mailto:/i, "")
        : String(value ?? "").replace(/^mailto:/i, "");
    return {
      email,
      displayName: paramAsString(prop.getParameter("cn")),
      partstat: paramAsString(prop.getParameter("partstat")),
      role: paramAsString(prop.getParameter("role")),
    };
  });
}

function parseAlarms(vevent: ICAL.Component): CalendarAlarm[] {
  const alarms: CalendarAlarm[] = [];
  const valarms = vevent.getAllSubcomponents("valarm");
  for (const valarm of valarms) {
    const action = valarm.getFirstPropertyValue("action");
    const trigger = valarm.getFirstPropertyValue("trigger");
    let triggerMinutes: number | null = null;
    let triggerAbsolute: string | null = null;
    if (trigger instanceof ICAL.Duration) {
      triggerMinutes = Math.round(-trigger.toSeconds() / 60);
    } else if (trigger instanceof ICAL.Time) {
      triggerAbsolute = trigger.toJSDate().toISOString();
    }
    alarms.push({
      triggerMinutes,
      triggerAbsolute,
      action: typeof action === "string" ? action : "DISPLAY",
    });
  }
  return alarms;
}

function parseRecurrence(vevent: ICAL.Component): CalendarRecurrence | null {
  const rruleProp = vevent.getFirstProperty("rrule");
  if (rruleProp == null) return null;
  const value = rruleProp.getFirstValue();
  if (!(value instanceof ICAL.Recur)) return null;
  return { rrule: value.toString() };
}

export function parseVeventFromIcs(
  icsData: string,
  calendarId: string,
  etag: string | null,
): CalendarEvent[] {
  const jcal = ICAL.parse(icsData);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");
  const events: CalendarEvent[] = [];

  for (const vevent of vevents) {
    const uid = vevent.getFirstPropertyValue("uid");
    if (typeof uid !== "string") continue;

    const dtstart = vevent.getFirstPropertyValue("dtstart");
    const dtend = vevent.getFirstPropertyValue("dtend");
    if (!(dtstart instanceof ICAL.Time)) continue;

    const startParsed = parseIcalDate(dtstart);
    let endParsed = startParsed;
    if (dtend instanceof ICAL.Time) {
      endParsed = parseIcalDate(dtend);
    }
    if (startParsed.allDay) {
      endParsed = {
        iso: normalizeAllDayEndIso(startParsed.iso, endParsed.iso),
        allDay: true,
      };
    }

    const summaryRaw = vevent.getFirstPropertyValue("summary");
    const summaryText =
      typeof summaryRaw === "string" && summaryRaw.trim().length > 0
        ? summaryRaw.trim()
        : "(No title)";

    const recurrenceIdProp = vevent.getFirstPropertyValue("recurrence-id");
    const recurrenceId =
      recurrenceIdProp instanceof ICAL.Time ? recurrenceIdProp.toJSDate().toISOString() : null;

    events.push({
      uid,
      calendarId,
      summary: summaryText,
      description: (vevent.getFirstPropertyValue("description") as string | null) ?? null,
      location: (vevent.getFirstPropertyValue("location") as string | null) ?? null,
      start: startParsed.iso,
      end: endParsed.iso,
      allDay: startParsed.allDay,
      etag,
      recurrence: parseRecurrence(vevent),
      attendees: parseAttendees(vevent),
      alarms: parseAlarms(vevent),
      recurrenceId,
      isRecurringInstance: recurrenceId != null,
    });
  }

  return events;
}

export function expandRecurringEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  const expanded: CalendarEvent[] = [];

  for (const event of events) {
    if (event.recurrence?.rrule == null || event.isRecurringInstance) {
      expanded.push(event);
      continue;
    }

    try {
      const dtstart = event.allDay ? new Date(`${event.start}T00:00:00Z`) : new Date(event.start);
      const rule = rruleModule.RRule.fromString(event.recurrence.rrule.replace(/^RRULE:/i, ""));
      rule.options.dtstart = dtstart;
      const durationMs =
        (event.allDay
          ? new Date(
              `${normalizeAllDayEndIso(event.start, event.end).slice(0, 10)}T00:00:00Z`,
            ).getTime() - dtstart.getTime()
          : new Date(event.end).getTime() - dtstart.getTime()) || 3600000;

      const occurrences = rule.between(rangeStart, rangeEnd, true);
      if (occurrences.length === 0) {
        if (eventIntersectsRange(event, rangeStart, rangeEnd)) {
          expanded.push(event);
        }
        continue;
      }
      for (const occurrence of occurrences) {
        const occEnd = new Date(occurrence.getTime() + durationMs);
        const endIso = event.allDay
          ? normalizeAllDayEndIso(
              occurrence.toISOString().slice(0, 10),
              occEnd.toISOString().slice(0, 10),
            )
          : occEnd.toISOString();
        expanded.push({
          ...event,
          start: event.allDay ? occurrence.toISOString().slice(0, 10) : occurrence.toISOString(),
          end: endIso,
          isRecurringInstance: true,
          recurrenceId: occurrence.toISOString(),
          recurrence: null,
        });
      }
    } catch {
      expanded.push(event);
    }
  }

  return expanded;
}

function applyAttendees(vevent: ICAL.Component, attendees: CalendarAttendee[]): void {
  for (const attendee of attendees) {
    const prop = new ICAL.Property("attendee");
    prop.setParameter("cn", attendee.displayName ?? attendee.email);
    prop.setParameter("partstat", attendee.partstat ?? "NEEDS-ACTION");
    prop.setParameter("role", attendee.role ?? "REQ-PARTICIPANT");
    prop.setValue(`mailto:${attendee.email}`);
    vevent.addProperty(prop);
  }
}

function applyAlarms(vevent: ICAL.Component, alarms: CalendarAlarm[]): void {
  for (const alarm of alarms) {
    const valarm = new ICAL.Component("valarm");
    valarm.updatePropertyWithValue("action", alarm.action || "DISPLAY");
    if (alarm.triggerMinutes != null) {
      const duration = ICAL.Duration.fromSeconds(-alarm.triggerMinutes * 60);
      valarm.updatePropertyWithValue("trigger", duration);
    } else if (alarm.triggerAbsolute != null) {
      valarm.updatePropertyWithValue("trigger", toIcalTime(alarm.triggerAbsolute, false));
    }
    vevent.addSubcomponent(valarm);
  }
}

export function buildIcsFromInput(input: CalendarEventInput, uid: string): string {
  const comp = new ICAL.Component(["vcalendar", [], []]);
  comp.updatePropertyWithValue("prodid", "-//Workspace//Calendar//EN");
  comp.updatePropertyWithValue("version", "2.0");
  comp.updatePropertyWithValue("calscale", "GREGORIAN");

  const vevent = new ICAL.Component("vevent");
  vevent.updatePropertyWithValue("uid", uid);
  vevent.updatePropertyWithValue("summary", input.summary);
  vevent.updatePropertyWithValue("dtstamp", ICAL.Time.now());

  const allDay = input.allDay === true;
  vevent.updatePropertyWithValue("dtstart", toIcalTime(input.start, allDay));
  vevent.updatePropertyWithValue("dtend", toIcalTime(input.end, allDay));

  if (input.description != null && input.description.length > 0) {
    vevent.updatePropertyWithValue("description", input.description);
  }
  if (input.location != null && input.location.length > 0) {
    vevent.updatePropertyWithValue("location", input.location);
  }
  if (input.recurrence?.rrule != null && input.recurrence.rrule.length > 0) {
    const rruleStr = input.recurrence.rrule.replace(/^RRULE:/i, "");
    vevent.updatePropertyWithValue("rrule", ICAL.Recur.fromString(rruleStr));
  }

  applyAttendees(vevent, input.attendees ?? []);
  applyAlarms(vevent, input.alarms ?? []);

  comp.addSubcomponent(vevent);
  return comp.toString();
}

export function mergeEventInputWithExisting(
  existingIcs: string,
  input: CalendarEventInput,
  uid: string,
): string {
  const jcal = ICAL.parse(existingIcs);
  const comp = new ICAL.Component(jcal);
  const vevent = comp.getFirstSubcomponent("vevent");
  if (vevent == null) {
    return buildIcsFromInput(input, uid);
  }

  vevent.updatePropertyWithValue("summary", input.summary);
  const allDay = input.allDay === true;
  vevent.updatePropertyWithValue("dtstart", toIcalTime(input.start, allDay));
  vevent.updatePropertyWithValue("dtend", toIcalTime(input.end, allDay));

  if (input.description != null) {
    vevent.updatePropertyWithValue("description", input.description);
  } else {
    vevent.removeProperty("description");
  }
  if (input.location != null) {
    vevent.updatePropertyWithValue("location", input.location);
  } else {
    vevent.removeProperty("location");
  }

  vevent.removeProperty("rrule");
  if (input.recurrence?.rrule != null && input.recurrence.rrule.length > 0) {
    const rruleStr = input.recurrence.rrule.replace(/^RRULE:/i, "");
    vevent.updatePropertyWithValue("rrule", ICAL.Recur.fromString(rruleStr));
  }

  vevent.removeAllProperties("attendee");
  applyAttendees(vevent, input.attendees ?? []);

  const existingAlarms = vevent.getAllSubcomponents("valarm");
  for (const alarm of existingAlarms) {
    vevent.removeSubcomponent(alarm);
  }
  applyAlarms(vevent, input.alarms ?? []);

  return comp.toString();
}
