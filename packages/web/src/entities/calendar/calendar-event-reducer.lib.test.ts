import { describe, expect, it } from "vitest";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import {
  reduceCalendarWorkspaceEvent,
  type CalendarEventState,
} from "./calendar-event-reducer.lib";

const provider = { uuid: "provider-1", name: "CalDAV", kind: "calendar" };
const delivery = {
  status: "pending",
  safe_error: null,
  updated_at: "2026-07-15T10:00:00Z",
};

const state: CalendarEventState = {
  calendars: [{ id: "calendar-1", displayName: "Work", color: null }],
  visibleCalendarIds: ["calendar-1"],
  events: [],
  selectedEventUid: null,
  selectedRecurrenceId: null,
  loadedRangeStart: "2026-07-01T00:00:00Z",
  loadedRangeEnd: "2026-07-31T23:59:59Z",
};

function calendarEvent(overrides: Record<string, unknown> = {}): WorkspaceEvent {
  return {
    schema_version: 1,
    uuid: "event-1",
    epoch_version: 1,
    project_id: "project-1",
    user_uuid: "user-1",
    object_type: "calendar_event",
    action: "created",
    created_at: "2026-07-15T10:00:00Z",
    updated_at: "2026-07-15T10:00:00Z",
    payload: {
      kind: "calendar.event.created",
      uuid: "resource-1",
      calendar_uuid: "calendar-1",
      uid: "event-1",
      summary: "Review",
      description: null,
      location: null,
      starts_at: "2026-07-15T10:00:00Z",
      ends_at: "2026-07-15T11:00:00Z",
      all_day: false,
      recurrence: null,
      attendees: [],
      alarms: [],
      recurrence_id: null,
      provider,
      delivery,
      ...overrides,
    },
  };
}

describe("reduceCalendarWorkspaceEvent", () => {
  it("applies a calendar snapshot without transport metadata", () => {
    const event = calendarEvent({
      kind: "calendar.calendar.updated",
      uuid: "calendar-1",
      name: "Renamed",
      color: "#336699",
    });
    event.object_type = "calendar";
    event.payload.kind = "calendar.calendar.updated";

    const result = reduceCalendarWorkspaceEvent(state, event);

    expect(result.complete).toBe(true);
    expect(result.patch.calendars).toEqual([
      expect.objectContaining({ id: "calendar-1", displayName: "Renamed", color: "#336699" }),
    ]);
  });

  it("applies a full event payload inside the loaded range", () => {
    const result = reduceCalendarWorkspaceEvent(state, calendarEvent());

    expect(result.complete).toBe(true);
    expect(result.patch.events).toEqual([
      expect.objectContaining({
        uid: "event-1",
        provider,
        delivery: {
          status: "pending",
          safeError: null,
          updatedAt: "2026-07-15T10:00:00Z",
        },
      }),
    ]);
  });

  it("removes an updated event that moved outside the loaded range", () => {
    const existing = reduceCalendarWorkspaceEvent(state, calendarEvent()).patch.events ?? [];
    const event = calendarEvent({
      kind: "calendar.event.updated",
      starts_at: "2026-08-15T10:00:00Z",
      ends_at: "2026-08-15T11:00:00Z",
    });
    event.payload.kind = "calendar.event.updated";
    const result = reduceCalendarWorkspaceEvent({ ...state, events: existing }, event);

    expect(result.complete).toBe(true);
    expect(result.patch.events).toEqual([]);
  });

  it("marks an event with incomplete provider metadata for refetch", () => {
    const result = reduceCalendarWorkspaceEvent(state, calendarEvent({ provider: undefined }));
    expect(result).toEqual({ complete: false, patch: {} });
  });

  it("rejects an event kind carried by the calendar collection object type", () => {
    const event = calendarEvent();
    event.object_type = "calendar";

    expect(reduceCalendarWorkspaceEvent(state, event)).toEqual({ complete: false, patch: {} });
  });
});
