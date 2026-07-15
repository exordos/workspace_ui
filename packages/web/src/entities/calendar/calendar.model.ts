/**
 * Calendar store — calendars, events, view state, and CRUD lifecycle.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import { reduceCalendarWorkspaceEvent } from "./calendar-event-reducer.lib";
import { getMailboxSessionToken } from "./calendar-session.lib";
import {
  createCalendarCollection,
  createCalendarEvent,
  deleteCalendarCollection,
  deleteCalendarEvent,
  exportCalendarEventIcs,
  fetchCalendarEvent,
  fetchCalendars,
  fetchCalendarEvents,
  fetchCalendarFreeBusy,
  importCalendarEventIcs,
  moveCalendarEventToCalendar,
  searchCalendarEvents,
  updateCalendarCollection,
  updateCalendarEvent,
} from "./calendar.api";
import { invalidateCalendarSessionIfUnauthorized } from "./calendar.model.lib";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarInfo,
  CalendarViewMode,
} from "./calendar.types";

interface CalendarState {
  calendars: CalendarInfo[];
  visibleCalendarIds: string[];
  events: CalendarEvent[];
  selectedEventUid: string | null;
  selectedRecurrenceId: string | null;
  focusDate: Date;
  viewMode: CalendarViewMode;
  loadingCalendars: boolean;
  loadingEvents: boolean;
  saving: boolean;
  error: string | null;
  loadedRangeStart: string | null;
  loadedRangeEnd: string | null;

  applyWorkspaceEvent: (event: WorkspaceEvent) => boolean;
  setFocusDate: (date: Date) => void;
  setViewMode: (mode: CalendarViewMode) => void;
  toggleCalendarVisibility: (calendarId: string) => void;
  selectEvent: (uid: string | null, recurrenceId?: string | null) => void;
  createCalendar: (displayName: string, color?: string | null) => Promise<CalendarInfo>;
  updateCalendar: (
    calendarId: string,
    displayName?: string,
    color?: string | null,
  ) => Promise<CalendarInfo>;
  deleteCalendar: (calendarId: string) => Promise<void>;
  loadCalendars: () => Promise<void>;
  loadEventsForRange: (start: string, end: string) => Promise<void>;
  createEvent: (input: CalendarEventInput) => Promise<CalendarEvent>;
  updateEvent: (
    eventUid: string,
    input: CalendarEventInput & {
      scope?: "this" | "thisAndFuture" | "all";
      recurrenceId?: string | null;
    },
  ) => Promise<CalendarEvent>;
  moveEvent: (
    eventUid: string,
    fromCalendarId: string,
    toCalendarId: string,
  ) => Promise<CalendarEvent>;
  exportEventIcs: (calendarId: string, eventUid: string) => Promise<string>;
  loadEventForEdit: (calendarId: string, eventUid: string) => Promise<CalendarEvent | null>;
  deleteEvent: (
    calendarId: string,
    eventUid: string,
    options?: { recurrenceId?: string | null; scope?: "this" | "thisAndFuture" | "all" },
  ) => Promise<void>;
  searchEvents: (query: string, start: string, end: string) => Promise<void>;
  importEventIcs: (calendarId: string, ics: string) => Promise<void>;
  checkAttendeeBusy: (email: string, start: string, end: string) => Promise<boolean>;
  clear: () => void;
}

const EMPTY_CALENDARS: CalendarInfo[] = [];
const EMPTY_EVENTS: CalendarEvent[] = [];

export const useCalendarStore = create<CalendarState>((set, get) => {
  function requireToken(): string {
    const token = getMailboxSessionToken();
    if (token == null) {
      throw new Error("Unauthorized");
    }
    return token;
  }

  function invalidateIfUnauthorized(error: unknown): boolean {
    return invalidateCalendarSessionIfUnauthorized(error, {
      emptyCalendars: EMPTY_CALENDARS,
      set,
    });
  }

  return {
    calendars: EMPTY_CALENDARS,
    visibleCalendarIds: [],
    events: EMPTY_EVENTS,
    selectedEventUid: null,
    selectedRecurrenceId: null,
    focusDate: new Date(),
    viewMode: "month",
    loadingCalendars: false,
    loadingEvents: false,
    saving: false,
    error: null,
    loadedRangeStart: null,
    loadedRangeEnd: null,

    applyWorkspaceEvent: (event) => {
      let complete = false;
      set((state) => {
        const result = reduceCalendarWorkspaceEvent(state, event);
        complete = result.complete;
        return result.patch;
      });
      if (complete) {
        logStoreAction("calendar", "applyWorkspaceEvent", { kind: event.payload.kind });
      }
      return complete;
    },

    setFocusDate: (date) => {
      logStoreAction("calendar", "setFocusDate", { iso: date.toISOString() });
      set({ focusDate: date });
    },

    setViewMode: (mode) => {
      logStoreAction("calendar", "setViewMode", { mode });
      set({ viewMode: mode });
    },

    toggleCalendarVisibility: (calendarId) => {
      set((state) => {
        const visible = state.visibleCalendarIds.includes(calendarId)
          ? state.visibleCalendarIds.filter((id) => id !== calendarId)
          : [...state.visibleCalendarIds, calendarId];
        logStoreAction("calendar", "toggleCalendarVisibility", {
          calendarId,
          visible: visible.length,
        });
        return { visibleCalendarIds: visible };
      });
    },

    selectEvent: (uid, recurrenceId = null) => {
      logStoreAction("calendar", "selectEvent", { uid, recurrenceId });
      set({ selectedEventUid: uid, selectedRecurrenceId: recurrenceId });
    },

    loadCalendars: async () => {
      set({ loadingCalendars: true, error: null });
      try {
        const token = requireToken();
        const calendars = await fetchCalendars(token);
        const visibleCalendarIds =
          get().visibleCalendarIds.length > 0
            ? get().visibleCalendarIds.filter((id) => calendars.some((c) => c.id === id))
            : calendars.map((c) => c.id);
        logStoreAction("calendar", "loadCalendars", { count: calendars.length });
        set({ calendars, visibleCalendarIds, loadingCalendars: false });
      } catch (error) {
        if (invalidateIfUnauthorized(error)) return;
        set({
          loadingCalendars: false,
          error: error instanceof Error ? error.message : "Failed to load calendars",
        });
      }
    },

    loadEventsForRange: async (start, end) => {
      set({ loadedRangeStart: start, loadedRangeEnd: end });
      const { visibleCalendarIds } = get();
      if (visibleCalendarIds.length === 0) {
        set({ events: EMPTY_EVENTS });
        return;
      }
      set({ loadingEvents: true, error: null });
      try {
        const token = requireToken();
        const events = await fetchCalendarEvents(token, visibleCalendarIds, start, end);
        logStoreAction("calendar", "loadEventsForRange", { count: events.length, start, end });
        set({ events, loadingEvents: false });
      } catch (error) {
        if (invalidateIfUnauthorized(error)) return;
        set({
          loadingEvents: false,
          error: error instanceof Error ? error.message : "Failed to load events",
        });
      }
    },

    async createCalendar(displayName, color) {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        const calendar = await createCalendarCollection(token, displayName, color);
        logStoreAction("calendar", "createCalendar", { id: calendar.id });
        set((state) => ({
          calendars: [...state.calendars, calendar],
          visibleCalendarIds: [...state.visibleCalendarIds, calendar.id],
          saving: false,
        }));
        return calendar;
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to create calendar",
        });
        throw error;
      }
    },

    async updateCalendar(calendarId, displayName, color) {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        const calendar = await updateCalendarCollection(token, calendarId, displayName, color);
        logStoreAction("calendar", "updateCalendar", { id: calendar.id });
        set((state) => ({
          calendars: state.calendars.map((item) => (item.id === calendarId ? calendar : item)),
          saving: false,
        }));
        return calendar;
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to update calendar",
        });
        throw error;
      }
    },

    async deleteCalendar(calendarId) {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        await deleteCalendarCollection(token, calendarId);
        logStoreAction("calendar", "deleteCalendar", { id: calendarId });
        set((state) => ({
          calendars: state.calendars.filter((item) => item.id !== calendarId),
          visibleCalendarIds: state.visibleCalendarIds.filter((id) => id !== calendarId),
          saving: false,
        }));
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to delete calendar",
        });
        throw error;
      }
    },

    createEvent: async (input) => {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        const event = await createCalendarEvent(token, input);
        logStoreAction("calendar", "createEvent", { uid: event.uid });
        set((state) => ({ events: [...state.events, event], saving: false }));
        return event;
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to create event",
        });
        throw error;
      }
    },

    updateEvent: async (eventUid, input) => {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        const event = await updateCalendarEvent(token, eventUid, input);
        logStoreAction("calendar", "updateEvent", { uid: event.uid, scope: input.scope });
        set((state) => ({
          events: state.events.map((e) => (e.uid === eventUid ? event : e)),
          saving: false,
        }));
        return event;
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to update event",
        });
        throw error;
      }
    },

    moveEvent: async (eventUid, fromCalendarId, toCalendarId) => {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        const event = await moveCalendarEventToCalendar(
          token,
          eventUid,
          fromCalendarId,
          toCalendarId,
        );
        logStoreAction("calendar", "moveEvent", { uid: event.uid, toCalendarId });
        set((state) => ({
          events: state.events.map((e) => (e.uid === eventUid ? event : e)),
          saving: false,
        }));
        return event;
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to move event",
        });
        throw error;
      }
    },

    exportEventIcs: async (calendarId, eventUid) => {
      const token = requireToken();
      return exportCalendarEventIcs(token, calendarId, eventUid);
    },

    loadEventForEdit: async (calendarId, eventUid) => {
      set({ error: null });
      try {
        const token = requireToken();
        const event = await fetchCalendarEvent(token, calendarId, eventUid);
        logStoreAction("calendar", "loadEventForEdit", { uid: eventUid });
        return event;
      } catch (error) {
        if (invalidateIfUnauthorized(error)) return null;
        set({
          error: error instanceof Error ? error.message : "Failed to load event",
        });
        return null;
      }
    },

    deleteEvent: async (calendarId, eventUid, options = {}) => {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        const masterEvent = get().events.find(
          (event) =>
            event.uid === eventUid &&
            (options.recurrenceId == null || event.recurrenceId === options.recurrenceId),
        );
        await deleteCalendarEvent(token, calendarId, eventUid, {
          recurrenceId: options.recurrenceId,
          scope: options.scope,
          masterEvent,
        });
        logStoreAction("calendar", "deleteEvent", { uid: eventUid, scope: options.scope });
        set((state) => ({
          events:
            options.scope === "this" && options.recurrenceId != null
              ? state.events.filter(
                  (event) =>
                    !(event.uid === eventUid && event.recurrenceId === options.recurrenceId),
                )
              : state.events.filter((event) => event.uid !== eventUid),
          selectedEventUid: state.selectedEventUid === eventUid ? null : state.selectedEventUid,
          selectedRecurrenceId: null,
          saving: false,
        }));
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to delete event",
        });
        throw error;
      }
    },

    searchEvents: async (query, start, end) => {
      const trimmed = query.trim();
      if (trimmed.length === 0) return;
      set({ loadingEvents: true, error: null });
      try {
        const token = requireToken();
        const calendarIds = get().visibleCalendarIds;
        const events = await searchCalendarEvents(token, calendarIds, start, end, trimmed);
        logStoreAction("calendar", "searchEvents", { query: trimmed, count: events.length });
        set({ events, loadingEvents: false });
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          loadingEvents: false,
          error: error instanceof Error ? error.message : "Failed to search events",
        });
        throw error;
      }
    },

    importEventIcs: async (calendarId, ics) => {
      set({ saving: true, error: null });
      try {
        const token = requireToken();
        const event = await importCalendarEventIcs(token, calendarId, ics);
        logStoreAction("calendar", "importEventIcs", { uid: event.uid });
        set((state) => ({
          events: [...state.events, event],
          saving: false,
        }));
      } catch (error) {
        if (invalidateIfUnauthorized(error)) throw error;
        set({
          saving: false,
          error: error instanceof Error ? error.message : "Failed to import event",
        });
        throw error;
      }
    },

    checkAttendeeBusy: async (email, start, end) => {
      try {
        const token = requireToken();
        const entries = await fetchCalendarFreeBusy(token, start, end, [email]);
        const busy = entries[0]?.busy ?? [];
        const startMs = new Date(start).getTime();
        const endMs = new Date(end).getTime();
        return busy.some((slot) => {
          const slotStart = new Date(slot.start).getTime();
          const slotEnd = new Date(slot.end).getTime();
          return slotStart < endMs && slotEnd > startMs;
        });
      } catch {
        return false;
      }
    },

    clear: () => {
      set({
        calendars: EMPTY_CALENDARS,
        visibleCalendarIds: [],
        events: EMPTY_EVENTS,
        selectedEventUid: null,
        selectedRecurrenceId: null,
        focusDate: new Date(),
        viewMode: "month",
        loadingCalendars: false,
        loadingEvents: false,
        saving: false,
        error: null,
        loadedRangeStart: null,
        loadedRangeEnd: null,
      });
    },
  };
});
