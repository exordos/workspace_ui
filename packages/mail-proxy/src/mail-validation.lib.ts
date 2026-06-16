/**
 * Input validation for mail-proxy REST handlers.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_LENGTH = 512_000;
const MAX_FOLDER_PATH_LENGTH = 256;

const ALLOWED_IMAP_FLAGS = new Set(["\\Seen", "\\Flagged", "\\Answered", "\\Draft"]);

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

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
  if (trimmed.length > MAX_FOLDER_PATH_LENGTH) {
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

export interface SendMailPayload {
  to: string;
  cc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
}

export function parseSendMailPayload(body: unknown): SendMailPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const to = typeof record.to === "string" ? record.to.trim() : "";
  const cc = typeof record.cc === "string" ? record.cc.trim() : undefined;
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const bodyHtml =
    typeof record.bodyHtml === "string"
      ? record.bodyHtml
      : typeof record.body === "string"
        ? record.body
        : "";
  const bodyText = typeof record.bodyText === "string" ? record.bodyText : undefined;
  const inReplyTo = typeof record.inReplyTo === "string" ? record.inReplyTo.trim() : undefined;
  const references = typeof record.references === "string" ? record.references.trim() : undefined;

  if (!isValidEmail(to)) {
    throw new Error("Invalid recipient email");
  }
  if (cc != null && cc.length > 0) {
    for (const part of cc.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0 && !isValidEmail(trimmed)) {
        throw new Error("Invalid cc email");
      }
    }
  }
  if (subject.length === 0) {
    throw new Error("Subject is required");
  }
  if (bodyHtml.length === 0) {
    throw new Error("Body is required");
  }
  if (bodyHtml.length > MAX_BODY_LENGTH) {
    throw new Error("Body is too long");
  }
  return {
    to,
    cc: cc != null && cc.length > 0 ? cc : undefined,
    subject,
    bodyHtml,
    bodyText,
    inReplyTo: inReplyTo != null && inReplyTo.length > 0 ? inReplyTo : undefined,
    references: references != null && references.length > 0 ? references : undefined,
  };
}

export interface SessionPayload {
  email: string;
  password: string;
}

export function parseSessionPayload(body: unknown): SessionPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (!isValidEmail(email)) {
    throw new Error("Invalid email");
  }
  if (password.length === 0) {
    throw new Error("Password is required");
  }
  return { email, password };
}

export interface MoveMailPayload {
  fromFolder: string;
  toFolder: string;
}

export function parseMoveMailPayload(body: unknown): MoveMailPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const fromFolder = sanitizeFolderPath(
    typeof record.fromFolder === "string" ? record.fromFolder : "",
  );
  const toFolder = sanitizeFolderPath(typeof record.toFolder === "string" ? record.toFolder : "");
  if (fromFolder === toFolder) {
    throw new Error("Source and destination folders must differ");
  }
  return { fromFolder, toFolder };
}

export interface CreateFolderPayload {
  path: string;
}

function validateFolderSegmentName(name: string, delimiter: string): void {
  if (name.length === 0) {
    throw new Error("Folder name is required");
  }
  if (name.includes("\0") || name.includes("/") || name.includes("\\")) {
    throw new Error("Invalid folder name");
  }
  if (name.includes(delimiter)) {
    throw new Error("Folder name cannot contain hierarchy delimiter");
  }
}

export function joinMailFolderPath(
  parentPath: string,
  name: string,
  delimiter: string,
): string {
  const trimmedParent = parentPath.trim();
  const trimmedName = name.trim();
  validateFolderSegmentName(trimmedName, delimiter);
  if (trimmedParent.length === 0) {
    return sanitizeFolderPath(trimmedName);
  }
  return sanitizeFolderPath(`${trimmedParent}${delimiter}${trimmedName}`);
}

export function parseCreateFolderPayload(body: unknown): CreateFolderPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const delimiter =
    typeof record.delimiter === "string" && record.delimiter.length === 1
      ? record.delimiter
      : ".";

  if (typeof record.path === "string" && record.path.trim().length > 0) {
    const path = sanitizeFolderPath(record.path);
    if (path === "INBOX") {
      throw new Error("Cannot create INBOX");
    }
    return { path };
  }

  const name = typeof record.name === "string" ? record.name.trim() : "";
  const parentPath =
    typeof record.parentPath === "string" ? sanitizeFolderPath(record.parentPath) : "";
  const path = joinMailFolderPath(parentPath, name, delimiter);
  if (path === "INBOX") {
    throw new Error("Cannot create INBOX");
  }
  return { path };
}

export interface MessageFlagsPayload {
  folder: string;
  addFlags?: string[];
  removeFlags?: string[];
}

function parseFlagsArray(value: unknown, label: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  const flags = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  for (const flag of flags) {
    if (!ALLOWED_IMAP_FLAGS.has(flag)) {
      throw new Error(`Unsupported flag: ${flag}`);
    }
  }
  return flags.length > 0 ? flags : undefined;
}

export function parseMessageFlagsPayload(body: unknown): MessageFlagsPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const folder = sanitizeFolderPath(typeof record.folder === "string" ? record.folder : "INBOX");
  const addFlags = parseFlagsArray(record.addFlags, "addFlags");
  const removeFlags = parseFlagsArray(record.removeFlags, "removeFlags");
  if (addFlags == null && removeFlags == null) {
    throw new Error("At least one of addFlags or removeFlags is required");
  }
  return { folder, addFlags, removeFlags };
}

export function getMailFolderParentPath(path: string, delimiter: string): string | null {
  const index = path.lastIndexOf(delimiter);
  if (index <= 0) return null;
  return path.slice(0, index);
}

export interface FolderPathPayload {
  path: string;
}

export function parseFolderPathPayload(body: unknown): FolderPathPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const path = sanitizeFolderPath(typeof record.path === "string" ? record.path : "");
  return { path };
}

export interface RenameFolderPayload {
  path: string;
  name: string;
  delimiter: string;
}

export function parseRenameFolderPayload(body: unknown): RenameFolderPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const path = sanitizeFolderPath(typeof record.path === "string" ? record.path : "");
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const delimiter =
    typeof record.delimiter === "string" && record.delimiter.length === 1
      ? record.delimiter
      : ".";
  validateFolderSegmentName(name, delimiter);
  return { path, name, delimiter };
}

export interface MoveMailboxPayload {
  path: string;
  parentPath: string;
  delimiter: string;
}

export function parseMoveMailboxPayload(body: unknown): MoveMailboxPayload {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }
  const record = body as Record<string, unknown>;
  const path = sanitizeFolderPath(typeof record.path === "string" ? record.path : "");
  const parentPath =
    typeof record.parentPath === "string" ? sanitizeFolderPath(record.parentPath) : "";
  const delimiter =
    typeof record.delimiter === "string" && record.delimiter.length === 1
      ? record.delimiter
      : ".";
  return { path, parentPath, delimiter };
}
