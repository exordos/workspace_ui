/**
 * Jitsi host trust helpers.
 *
 * Register-provided Jitsi hosts are treated as untrusted input and must match
 * operator-controlled configuration before they can be used for call links or embeds.
 */
import { env } from "~/shared/lib/env";

const PUBLIC_JITSI_HOST = "meet.jit.si";

function parseCommaSeparatedHosts(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "https:") return null;
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedJitsiHosts(): ReadonlySet<string> {
  const hosts = new Set<string>();
  const configuredHost = normalizeHost(env.JITSI_MEET_DOMAIN ?? "");
  if (configuredHost) hosts.add(configuredHost);

  for (const configured of parseCommaSeparatedHosts(env.JITSI_ALLOWED_DOMAINS ?? "")) {
    const host = normalizeHost(configured);
    if (host) hosts.add(host);
  }

  return hosts;
}

export function isPublicJitsiHost(host: string): boolean {
  return host.trim().toLowerCase() === PUBLIC_JITSI_HOST;
}

export function isAllowedConfiguredJitsiHost(host: string): boolean {
  return getAllowedJitsiHosts().has(host.trim().toLowerCase());
}

export function isTrustedJitsiHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return isPublicJitsiHost(normalized) || isAllowedConfiguredJitsiHost(normalized);
}

export function normalizeTrustedJitsiOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "default") return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (!isAllowedConfiguredJitsiHost(parsed.host)) return null;
    return parsed.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
