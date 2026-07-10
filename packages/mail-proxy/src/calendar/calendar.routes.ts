/**
 * REST routes for calendar-proxy (/v1/calendar/*) — CalDAV transport only.
 */

import type { Express } from "express";
import { handleRouteError } from "../shared/http/error-handler.lib";
import { requireMailSession } from "../shared/session/session-auth.lib";
import {
  createCalendar,
  createCalendarEvent,
  deleteCalendar,
  deleteCalendarEvent,
  exportCalendarEvent,
  getCalendarEvent,
  listCalendars,
  moveCalendarEvent,
  queryCalendarEvents,
  queryCalendarFreeBusy,
  searchCalendarEvents,
  updateCalendar,
  updateCalendarEvent,
} from "./caldav.lib";
import {
  parseCalendarIdsQuery,
  parseCalendarIcsBody,
  parseCreateCalendarBody,
  parseEmailsQuery,
  parseEventUidParam,
  parseIsoDateQuery,
  parseMoveCalendarEventBody,
  parseOptionalRecurrenceIdQuery,
  parseOptionalScopeQuery,
  parseSearchQuery,
  parseUpdateCalendarBody,
} from "./request.lib";

export function registerCalendarRoutes(app: Express): void {
  app.get("/v1/calendar/calendars", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const calendars = await listCalendars(session);
      res.json({ calendars });
    } catch (error) {
      handleRouteError(res, error, "Failed to list calendars", { detectAuthErrors: true });
    }
  });

  app.post("/v1/calendar/calendars", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const { displayName, color } = parseCreateCalendarBody(req.body);
      const calendar = await createCalendar(session, displayName, color);
      res.status(201).json(calendar);
    } catch (error) {
      handleRouteError(res, error, "Failed to create calendar", { detectAuthErrors: true });
    }
  });

  app.patch("/v1/calendar/calendars/:calendarId", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const calendarId = parseEventUidParam(req.params.calendarId);
      const { displayName, color } = parseUpdateCalendarBody(req.body);
      const calendar = await updateCalendar(session, calendarId, displayName, color);
      res.json(calendar);
    } catch (error) {
      handleRouteError(res, error, "Failed to update calendar", { detectAuthErrors: true });
    }
  });

  app.delete("/v1/calendar/calendars/:calendarId", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const calendarId = parseEventUidParam(req.params.calendarId);
      await deleteCalendar(session, calendarId);
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to delete calendar", { detectAuthErrors: true });
    }
  });

  app.get("/v1/calendar/events", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const calendarIds = parseCalendarIdsQuery(req.query.calendarId);
      const start = parseIsoDateQuery(req.query.start, "start");
      const end = parseIsoDateQuery(req.query.end, "end");
      const items = await queryCalendarEvents(session, calendarIds, start, end);
      res.json({ items });
    } catch (error) {
      handleRouteError(res, error, "Failed to query events", { detectAuthErrors: true });
    }
  });

  app.get("/v1/calendar/events/search", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const q = parseSearchQuery(req.query.q);
      const calendarIds = parseCalendarIdsQuery(req.query.calendarId);
      const start = parseIsoDateQuery(req.query.start, "start");
      const end = parseIsoDateQuery(req.query.end, "end");
      const items = await searchCalendarEvents(session, calendarIds, start, end, q);
      res.json({ items });
    } catch (error) {
      handleRouteError(res, error, "Failed to search events", { detectAuthErrors: true });
    }
  });

  app.post("/v1/calendar/events/import", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const { calendarId, ics } = parseCalendarIcsBody(req.body);
      const resource = await createCalendarEvent(session, calendarId, ics);
      res.status(201).json(resource);
    } catch (error) {
      handleRouteError(res, error, "Failed to import event", { detectAuthErrors: true });
    }
  });

  app.get("/v1/calendar/freebusy", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const start = parseIsoDateQuery(req.query.start, "start");
      const end = parseIsoDateQuery(req.query.end, "end");
      const emails = parseEmailsQuery(req.query.emails);
      const entries = await queryCalendarFreeBusy(session, start, end, emails);
      res.json({ entries });
    } catch (error) {
      handleRouteError(res, error, "Failed to query free/busy", { detectAuthErrors: true });
    }
  });

  app.post("/v1/calendar/events", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const { calendarId, ics } = parseCalendarIcsBody(req.body);
      const resource = await createCalendarEvent(session, calendarId, ics);
      res.status(201).json(resource);
    } catch (error) {
      handleRouteError(res, error, "Failed to create event", { detectAuthErrors: true });
    }
  });

  app.get("/v1/calendar/events/:eventUid", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const eventUid = parseEventUidParam(req.params.eventUid);
      const calendarId = parseCalendarIdsQuery(req.query.calendarId)[0];
      if (calendarId == null) {
        throw new Error("calendarId query parameter is required");
      }
      const resource = await getCalendarEvent(session, calendarId, eventUid);
      if (resource == null) {
        res.status(404).json({ error: "Event not found" });
        return;
      }
      res.json(resource);
    } catch (error) {
      handleRouteError(res, error, "Failed to get event", { detectAuthErrors: true });
    }
  });

  app.get("/v1/calendar/events/:eventUid/export", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const eventUid = parseEventUidParam(req.params.eventUid);
      const calendarId = parseCalendarIdsQuery(req.query.calendarId)[0];
      if (calendarId == null) {
        throw new Error("calendarId query parameter is required");
      }
      const ics = await exportCalendarEvent(session, calendarId, eventUid);
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.send(ics);
    } catch (error) {
      handleRouteError(res, error, "Failed to export event", { detectAuthErrors: true });
    }
  });

  app.post("/v1/calendar/events/:eventUid/move", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const eventUid = parseEventUidParam(req.params.eventUid);
      const { fromCalendarId, toCalendarId } = parseMoveCalendarEventBody(req.body);
      const resource = await moveCalendarEvent(session, eventUid, fromCalendarId, toCalendarId);
      res.json(resource);
    } catch (error) {
      handleRouteError(res, error, "Failed to move event", { detectAuthErrors: true });
    }
  });

  app.put("/v1/calendar/events/:eventUid", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const eventUid = parseEventUidParam(req.params.eventUid);
      const { calendarId, ics, etag } = parseCalendarIcsBody(req.body);
      const resource = await updateCalendarEvent(session, eventUid, calendarId, ics, etag);
      res.json(resource);
    } catch (error) {
      handleRouteError(res, error, "Failed to update event", { detectAuthErrors: true });
    }
  });

  app.delete("/v1/calendar/events/:eventUid", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const eventUid = parseEventUidParam(req.params.eventUid);
      const calendarId = parseCalendarIdsQuery(req.query.calendarId)[0];
      if (calendarId == null) {
        throw new Error("calendarId query parameter is required");
      }
      const recurrenceId = parseOptionalRecurrenceIdQuery(req.query.recurrenceId);
      const scope = parseOptionalScopeQuery(req.query.scope);
      const ics =
        typeof req.body === "object" &&
        req.body != null &&
        typeof (req.body as Record<string, unknown>).ics === "string"
          ? ((req.body as Record<string, unknown>).ics as string)
          : undefined;
      await deleteCalendarEvent(session, calendarId, eventUid, {
        recurrenceId,
        scope,
        ics,
      });
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to delete event", { detectAuthErrors: true });
    }
  });
}
