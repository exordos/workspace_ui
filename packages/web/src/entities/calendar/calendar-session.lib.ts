/**
 * Mailbox session bridge for calendar API auth (shared with mail).
 */

import { loadMailSessionFromStorage } from "~/entities/mail/mail-session-storage.lib";

export function getMailboxSessionToken(): string | null {
  const session = loadMailSessionFromStorage();
  return session?.token ?? null;
}

export function getMailboxSessionEmail(): string | null {
  const session = loadMailSessionFromStorage();
  return session?.email ?? null;
}
