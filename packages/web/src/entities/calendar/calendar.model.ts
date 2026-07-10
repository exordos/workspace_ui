/**
 * Calendar store — calendars, events, view state, and CRUD lifecycle.
 */

import { create } from "zustand";
import { clearMailSessionFromStorage } from "~/entities/mail/mail-session-storage.lib";
import { logStoreAction } from "~/shared/lib/logger";
import { getMailboxSessionToken } from "./calendar-session.lib";
import {
  createCalendarCollection,
  createCalendarEvent,
  deleteCalendarCollection,
  deleteCalendarEvent,
  fetchCalendars,
  fetchCalendarEvents,
  importCalendarEventIcs,
  searchCalendarEvents,
  updateCalendarCollection,
  updateCalendarEvent,
} from "./calendar.api";
import { isCalendarUnauthorizedError } from "./calendar.lib";
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
  updateEvent: (eventUid: string, input: CalendarEventInput) => Promise<CalendarEvent>;
  deleteEvent: (
    calendarId: string,
    eventUid: string,
    options?: { recurrenceId?: string | null; scope?: "this" | "thisAndFuture" | "all" },
  ) => Promise<void>;
  searchEvents: (query: string, start: string, end: string) => Promise<void>;
  importEventIcs: (calendarId: string, ics: string) => Promise<void>;
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
    if (!isCalendarUnauthorizedError(error)) return false;
    clearMailSessionFromStorage();
    set({
      calendars: EMPTY_CALENDARS,
      visibleCalendarIds: [],
      events: EMPTY_EVENTS,
      selectedEventUid: null,
      selectedRecurrenceId: null,
      loadingCalendars: false,
      loadingEvents: false,
      saving: false,
    });
    logStoreAction("calendar", "invalidateSession", { reason: "unauthorized" });
    return true;
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
        logStoreAction("calendar", "updateEvent", { uid: event.uid });
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

    clear: () => {
      set({
        calendars: EMPTY_CALENDARS,
        visibleCalendarIds: [],
        events: EMPTY_EVENTS,
        selectedEventUid: null,
        loadingCalendars: false,
        loadingEvents: false,
        saving: false,
        error: null,
      });
    },
  };
});
