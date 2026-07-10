/**
 * Bridges Orval-generated Mail API calls to fetch with Bearer auth and logging.
 */

import { setMailApiMutator } from "@mail/api/mail-api-mutator";
import { getMailApiBase } from "~/entities/mail/mail.lib";
import { env } from "~/shared/lib/env";
import { logApiCall } from "~/shared/lib/logger";

export class MailApiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MailApiHttpError";
    this.status = status;
  }
}

function resolveBaseUrl(): string {
  if (env.MAIL_USE_WORKSPACE_GATEWAY && env.WORKSPACE_API_ORIGIN.length > 0) {
    return `${env.WORKSPACE_API_ORIGIN.replace(/\/+$/, "")}/mail-proxy`;
  }
  return getMailApiBase(env.MAIL_API_ORIGIN);
}

export async function mailOrvalMutator<T>(url: string, init: RequestInit): Promise<T> {
  const base = resolveBaseUrl();
  if (base.length === 0) {
    throw new Error("Mail API is not configured");
  }

  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  const fullUrl = `${base}${url.startsWith("/") ? url : `/${url}`}`;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(fullUrl, { ...init, headers });
  } catch (error) {
    logApiCall(method, url, {
      error: String(error),
      durationMs: Math.round(performance.now() - started),
    });
    throw error;
  }

  const durationMs = Math.round(performance.now() - started);
  logApiCall(method, url, { status: response.status, durationMs });

  if (!response.ok) {
    let message = `Mail API error (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      /* ignore parse errors */
    }
    throw new MailApiHttpError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** Wire Orval client to mail-proxy. Call once at app bootstrap. */
export function registerMailOrvalMutator(): void {
  setMailApiMutator(mailOrvalMutator);
}

/** Bearer auth headers for authenticated mail/calendar API calls. */
export function mailApiAuthOptions(token: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}
