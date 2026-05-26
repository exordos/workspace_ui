/**
 * Extract sanitized API request parameters for diagnostics logging.
 *
 * Never includes response bodies or Authorization headers — only query/body
 * fields needed to reproduce a request during debugging.
 */

import type { ApiRequest } from "~/shared/api/client";
import { redact } from "./logger";

const MAX_PARAM_STRING_LENGTH = 200;
const LONG_POLL_PARAM_KEYS = new Set(["queue_id", "last_event_id", "timeout"]);

function truncateString(value: string): string {
  if (value.length <= MAX_PARAM_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_PARAM_STRING_LENGTH)}…`;
}

function truncateParamValues(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[max depth]";
  if (typeof value === "string") {
    return truncateString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateParamValues(item, depth + 1));
  }
  if (value != null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = truncateParamValues(nested, depth + 1);
    }
    return result;
  }
  return value;
}

function recordFromSearchParams(searchParams: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    result[key] = value;
  }
  return result;
}

function isEventsLongPollPath(pathname: string): boolean {
  return /\/events\/?$/.test(pathname);
}

function filterEventsLongPollParams(
  params: Record<string, string>,
): Record<string, string> | undefined {
  const filtered: Record<string, string> = {};
  for (const key of LONG_POLL_PARAM_KEYS) {
    const value = params[key];
    if (value != null) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function parseUrlencodedBody(body: string): Record<string, string> {
  return recordFromSearchParams(new URLSearchParams(body));
}

function parseJsonBody(body: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { body: truncateString(body) };
  } catch {
    return { body: "[unparsed body]" };
  }
}

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> | undefined {
  const redacted = redact(params) as Record<string, unknown>;
  const truncated = truncateParamValues(redacted) as Record<string, unknown>;
  return Object.keys(truncated).length > 0 ? truncated : undefined;
}

function mergeParams(
  ...sources: (Record<string, unknown> | undefined)[]
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    if (!source) continue;
    Object.assign(merged, source);
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function extractLoggableRequestParams(req: ApiRequest): Record<string, unknown> | undefined {
  let pathname: string;
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    pathname = req.url;
  }

  const fromExplicitParams = req.params ? { ...req.params } : undefined;

  let fromQuery: Record<string, string> | undefined;
  try {
    const query = new URL(req.url).searchParams;
    if ([...query.keys()].length > 0) {
      fromQuery = recordFromSearchParams(query);
      if (isEventsLongPollPath(pathname)) {
        fromQuery = filterEventsLongPollParams(fromQuery);
      }
    }
  } catch {
    fromQuery = undefined;
  }

  let fromBody: Record<string, unknown> | undefined;
  if (req.body instanceof FormData) {
    fromBody = { body: "[FormData]" };
  } else if (typeof req.body === "string" && req.body.length > 0) {
    const contentType = req.headers["Content-Type"] ?? req.headers["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      fromBody = parseJsonBody(req.body);
    } else {
      fromBody = parseUrlencodedBody(req.body);
    }
  } else if (req.body != null) {
    fromBody = { body: "[binary]" };
  }

  const combined = mergeParams(fromExplicitParams, fromQuery, fromBody);
  if (!combined) {
    return undefined;
  }

  if (isEventsLongPollPath(pathname) && fromQuery) {
    return sanitizeParams(filterEventsLongPollParams(fromQuery) ?? {});
  }

  return sanitizeParams(combined);
}
