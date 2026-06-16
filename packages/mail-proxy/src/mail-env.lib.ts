/**
 * Environment configuration for mail-proxy.
 */

function optional(key: string, fallback = ""): string {
  const value = process.env[key]?.trim();
  return value != null && value.length > 0 ? value : fallback;
}

function parseIntEnv(key: string, fallback: number): number {
  const raw = optional(key);
  if (raw.length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(key: string, fallback: boolean): boolean {
  const raw = optional(key).toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

export const mailProxyEnv = {
  PORT: parseIntEnv("MAIL_PROXY_PORT", 8787),
  ALLOWED_ORIGINS: optional("MAIL_PROXY_ALLOWED_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0),
  IMAP_HOST: optional("MAILCOW_IMAP_HOST", "127.0.0.1"),
  IMAP_PORT: parseIntEnv("MAILCOW_IMAP_PORT", 993),
  SMTP_HOST: optional("MAILCOW_SMTP_HOST", "127.0.0.1"),
  SMTP_PORT: parseIntEnv("MAILCOW_SMTP_PORT", 465),
  TLS_REJECT_UNAUTHORIZED: parseBoolEnv("MAILCOW_TLS_REJECT_UNAUTHORIZED", false),
  SESSION_TTL_MS: parseIntEnv("MAIL_SESSION_TTL_MS", 8 * 60 * 60 * 1000),
  /** Log raw vs decoded Subject/From/body snapshots (no credentials, truncated). */
  DEBUG_MIME: parseBoolEnv("MAIL_PROXY_DEBUG_MIME", false),
} as const;
