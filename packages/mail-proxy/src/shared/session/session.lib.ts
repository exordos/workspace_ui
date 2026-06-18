/**
 * In-memory mail session store with TTL and periodic cleanup.
 */

import { randomUUID } from "node:crypto";
import { mailProxyEnv } from "../env.lib";
import { mailLog } from "../logger.lib";

export interface MailSessionRecord {
  token: string;
  email: string;
  password: string;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, MailSessionRecord>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

export function startSessionCleanup(): () => void {
  if (cleanupTimer != null) return () => {};
  cleanupTimer = setInterval(purgeExpiredSessions, 60_000);
  return () => {
    if (cleanupTimer != null) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    sessions.clear();
  };
}

export function createMailSession(email: string, password: string): MailSessionRecord {
  purgeExpiredSessions();
  const now = Date.now();
  const token = randomUUID();
  const record: MailSessionRecord = {
    token,
    email,
    password,
    createdAt: now,
    expiresAt: now + mailProxyEnv.SESSION_TTL_MS,
  };
  sessions.set(token, record);
  mailLog.info("Mail session created", { email });
  return record;
}

export function getMailSession(token: string | undefined): MailSessionRecord | null {
  if (token == null || token.trim().length === 0) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function deleteMailSession(token: string | undefined): void {
  if (token == null || token.trim().length === 0) return;
  if (sessions.delete(token)) {
    mailLog.info("Mail session deleted");
  }
}

export function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (authorizationHeader == null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1]?.trim();
  return token != null && token.length > 0 ? token : null;
}

/** Test helper — clears all sessions. */
export function clearAllMailSessions(): void {
  sessions.clear();
}
