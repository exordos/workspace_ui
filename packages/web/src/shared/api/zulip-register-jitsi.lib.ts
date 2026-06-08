/**
 * Parses effective Jitsi Meet base URL from Zulip POST /api/v1/register JSON.
 *
 * Zulip exposes `jitsi_server_url` (combined, deprecated on FL 212+) or
 * `realm_jitsi_server_url` / `server_jitsi_server_url` (realm overrides server default).
 * Special string `"default"` means inherit server default (treated as unset here).
 */
import { normalizeTrustedJitsiOrigin } from "~/shared/lib/jitsi-allowlist";

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Returns an allowlisted HTTPS origin (e.g. https://meet.example.com) or null if invalid / unset. */
function normalizeJitsiServerBaseUrl(raw: string): string | null {
  return normalizeTrustedJitsiOrigin(raw);
}

/**
 * Reads the organization's Jitsi base URL from a register response body.
 * Prefer legacy `jitsi_server_url` when set; else `realm_jitsi_server_url` then `server_jitsi_server_url`.
 */
export function parseRegisterResponseJitsiServerUrl(data: unknown): string | null {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const o = data as Record<string, unknown>;

  const legacy = normalizeJitsiServerBaseUrl(trimString(o.jitsi_server_url) ?? "");
  if (legacy) return legacy;

  const realm = normalizeJitsiServerBaseUrl(trimString(o.realm_jitsi_server_url) ?? "");
  if (realm) return realm;

  return normalizeJitsiServerBaseUrl(trimString(o.server_jitsi_server_url) ?? "");
}
