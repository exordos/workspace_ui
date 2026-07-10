/**
 * Exchange Zulip API credentials for a mail-proxy session.
 */

import { verifyImapCredentials } from "./imap.lib";
import { createMailSession } from "../shared/session/session.lib";

export interface SessionExchangeInput {
  email: string;
  realmUrl: string;
  apiKey: string;
  password?: string;
}

function normalizeRealmUrl(realmUrl: string): string {
  const trimmed = realmUrl.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

async function verifyZulipApiKey(email: string, realmUrl: string, apiKey: string): Promise<void> {
  const baseUrl = normalizeRealmUrl(realmUrl);
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const response = await fetch(`${baseUrl}/api/v1/users/me`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    throw new Error("Zulip API key verification failed");
  }
}

export async function exchangeMailSession(input: SessionExchangeInput) {
  const email = input.email.trim();
  const password = input.password?.trim() ?? input.apiKey;
  if (email.length === 0 || password.length === 0) {
    throw new Error("Email and credentials are required");
  }

  await verifyZulipApiKey(email, input.realmUrl, input.apiKey);
  await verifyImapCredentials(email, password);
  return createMailSession(email, password);
}
