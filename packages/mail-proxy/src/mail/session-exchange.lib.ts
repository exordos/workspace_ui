/**
 * Create mail-proxy session from mailbox credentials.
 * Zulip API key verification is handled by the Workspace API gateway (ADR 018).
 */

import { verifyImapCredentials } from "./imap.lib";
import { createMailSession } from "../shared/session/session.lib";

export interface SessionExchangeInput {
  email: string;
  realmUrl: string;
  apiKey: string;
  password?: string;
}

export async function exchangeMailSession(input: SessionExchangeInput) {
  const email = input.email.trim();
  const password = input.password?.trim() ?? input.apiKey;
  if (email.length === 0 || password.length === 0) {
    throw new Error("Email and credentials are required");
  }

  await verifyImapCredentials(email, password);
  return createMailSession(email, password);
}
