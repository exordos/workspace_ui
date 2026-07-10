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

export function parseSearchQuery(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("q query parameter is required");
  }
  return value.trim();
}

export function parseOptionalFolderQuery(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return sanitizeFolderPath(value);
}

export function parseAttachmentIdParam(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("attachmentId is required");
  }
  return value.trim();
}

export function parseSinceUidQuery(value: unknown): number {
  if (typeof value !== "string" || value.trim().length === 0) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseBatchMailBody(body: unknown): {
  folder: string;
  uids: number[];
  action: "delete" | "move" | "setFlags";
  toFolder?: string;
  addFlags?: string[];
  removeFlags?: string[];
} {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const folder = sanitizeFolderPath(typeof record.folder === "string" ? record.folder : "INBOX");
  const uids = Array.isArray(record.uids)
    ? record.uids
        .map((item) => Number.parseInt(String(item), 10))
        .filter((item) => Number.isFinite(item) && item >= 1)
    : [];
  const action = record.action;
  if (action !== "delete" && action !== "move" && action !== "setFlags") {
    throw new Error("Invalid batch action");
  }
  if (uids.length === 0) {
    throw new Error("uids are required");
  }
  return {
    folder,
    uids,
    action,
    toFolder:
      typeof record.toFolder === "string" ? sanitizeFolderPath(record.toFolder) : undefined,
    addFlags: Array.isArray(record.addFlags)
      ? record.addFlags.filter((item): item is string => typeof item === "string")
      : undefined,
    removeFlags: Array.isArray(record.removeFlags)
      ? record.removeFlags.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

export function parseSessionExchangeBody(body: unknown): {
  email: string;
  realmUrl: string;
  apiKey: string;
  password?: string;
} {
  if (typeof body !== "object" || body == null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const realmUrl = typeof record.realmUrl === "string" ? record.realmUrl.trim() : "";
  const apiKey = typeof record.apiKey === "string" ? record.apiKey : "";
  const password = typeof record.password === "string" ? record.password : undefined;
  if (email.length === 0 || realmUrl.length === 0 || apiKey.length === 0) {
    throw new Error("email, realmUrl, and apiKey are required");
  }
  return { email, realmUrl, apiKey, password };
}

export function coerceSendMailPayload(record: Record<string, unknown>): {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
} {
  const attachments = Array.isArray(record.attachments)
    ? record.attachments
        .map((item, index) => {
          if (typeof item !== "object" || item == null) return null;
          const entry = item as Record<string, unknown>;
          const filename =
            typeof entry.filename === "string" && entry.filename.trim().length > 0
              ? entry.filename.trim()
              : `attachment-${index + 1}`;
          const mimeType =
            typeof entry.mimeType === "string" && entry.mimeType.trim().length > 0
              ? entry.mimeType.trim()
              : "application/octet-stream";
          const contentBase64 =
            typeof entry.contentBase64 === "string" ? entry.contentBase64 : "";
          if (contentBase64.length === 0) return null;
          const content = Buffer.from(contentBase64, "base64");
          if (content.length === 0) return null;
          return { filename, contentType: mimeType, content };
        })
        .filter((item): item is { filename: string; content: Buffer; contentType: string } =>
          item != null,
        )
    : undefined;

  return {
    to: typeof record.to === "string" ? record.to : "",
    cc: typeof record.cc === "string" ? record.cc : undefined,
    bcc: typeof record.bcc === "string" ? record.bcc : undefined,
    subject: typeof record.subject === "string" ? record.subject : "",
    bodyHtml:
      typeof record.bodyHtml === "string"
        ? record.bodyHtml
        : typeof record.body === "string"
          ? record.body
          : "",
    bodyText: typeof record.bodyText === "string" ? record.bodyText : undefined,
    inReplyTo: typeof record.inReplyTo === "string" ? record.inReplyTo : undefined,
    references: typeof record.references === "string" ? record.references : undefined,
    attachments: attachments != null && attachments.length > 0 ? attachments : undefined,
  };
}
