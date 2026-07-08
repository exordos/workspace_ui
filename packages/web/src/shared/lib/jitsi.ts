/**
 * Jitsi Meet URL helpers.
 *
 * Extracts, parses, and builds Jitsi meeting URLs.
 * Resolution order for "this organization's" Jitsi host: optional {@link JitsiLinkOptions.serverBaseUrl}
 * (from Workspace `server_settings.meet_url`) then `VITE_JITSI_MEET_DOMAIN` via constants.
 * Public `meet.jit.si` is accepted for copied links only.
 *
 * Usage:
 *   import { getJitsiMeetingUrl, parseJitsiUrl, buildJitsiMeetingUrl } from "~/shared/lib/jitsi";
 */
import { JITSI_MEET_BASE_URL, JITSI_MEET_DOMAIN } from "~/shared/config/constants";

/** Optional per-Workspace override, see module header. */
export interface JitsiLinkOptions {
  /** Effective Jitsi base URL (`https://host`, no trailing slash), e.g. from Workspace server settings. */
  serverBaseUrl?: string | null;
}

function normalizeHttpOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function getEffectiveJitsiBaseAndDomain(options?: JitsiLinkOptions): {
  baseUrl: string;
  domain: string;
} {
  const fromWorkspaceSettings =
    options?.serverBaseUrl != null && String(options.serverBaseUrl).trim() !== ""
      ? normalizeHttpOrigin(String(options.serverBaseUrl))
      : null;
  if (fromWorkspaceSettings) {
    return {
      baseUrl: fromWorkspaceSettings,
      domain: new URL(fromWorkspaceSettings).hostname.toLowerCase(),
    };
  }
  const base = JITSI_MEET_BASE_URL.replace(/\/+$/, "");
  const domain = JITSI_MEET_DOMAIN.trim().toLowerCase();
  if (base.length > 0 && domain.length > 0) {
    return { baseUrl: base, domain };
  }
  return { baseUrl: "", domain: "" };
}

/** Extracts the first Jitsi meeting URL from text (configured Workspace host or meet.jit.si). */
export function getJitsiMeetingUrl(content: string, options?: JitsiLinkOptions): string | null {
  const { baseUrl, domain } = getEffectiveJitsiBaseAndDomain(options);
  const trimmed = content.trim();
  if (baseUrl.length > 0) {
    if (trimmed.startsWith(`${baseUrl}/`)) return trimmed;
    if (trimmed === baseUrl) return null;
  }
  const hostsPattern =
    domain.length > 0 ? `(?:${escapeRegex(domain)}|meet\\.jit\\.si)` : `meet\\.jit\\.si`;
  const pattern = new RegExp(`https?://${hostsPattern}/([^\\s<>"']+)`, "i");
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
export function parseJitsiUrl(url: string, options?: JitsiLinkOptions): JitsiUrlParts | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return null;
    }
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/^\/+/, "").split("/")[0];
    if (!path) return null;
    const { domain: effectiveDomain } = getEffectiveJitsiBaseAndDomain(options);
    if (host === "meet.jit.si" || (effectiveDomain.length > 0 && host === effectiveDomain)) {
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
export function buildJitsiMeetingUrl(roomName: string, options?: JitsiLinkOptions): string {
  const encoded = encodeURIComponent(roomName);
  const { baseUrl } = getEffectiveJitsiBaseAndDomain(options);
  if (baseUrl.length > 0) {
    return `${baseUrl}/${encoded}`;
  }
  return `${JITSI_MEET_BASE_URL}/${encoded}`;
}
