/**
 * fetch wrapper that records method, path, status, and sanitized params via logApiCall.
 */

import { logApiCall, redact } from "./logger";

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function resolveLogPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function extractFetchParams(init?: RequestInit): Record<string, unknown> | undefined {
  const body = init?.body;
  if (typeof body === "string" && body.length > 0) {
    const contentType = init?.headers ? (new Headers(init.headers).get("Content-Type") ?? "") : "";
    if (contentType.includes("application/json")) {
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
          return redact(parsed) as Record<string, unknown>;
        }
      } catch {
        return { body: "[unparsed body]" };
      }
    }
    const params: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(body).entries()) {
      params[key] = value;
    }
    return Object.keys(params).length > 0 ? (redact(params) as Record<string, unknown>) : undefined;
  }
  if (body instanceof URLSearchParams) {
    const params: Record<string, string> = {};
    for (const [key, value] of body.entries()) {
      params[key] = value;
    }
    return Object.keys(params).length > 0 ? (redact(params) as Record<string, unknown>) : undefined;
  }
  if (body instanceof FormData) {
    return { body: "[FormData]" };
  }
  return undefined;
}

export async function loggedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const start = performance.now();
  const method = (init?.method ?? "GET").toUpperCase();
  const url = resolveRequestUrl(input);
  const logPath = resolveLogPath(url);
  const params = extractFetchParams(init);

  try {
    const response = await fetch(input, init);
    const durationMs = Math.round(performance.now() - start);
    logApiCall(method, logPath, {
      status: response.status,
      durationMs,
      ...(params ? { params } : {}),
    });
    return response;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logApiCall(method, logPath, {
      durationMs,
      error: err instanceof Error ? err.message : "Unknown error",
      ...(params ? { params } : {}),
    });
    throw err;
  }
}
