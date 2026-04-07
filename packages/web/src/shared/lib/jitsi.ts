/**
 * Jitsi Meet URL helpers.
 *
 * Extracts, parses, and builds Jitsi meeting URLs.
 * Supports both the configured instance domain and the public meet.jit.si.
 *
 * Usage:
 *   import { getJitsiMeetingUrl, parseJitsiUrl, buildJitsiMeetingUrl } from "~/lib/jitsi";
 */
import { JITSI_MEET_BASE_URL, JITSI_MEET_DOMAIN } from "~/shared/config/constants";

/** Extracts the first Jitsi meeting URL from text (own instance or meet.jit.si). */
export function getJitsiMeetingUrl(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.startsWith(JITSI_MEET_BASE_URL + "/")) return trimmed;
  if (trimmed === JITSI_MEET_BASE_URL) return null;
  // Match our domain or meet.jit.si anywhere in the text
  const pattern = new RegExp(
    `https?://(?:${escapeRegex(JITSI_MEET_DOMAIN)}|meet\\.jit\\.si)/([^\\s<>"']+)`,
    "i",
  );
  const match = trimmed.match(pattern);
  return match ? match[0] : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface JitsiUrlParts {
  domain: string;
  roomName: string;
}

/** Parses a Jitsi URL into domain and room name. */
export function parseJitsiUrl(url: string): JitsiUrlParts | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return null;
    }
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/^\/+/, "").split("/")[0];
    if (!path) return null;
    // Accept our configured instance and the public meet.jit.si
    if (host === JITSI_MEET_DOMAIN || host === "meet.jit.si") {
      return {
        domain: host,
        roomName: decodeURIComponent(path),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Builds a full meeting URL from a room name. */
export function buildJitsiMeetingUrl(roomName: string): string {
  const encoded = encodeURIComponent(roomName);
  return `${JITSI_MEET_BASE_URL}/${encoded}`;
}
