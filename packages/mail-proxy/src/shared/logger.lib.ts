/**
 * Minimal structured logger for mail-proxy (no credentials in output).
 */

type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEYS = new Set(["password", "pass", "authorization", "token", "apikey", "api_key"]);

function redactData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    scope: "mail-proxy",
    message,
    ...redactData(data),
    ts: new Date().toISOString(),
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const mailLog = {
  info: (message: string, data?: Record<string, unknown>) => write("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => write("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => write("error", message, data),
};
