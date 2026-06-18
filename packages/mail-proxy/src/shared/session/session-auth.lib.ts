/**
 * Bearer session auth and login rate limiting for mail-proxy routes.
 */

import type { Request, Response } from "express";
import { getMailSession, parseBearerToken, type MailSessionRecord } from "./session.lib";

const SESSION_RATE_WINDOW_MS = 60_000;
const SESSION_RATE_MAX = 10;
const sessionAttempts = new Map<string, { count: number; windowStart: number }>();

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function isSessionRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = sessionAttempts.get(ip);
  if (!entry || now - entry.windowStart > SESSION_RATE_WINDOW_MS) {
    sessionAttempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > SESSION_RATE_MAX;
}

export function requireMailSession(req: Request, res: Response): MailSessionRecord | null {
  const token = parseBearerToken(req.headers.authorization);
  const session = getMailSession(token ?? undefined);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

/** Test helper — clears login rate limit state. */
export function clearSessionRateLimits(): void {
  sessionAttempts.clear();
}
