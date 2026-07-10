/**
 * REST routes for calendar-proxy (/v1/calendar/*) — CalDAV transport only.
 */

import type { Express } from "express";
import { handleRouteError } from "../shared/http/error-handler.lib";
import { requireMailSession } from "../shared/session/session-auth.lib";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendars,
  queryCalendarEvents,
  updateCalendarEvent,
} from "./caldav.lib";
import {
  parseCalendarIdsQuery,
  parseCalendarIcsBody,
  parseEventUidParam,
  parseIsoDateQuery,
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
      await deleteCalendarEvent(session, calendarId, eventUid);
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to delete event", { detectAuthErrors: true });
    }
  });
}
