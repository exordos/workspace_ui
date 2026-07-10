/**
 * Minimal request coercion for mail-proxy transport handlers (security boundary only).
 */

export function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (value == null || value.trim().length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function parseBooleanQuery(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

export function sanitizeFolderPath(folder: string): string {
  const trimmed = folder.trim();
  if (trimmed.length === 0) return "INBOX";
  if (trimmed.includes("\0")) {
    throw new Error("Invalid folder path");
  }
  if (trimmed.length > 256) {
    throw new Error("Folder path is too long");
  }
  return trimmed;
}

export function parseMessageUid(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("Invalid message uid");
  }
  return parsed;
}

export function parseSessionBody(body: unknown): { email: string; password: string } {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (email.length === 0 || password.length === 0) {
    throw new Error("Email and password are required");
  }
  return { email, password };
}

export function parseFolderPathBody(body: unknown): string {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  return sanitizeFolderPath(typeof record.path === "string" ? record.path : "");
}

export function parseFolderMoveBody(body: unknown): { path: string; toPath: string } {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const path = sanitizeFolderPath(typeof record.path === "string" ? record.path : "");
  const toPath = sanitizeFolderPath(typeof record.toPath === "string" ? record.toPath : "");
  if (path === toPath) {
    throw new Error("Source and destination folders must differ");
  }
  return { path, toPath };
}

export function parseMoveMailBody(body: unknown): { fromFolder: string; toFolder: string } {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const fromFolder = sanitizeFolderPath(typeof record.fromFolder === "string" ? record.fromFolder : "");
  const toFolder = sanitizeFolderPath(typeof record.toFolder === "string" ? record.toFolder : "");
  if (fromFolder === toFolder) {
    throw new Error("Source and destination folders must differ");
  }
  return { fromFolder, toFolder };
}

export function parseMessageFlagsBody(body: unknown): {
  folder: string;
  addFlags?: string[];
  removeFlags?: string[];
} {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const folder = sanitizeFolderPath(typeof record.folder === "string" ? record.folder : "INBOX");
  const addFlags = Array.isArray(record.addFlags)
    ? record.addFlags.filter((item): item is string => typeof item === "string")
    : undefined;
  const removeFlags = Array.isArray(record.removeFlags)
    ? record.removeFlags.filter((item): item is string => typeof item === "string")
    : undefined;
  return { folder, addFlags, removeFlags };
}

export function parseSendMailBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  return body as Record<string, unknown>;
}
