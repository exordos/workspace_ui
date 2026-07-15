import { parseProviderDeliveryMeta } from "~/shared/lib/provider-delivery.lib";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import { expandRecurringEvents } from "./calendar-ical.lib";
import {
  mapWorkspaceCalendar,
  mapWorkspaceCalendarEvent,
  type WorkspaceCalendar,
  type WorkspaceCalendarEvent,
} from "./calendar.api";
import type { CalendarEvent, CalendarInfo } from "./calendar.types";

export interface CalendarEventState {
  calendars: CalendarInfo[];
  visibleCalendarIds: string[];
  events: CalendarEvent[];
  selectedEventUid: string | null;
  selectedRecurrenceId: string | null;
  loadedRangeStart: string | null;
  loadedRangeEnd: string | null;
}

export interface CalendarEventReduction {
  complete: boolean;
  patch: Partial<CalendarEventState>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isAttendeeArray(value: unknown): boolean {
  return (
    Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.email === "string")
  );
}

function isAlarmArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function isFullCalendar(
  value: Record<string, unknown>,
): value is Record<string, unknown> & WorkspaceCalendar {
  return (
    typeof value.uuid === "string" &&
    typeof value.name === "string" &&
    isNullableString(value.color) &&
    parseProviderDeliveryMeta(value) !== undefined
  );
}

function isFullEvent(
  value: Record<string, unknown>,
): value is Record<string, unknown> & WorkspaceCalendarEvent {
  return (
    typeof value.uuid === "string" &&
    typeof value.calendar_uuid === "string" &&
    typeof value.uid === "string" &&
    typeof value.summary === "string" &&
    isNullableString(value.description) &&
    isNullableString(value.location) &&
    typeof value.starts_at === "string" &&
    typeof value.ends_at === "string" &&
    typeof value.all_day === "boolean" &&
    (value.recurrence === null || isRecord(value.recurrence)) &&
    isAttendeeArray(value.attendees) &&
    isAlarmArray(value.alarms) &&
    isNullableString(value.recurrence_id) &&
    parseProviderDeliveryMeta(value) !== undefined
  );
}

function upsertCalendar(calendars: CalendarInfo[], calendar: CalendarInfo): CalendarInfo[] {
  const index = calendars.findIndex((item) => item.id === calendar.id);
  if (index < 0) return [...calendars, calendar];
  return calendars.map((item, itemIndex) => (itemIndex === index ? calendar : item));
}

function eventOverlapsRange(event: CalendarEvent, start: string, end: string): boolean {
  return (
    new Date(event.end).getTime() >= new Date(start).getTime() &&
    new Date(event.start).getTime() <= new Date(end).getTime()
  );
}

function replaceEventInstances(state: CalendarEventState, event: CalendarEvent): CalendarEvent[] {
  const remaining = state.events.filter((item) => item.uid !== event.uid);
  if (
    state.loadedRangeStart == null ||
    state.loadedRangeEnd == null ||
    !state.visibleCalendarIds.includes(event.calendarId)
  ) {
    return remaining;
  }
  const instances =
    event.recurrence?.rrule == null
      ? eventOverlapsRange(event, state.loadedRangeStart, state.loadedRangeEnd)
        ? [event]
        : []
      : expandRecurringEvents(
          [event],
          new Date(state.loadedRangeStart),
          new Date(state.loadedRangeEnd),
        );
  return [...remaining, ...instances];
}

function objectTypeMatchesCalendarKind(event: WorkspaceEvent): boolean {
  if (event.payload.kind.startsWith("calendar.calendar.")) {
    return event.object_type === "calendar";
  }
  if (event.payload.kind.startsWith("calendar.event.")) {
    return event.object_type === "calendar_event";
  }
  return false;
}

export function reduceCalendarWorkspaceEvent(
  state: CalendarEventState,
  event: WorkspaceEvent,
): CalendarEventReduction {
  if (!isRecord(event.payload) || !objectTypeMatchesCalendarKind(event)) {
    return { complete: false, patch: {} };
  }
  const resource = event.payload;

  switch (event.payload.kind) {
    case "calendar.calendar.created":
    case "calendar.calendar.updated": {
      if (!isFullCalendar(resource)) return { complete: false, patch: {} };
      const calendar = mapWorkspaceCalendar(resource);
      return {
        complete: true,
        patch: {
          calendars: upsertCalendar(state.calendars, calendar),
          ...(event.payload.kind === "calendar.calendar.created" &&
          !state.visibleCalendarIds.includes(calendar.id)
            ? { visibleCalendarIds: [...state.visibleCalendarIds, calendar.id] }
            : {}),
        },
      };
    }
    case "calendar.calendar.deleted": {
      if (typeof resource.uuid !== "string") return { complete: false, patch: {} };
      const deletedEventSelected = state.events.some(
        (item) => item.calendarId === resource.uuid && item.uid === state.selectedEventUid,
      );
      return {
        complete: true,
        patch: {
          calendars: state.calendars.filter((calendar) => calendar.id !== resource.uuid),
          visibleCalendarIds: state.visibleCalendarIds.filter((id) => id !== resource.uuid),
          events: state.events.filter((item) => item.calendarId !== resource.uuid),
          ...(deletedEventSelected ? { selectedEventUid: null, selectedRecurrenceId: null } : {}),
        },
      };
    }
    case "calendar.event.created":
    case "calendar.event.updated": {
      if (!isFullEvent(resource)) return { complete: false, patch: {} };
      const calendarEvent = mapWorkspaceCalendarEvent(resource);
      return {
        complete: true,
        patch: { events: replaceEventInstances(state, calendarEvent) },
      };
    }
    case "calendar.event.deleted": {
      if (typeof resource.uuid !== "string") return { complete: false, patch: {} };
      const deletedUid = state.events.find((item) => item.resourceId === resource.uuid)?.uid;
      if (deletedUid == null) {
        // The canonical delete event identifies the resource UUID. Loaded events use their UID,
        // so an unknown resource needs a range refresh to resolve that relationship safely.
        return { complete: false, patch: {} };
      }
      return {
        complete: true,
        patch: {
          events: state.events.filter((item) => item.uid !== deletedUid),
          ...(state.selectedEventUid === deletedUid
            ? { selectedEventUid: null, selectedRecurrenceId: null }
            : {}),
        },
      };
    }
    default:
      return { complete: false, patch: {} };
  }
}
