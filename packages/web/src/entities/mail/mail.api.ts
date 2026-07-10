/**
 * Mail REST client — thin wrapper over Orval-generated @mail/api client.
 */

import {
  clearMailFolder as apiClearMailFolder,
  createMailFolder as apiCreateMailFolder,
  createMailSession as apiCreateMailSession,
  deleteMailFolder as apiDeleteMailFolder,
  deleteMailMessage as apiDeleteMailMessage,
  deleteMailSession as apiDeleteMailSession,
  getMailMessage as apiGetMailMessage,
  listMailFolders as apiListMailFolders,
  listMailMessages as apiListMailMessages,
  markAllMailFolderRead as apiMarkAllMailFolderRead,
  moveMailFolder as apiMoveMailFolder,
  moveMailMessage as apiMoveMailMessage,
  patchMailMessageFlags as apiPatchMailMessageFlags,
  renameMailFolder as apiRenameMailFolder,
  sendMailMessage as apiSendMailMessage,
} from "@mail/api/mail-api.generated";
import { mailApiAuthOptions, MailApiHttpError } from "~/shared/api/mail-orval-mutator";
import {
  assertDeleteFolderAllowed,
  computeMoveFolderPath,
  computeRenameFolderPath,
} from "./mail-folder-ops.lib";
import { detectMailFolderDelimiter } from "./mail-folder-tree.lib";
import {
  buildCreateFolderPath,
  parseMessageFlagsPayload,
  parseMoveMailPayload,
  parseSendMailPayload,
  parseSessionPayload,
} from "./mail-validation.lib";
import type {
  MailComposePayload,
  MailCreateFolderInput,
  MailFlagsPatch,
  MailFolder,
  MailFoldersResult,
  MailMessageDetail,
  MailMessageSummary,
  MailMoveFolderInput,
  MailRenameFolderInput,
  MailSessionInfo,
} from "./mail.types";

export { MailApiHttpError as MailApiError };

export async function createMailSession(email: string, password: string): Promise<MailSessionInfo> {
  const payload = parseSessionPayload({ email, password });
  const data = await apiCreateMailSession(payload);
  return {
    token: data.sessionToken,
    expiresAt: data.expiresAt,
    email: data.email,
  };
}

export async function deleteMailSession(token: string): Promise<void> {
  await apiDeleteMailSession(mailApiAuthOptions(token));
}

export async function fetchMailFolders(token: string): Promise<MailFoldersResult> {
  const data = await apiListMailFolders(mailApiAuthOptions(token));
  const folders: MailFolder[] = Array.isArray(data.folders) ? data.folders : [];
  const delimiter =
    typeof data.delimiter === "string" && data.delimiter.length > 0
      ? data.delimiter
      : detectMailFolderDelimiter(folders.map((folder) => folder.path));
  return { folders, delimiter };
}

export async function createMailFolder(
  token: string,
  input: MailCreateFolderInput,
  delimiter: string,
): Promise<string> {
  const path = buildCreateFolderPath(input, delimiter);
  const data = await apiCreateMailFolder({ path }, mailApiAuthOptions(token));
  return data.path;
}

export async function renameMailFolder(
  token: string,
  input: MailRenameFolderInput,
  delimiter: string,
): Promise<string> {
  const toPath = computeRenameFolderPath(input.path, input.name, delimiter);
  const data = await apiRenameMailFolder({ path: input.path, toPath }, mailApiAuthOptions(token));
  return data.path;
}

export async function moveMailFolder(
  token: string,
  input: MailMoveFolderInput,
  delimiter: string,
): Promise<string> {
  const toPath = computeMoveFolderPath(input.path, input.parentPath, delimiter);
  const data = await apiMoveMailFolder({ path: input.path, toPath }, mailApiAuthOptions(token));
  return data.path;
}

export async function deleteMailFolder(
  token: string,
  path: string,
  delimiter: string,
): Promise<void> {
  assertDeleteFolderAllowed(path, delimiter);
  await apiDeleteMailFolder({ path, delimiter }, undefined, mailApiAuthOptions(token));
}

export async function clearMailFolder(token: string, path: string): Promise<void> {
  await apiClearMailFolder({ path }, mailApiAuthOptions(token));
}

export async function markAllMailFolderRead(token: string, path: string): Promise<void> {
  await apiMarkAllMailFolderRead({ path }, mailApiAuthOptions(token));
}

export async function fetchMailMessages(
  token: string,
  folder: string,
  limit = 50,
  cursor?: string | null,
): Promise<{ messages: MailMessageSummary[]; nextCursor: string | null }> {
  const data = await apiListMailMessages(
    {
      folder,
      limit,
      ...(cursor != null && cursor.length > 0 ? { cursor } : {}),
    },
    mailApiAuthOptions(token),
  );
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    nextCursor: data.nextCursor ?? null,
  };
}

export async function fetchMailMessage(
  token: string,
  folder: string,
  uid: number,
  options: { markSeen?: boolean } = {},
): Promise<MailMessageDetail> {
  const data = await apiGetMailMessage(
    uid,
    {
      folder,
      ...(options.markSeen === false ? { markSeen: false } : {}),
    },
    mailApiAuthOptions(token),
  );
  return data.message;
}

export async function patchMailMessageFlags(
  token: string,
  folder: string,
  uid: number,
  patch: MailFlagsPatch,
): Promise<void> {
  const payload = parseMessageFlagsPayload(folder, patch);
  await apiPatchMailMessageFlags(uid, payload, mailApiAuthOptions(token));
}

export async function deleteMailMessage(token: string, folder: string, uid: number): Promise<void> {
  await apiDeleteMailMessage(uid, { folder }, mailApiAuthOptions(token));
}

export async function moveMailMessage(
  token: string,
  fromFolder: string,
  toFolder: string,
  uid: number,
): Promise<void> {
  const { fromFolder: from, toFolder: to } = parseMoveMailPayload(fromFolder, toFolder);
  await apiMoveMailMessage(uid, { fromFolder: from, toFolder: to }, mailApiAuthOptions(token));
}

export async function sendMailMessage(token: string, payload: MailComposePayload): Promise<void> {
  const validated = parseSendMailPayload(payload);
  await apiSendMailMessage(validated, mailApiAuthOptions(token));
}
