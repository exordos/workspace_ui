/**
 * Mail session token persistence in sessionStorage (cleared on tab close / logout).
 */

import type { MailSessionInfo } from "./mail.types";

const STORAGE_KEY = "workspace-mail-session";

export function loadMailSessionFromStorage(): MailSessionInfo | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw == null || raw.length === 0) return null;
    const parsed = JSON.parse(raw) as Partial<MailSessionInfo>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      typeof parsed.email !== "string"
    ) {
      return null;
    }
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

export function saveMailSessionToStorage(session: MailSessionInfo): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export function clearMailSessionFromStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage may be unavailable */
  }
}
