/**
 * External content embedding allowlist and sandbox policy helpers.
 *
 * Provides origin allowlist checks and CSP/sandbox helpers used by the embed
 * frame component. Allowed origins come from `VITE_EMBED_ALLOWED_ORIGINS`
 * plus trusted runtime origins (Jitsi + Workspace API).
 */

import { env } from "./env";

function parseAllowedOrigins(): string[] {
  const raw = import.meta.env.VITE_EMBED_ALLOWED_ORIGINS ?? "";
  const jitsi = env.JITSI_MEET_DOMAIN ? `https://${env.JITSI_MEET_DOMAIN}` : "";
  const workspace = env.WORKSPACE_API_ORIGIN;
  const appOrigin = (() => {
    if (typeof window === "undefined") {
      return "";
    }
    try {
      const parsed = new URL(window.location.origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }
      return parsed.origin;
    } catch {
      return "";
    }
  })();

  const fromEnv = raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const all = [...fromEnv];
  if (jitsi) all.push(jitsi);
  if (workspace) all.push(workspace);
  if (appOrigin) all.push(appOrigin);

  return [...new Set(all)];
}

const allowedOrigins = parseAllowedOrigins();

/** Check if a URL is allowed for embedding. */
export function isEmbedAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const origin = parsed.origin;
    return allowedOrigins.some(
      (allowed) => origin === allowed || origin.endsWith(`.${new URL(allowed).hostname}`),
    );
  } catch {
    return false;
  }
}

/** Get all allowed origins (for CSP frame-src). */
export function getAllowedOrigins(): readonly string[] {
  return allowedOrigins;
}

/** Build CSP frame-src directive from allowlist. */
export function getFrameSrcDirective(): string {
  if (allowedOrigins.length === 0) return "'none'";
  return allowedOrigins
    .map((o) => {
      try {
        return new URL(o).hostname;
      } catch {
        return o;
      }
    })
    .join(" ");
}

export type EmbedSandbox = "strict" | "interactive" | "full";

const SANDBOX_POLICIES: Record<EmbedSandbox, string> = {
  strict: "allow-scripts allow-same-origin",
  interactive: "allow-scripts allow-same-origin allow-forms allow-popups",
  full: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads",
};

export function getSandboxPolicy(level: EmbedSandbox): string {
  return SANDBOX_POLICIES[level];
}
