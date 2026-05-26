/**
 * Minimal Set-Cookie parser for Electron main-process auth exchange.
 */

export interface ParsedSetCookie {
  name: string;
  value: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  maxAge?: number;
}

/** Parses a single Set-Cookie header value into name, value, and known attributes. */
export function parseSetCookieHeader(header: string): ParsedSetCookie | null {
  const parts = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }

  const nameValue = parts[0]!;
  const eqIndex = nameValue.indexOf("=");
  if (eqIndex <= 0) {
    return null;
  }

  const name = nameValue.slice(0, eqIndex).trim();
  const value = nameValue.slice(eqIndex + 1).trim();
  if (name.length === 0) {
    return null;
  }

  const parsed: ParsedSetCookie = { name, value };
  for (const attribute of parts.slice(1)) {
    const lower = attribute.toLowerCase();
    if (lower === "httponly") {
      parsed.httpOnly = true;
      continue;
    }
    if (lower === "secure") {
      parsed.secure = true;
      continue;
    }
    if (lower.startsWith("path=")) {
      parsed.path = attribute.slice("path=".length);
      continue;
    }
    if (lower.startsWith("max-age=")) {
      const maxAge = Number.parseInt(attribute.slice("max-age=".length), 10);
      if (Number.isFinite(maxAge)) {
        parsed.maxAge = maxAge;
      }
    }
  }

  return parsed;
}

/** Reads all Set-Cookie header values from a fetch Response Headers object. */
export function collectSetCookieHeaders(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single != null && single.length > 0 ? [single] : [];
}
