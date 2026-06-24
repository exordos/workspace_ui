/**
 * fetch wrapper that records method, path, status, and sanitized params via logApiCall.
 */

import { isAbortError } from "./abort-error";
import { extractFetchParamsFromBody, resolveFetchBodyContentType } from "./logged-fetch-body.lib";
import { logApiCall } from "./logger";

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
  return extractFetchParamsFromBody(init?.body, resolveFetchBodyContentType(init));
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
    const aborted = isAbortError(err) || init?.signal?.aborted === true;
    logApiCall(method, logPath, {
      durationMs,
      ...(aborted
        ? { aborted: true }
        : { error: err instanceof Error ? err.message : "Unknown error" }),
      ...(params ? { params } : {}),
    });
    throw err;
  }
}
