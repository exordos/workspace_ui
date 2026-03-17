/**
 * Permissions Policy header helpers.
 *
 * Builds a safe media policy for embedded call providers (Jitsi),
 * while keeping other sensitive capabilities restricted.
 *
 * Usage:
 *   import { buildPermissionsPolicyHeader } from "~/shared/lib/permissions-policy";
 *   const policy = buildPermissionsPolicyHeader("meet.example.com");
 */

const DEFAULT_MEDIA_EMBED_ORIGINS = ["https://meet.jit.si"];

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const candidate =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return null;
  }
}

function buildMediaAllowList(configuredJitsiDomain?: string): string {
  const origins = new Set<string>();
  for (const origin of DEFAULT_MEDIA_EMBED_ORIGINS) {
    const normalized = normalizeOrigin(origin);
    if (normalized != null) {
      origins.add(normalized);
    }
  }

  if (configuredJitsiDomain != null && configuredJitsiDomain.trim().length > 0) {
    const normalizedConfigured = normalizeOrigin(configuredJitsiDomain);
    if (normalizedConfigured != null) {
      origins.add(normalizedConfigured);
    }
  }

  const originTokens = Array.from(origins).map((origin) => `"${origin}"`);
  return ["self", ...originTokens].join(" ");
}

/** Builds a Permissions-Policy header string used by Vite dev/preview servers. */
export function buildPermissionsPolicyHeader(configuredJitsiDomain?: string): string {
  const mediaAllowList = buildMediaAllowList(configuredJitsiDomain);
  return [
    `camera=(${mediaAllowList})`,
    `microphone=(${mediaAllowList})`,
    "fullscreen=(self)",
    "geolocation=()",
  ].join(", ");
}
