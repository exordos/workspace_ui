/**
 * Mail REST payload validation — client-side before mail-proxy transport calls.
 */

import { isValidEmail } from "~/shared/lib/validation";
import { joinMailFolderPath } from "./mail-folder-tree.lib";

export { isValidEmail };

const MAX_BODY_LENGTH = 512_000;
const MAX_FOLDER_PATH_LENGTH = 256;

const ALLOWED_IMAP_FLAGS = new Set(["\\Seen", "\\Flagged", "\\Answered", "\\Draft"]);

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

export function parseSessionPayload(body: { email: string; password: string }): {
  email: string;
  password: string;
} {
  const email = body.email.trim();
  const password = body.password;
  if (!isValidEmail(email)) {
    throw new Error("Invalid email");
  }
  if (password.length === 0) {
    throw new Error("Password is required");
  }
  return { email, password };
}

function validateRecipientList(value: string | undefined, fieldLabel: string): void {
  if (value == null || value.length === 0) return;
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length > 0 && !isValidEmail(trimmed)) {
      throw new Error(`Invalid ${fieldLabel} email`);
    }
  }
}

function validateSubjectAndBody(subject: string, bodyHtml: string): void {
  if (subject.length === 0) {
    throw new Error("Subject is required");
  }
  if (bodyHtml.length === 0) {
    throw new Error("Body is required");
  }
  if (bodyHtml.length > MAX_BODY_LENGTH) {
    throw new Error("Body is too long");
  }
}

function validateAttachments(
  attachments: { filename: string; contentBase64: string }[] | undefined,
): void {
  if (attachments == null) return;
  for (const attachment of attachments) {
    if (attachment.filename.trim().length === 0) {
      throw new Error("Attachment filename is required");
    }
    if (attachment.contentBase64.length === 0) {
      throw new Error("Attachment content is required");
    }
  }
}

export function parseSendMailPayload(body: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { filename: string; mimeType: string; contentBase64: string }[];
}): typeof body {
  const to = body.to.trim();
  const cc = body.cc?.trim();
  const bcc = body.bcc?.trim();
  const subject = body.subject.trim();
  const bodyHtml = body.bodyHtml;

  if (to.length === 0) {
    throw new Error("Recipient is required");
  }
  if (!isValidEmail(to)) {
    throw new Error("Invalid recipient email");
  }
  validateRecipientList(cc, "cc");
  validateRecipientList(bcc, "bcc");
  validateSubjectAndBody(subject, bodyHtml);
  validateAttachments(body.attachments);
  return body;
}

export function parseDraftMailPayload(body: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { filename: string; mimeType: string; contentBase64: string }[];
}): typeof body {
  if (body.bodyHtml.length > MAX_BODY_LENGTH) {
    throw new Error("Body is too long");
  }
  return body;
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

export function buildCreateFolderPath(
  input: { name: string; parentPath?: string },
  delimiter: string,
): string {
  validateFolderSegmentName(input.name.trim(), delimiter);
  const path = sanitizeFolderPath(
    joinMailFolderPath(input.parentPath ?? "", input.name, delimiter),
  );
  if (path === "INBOX") {
    throw new Error("Cannot create INBOX");
  }
  return path;
}

export function parseMoveMailPayload(
  fromFolder: string,
  toFolder: string,
): {
  fromFolder: string;
  toFolder: string;
} {
  const from = sanitizeFolderPath(fromFolder);
  const to = sanitizeFolderPath(toFolder);
  if (from === to) {
    throw new Error("Source and destination folders must differ");
  }
  return { fromFolder: from, toFolder: to };
}

export function parseMessageFlagsPayload(
  folder: string,
  patch: { addFlags?: string[]; removeFlags?: string[] },
): { folder: string; addFlags?: string[]; removeFlags?: string[] } {
  const sanitizedFolder = sanitizeFolderPath(folder);
  const addFlags = patch.addFlags?.map((item) => item.trim()).filter((item) => item.length > 0);
  const removeFlags = patch.removeFlags
    ?.map((item) => item.trim())
    .filter((item) => item.length > 0);

  for (const flag of [...(addFlags ?? []), ...(removeFlags ?? [])]) {
    if (!ALLOWED_IMAP_FLAGS.has(flag)) {
      throw new Error(`Unsupported flag: ${flag}`);
    }
  }

  if (
    (addFlags == null || addFlags.length === 0) &&
    (removeFlags == null || removeFlags.length === 0)
  ) {
    throw new Error("At least one of addFlags or removeFlags is required");
  }

  return {
    folder: sanitizedFolder,
    addFlags: addFlags != null && addFlags.length > 0 ? addFlags : undefined,
    removeFlags: removeFlags != null && removeFlags.length > 0 ? removeFlags : undefined,
  };
}
