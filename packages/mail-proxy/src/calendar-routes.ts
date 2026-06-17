/**
 * REST routes for calendar-proxy (/v1/calendar/*).
 */

import type { Express, Request, Response } from "express";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendars,
  queryCalendarEvents,
  updateCalendarEvent,
} from "./calendar-caldav.lib";
import { mailLog } from "./mail-logger.lib";
import { getMailSession, parseBearerToken } from "./mail-session.lib";
import {
  parseCalendarEventInput,
  parseCalendarIdsQuery,
  parseEventUidParam,
  parseIsoDateQuery,
} from "./calendar-validation.lib";

function requireSession(req: Request, res: Response) {
  const token = parseBearerToken(req.headers.authorization);
  const session = getMailSession(token ?? undefined);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

function handleError(res: Response, error: unknown, fallbackMessage: string): void {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const cause =
    error instanceof Error && error.cause != null ? String(error.cause) : undefined;
  mailLog.warn(fallbackMessage, { error: message, ...(cause != null ? { cause } : {}) });
  const status = message.includes("(401)") || message.includes("authentication failed") ? 401 : 400;
  res.status(status).json({ error: message });
}

export function registerCalendarRoutes(app: Express): void {
  app.get("/v1/calendar/calendars", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const calendars = await listCalendars(session);
      res.json({ calendars });
    } catch (error) {
      handleError(res, error, "Failed to list calendars");
    }
  });

  app.get("/v1/calendar/events", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const calendarIds = parseCalendarIdsQuery(req.query.calendarId);
      const start = parseIsoDateQuery(req.query.start, "start");
      const end = parseIsoDateQuery(req.query.end, "end");
      const events = await queryCalendarEvents(session, calendarIds, start, end);
      res.json({ events });
    } catch (error) {
      handleError(res, error, "Failed to query events");
    }
  });

  app.get("/v1/calendar/events/:eventUid", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const eventUid = parseEventUidParam(req.params.eventUid);
      const calendarId = parseCalendarIdsQuery(req.query.calendarId)[0];
      if (calendarId == null) {
        throw new Error("calendarId query parameter is required");
      }
      const event = await getCalendarEvent(session, calendarId, eventUid);
      if (event == null) {
        res.status(404).json({ error: "Event not found" });
        return;
      }
      res.json({ event });
    } catch (error) {
      handleError(res, error, "Failed to get event");
    }
  });

  app.post("/v1/calendar/events", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const input = parseCalendarEventInput(req.body);
      const event = await createCalendarEvent(session, input);
      res.status(201).json({ event });
    } catch (error) {
      handleError(res, error, "Failed to create event");
    }
  });

  app.put("/v1/calendar/events/:eventUid", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const eventUid = parseEventUidParam(req.params.eventUid);
      const input = parseCalendarEventInput(req.body);
      const event = await updateCalendarEvent(session, eventUid, input);
      res.json({ event });
    } catch (error) {
      handleError(res, error, "Failed to update event");
    }
  });

  app.delete("/v1/calendar/events/:eventUid", async (req, res) => {
    const session = requireSession(req, res);
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
      handleError(res, error, "Failed to delete event");
    }
  });
}
