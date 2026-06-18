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
import { detectMailFolderDelimiter } from "./mail-folder-tree.lib";
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
  const data = await apiCreateMailSession({ email, password });
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
  const data = await apiCreateMailFolder(
    {
      name: input.name,
      parentPath: input.parentPath ?? "",
      delimiter,
    },
    mailApiAuthOptions(token),
  );
  return data.path;
}

export async function renameMailFolder(
  token: string,
  input: MailRenameFolderInput,
  delimiter: string,
): Promise<string> {
  const data = await apiRenameMailFolder({ ...input, delimiter }, mailApiAuthOptions(token));
  return data.path;
}

export async function moveMailFolder(
  token: string,
  input: MailMoveFolderInput,
  delimiter: string,
): Promise<string> {
  const data = await apiMoveMailFolder({ ...input, delimiter }, mailApiAuthOptions(token));
  return data.path;
}

export async function deleteMailFolder(
  token: string,
  path: string,
  delimiter: string,
): Promise<void> {
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
  await apiPatchMailMessageFlags(uid, { folder, ...patch }, mailApiAuthOptions(token));
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
  await apiMoveMailMessage(uid, { fromFolder, toFolder }, mailApiAuthOptions(token));
}

export async function sendMailMessage(token: string, payload: MailComposePayload): Promise<void> {
  await apiSendMailMessage(payload, mailApiAuthOptions(token));
}
