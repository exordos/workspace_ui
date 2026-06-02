/**
 * Body parsing helpers for loggedFetch param redaction.
 */

import { redact } from "./logger";

function recordFromUrlSearchParams(body: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of body.entries()) {
    params[key] = value;
  }
  return params;
}

function redactParamsRecord(params: Record<string, string>): Record<string, unknown> | undefined {
  return Object.keys(params).length > 0 ? (redact(params) as Record<string, unknown>) : undefined;
}

function tryParseJsonBody(body: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return redact(parsed) as Record<string, unknown>;
    }
  } catch {
    return { body: "[unparsed body]" };
  }
  return undefined;
}

function paramsFromStringBody(body: string): Record<string, unknown> | undefined {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body).entries()) {
    params[key] = value;
  }
  return redactParamsRecord(params);
}

export function resolveFetchBodyContentType(init?: RequestInit): string {
  if (!init?.headers) {
    return "";
  }
  return new Headers(init.headers).get("Content-Type") ?? "";
}

export function extractFetchParamsFromBody(
  body: RequestInit["body"],
  contentType: string,
): Record<string, unknown> | undefined {
  if (typeof body === "string" && body.length > 0) {
    if (contentType.includes("application/json")) {
      return tryParseJsonBody(body);
    }
    return paramsFromStringBody(body);
  }
  if (body instanceof URLSearchParams) {
    return redactParamsRecord(recordFromUrlSearchParams(body));
  }
  if (body instanceof FormData) {
    return { body: "[FormData]" };
  }
  return undefined;
}
