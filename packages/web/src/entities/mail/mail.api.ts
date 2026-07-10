/**
 * Mail REST client — thin wrapper over Orval-generated @mail/api client.
 */

import {
  clearMailFolder as apiClearMailFolder,
  createMailDraft as apiCreateMailDraft,
  createMailFolder as apiCreateMailFolder,
  createMailSession as apiCreateMailSession,
  deleteMailDraft as apiDeleteMailDraft,
  deleteMailFolder as apiDeleteMailFolder,
  deleteMailMessage as apiDeleteMailMessage,
  deleteMailSession as apiDeleteMailSession,
  exchangeMailSession as apiExchangeMailSession,
  getMailMessage as apiGetMailMessage,
  getMailMessageAttachment as apiGetMailMessageAttachment,
  listMailFolders as apiListMailFolders,
  listMailMessageAttachments as apiListMailMessageAttachments,
  listMailMessages as apiListMailMessages,
  listMailMessagesSince as apiListMailMessagesSince,
  markAllMailFolderRead as apiMarkAllMailFolderRead,
  moveMailFolder as apiMoveMailFolder,
  moveMailMessage as apiMoveMailMessage,
  patchMailMessageFlags as apiPatchMailMessageFlags,
  renameMailFolder as apiRenameMailFolder,
  searchMailMessages as apiSearchMailMessages,
  sendMailMessage as apiSendMailMessage,
  updateMailDraft as apiUpdateMailDraft,
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
  parseDraftMailPayload,
  parseMessageFlagsPayload,
  parseMoveMailPayload,
  parseSendMailPayload,
  parseSessionPayload,
  sanitizeFolderPath,
} from "./mail-validation.lib";
import type { MailFolderClearOptions } from "./mail.lib";
import type {
  MailAttachmentMeta,
  MailBatchAction,
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

const BATCH_CONCURRENCY = 8;

async function runWithConcurrency<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]!;
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

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
  clearOptions: MailFolderClearOptions,
): Promise<void> {
  assertDeleteFolderAllowed(path, delimiter);
  await apiDeleteMailFolder(
    {
      path,
      delimiter,
      clearMode: clearOptions.mode,
      ...(clearOptions.targetFolder != null ? { targetFolder: clearOptions.targetFolder } : {}),
    },
    {
      path,
      delimiter,
      clearMode: clearOptions.mode,
      ...(clearOptions.targetFolder != null ? { targetFolder: clearOptions.targetFolder } : {}),
    },
    mailApiAuthOptions(token),
  );
}

export async function clearMailFolder(
  token: string,
  path: string,
  clearOptions: MailFolderClearOptions,
): Promise<void> {
  await apiClearMailFolder(
    {
      path: sanitizeFolderPath(path),
      mode: clearOptions.mode,
      ...(clearOptions.targetFolder != null ? { targetFolder: clearOptions.targetFolder } : {}),
    },
    mailApiAuthOptions(token),
  );
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

export async function sendMailMessage(
  token: string,
  payload: MailComposePayload,
  options: { saveToFolder?: string } = {},
): Promise<void> {
  const validated = parseSendMailPayload(payload);
  await apiSendMailMessage(
    {
      ...validated,
      ...(options.saveToFolder != null ? { saveToFolder: options.saveToFolder } : {}),
    },
    mailApiAuthOptions(token),
  );
}

export async function exchangeMailSession(
  email: string,
  realmUrl: string,
  apiKey: string,
  password?: string,
): Promise<MailSessionInfo> {
  const data = await apiExchangeMailSession({ email, realmUrl, apiKey, password });
  return {
    token: data.sessionToken,
    expiresAt: data.expiresAt,
    email: data.email,
  };
}

export async function fetchMailMessageAttachments(
  token: string,
  folder: string,
  uid: number,
): Promise<MailAttachmentMeta[]> {
  const data = await apiListMailMessageAttachments(uid, { folder }, mailApiAuthOptions(token));
  return Array.isArray(data.attachments) ? data.attachments : [];
}

export async function downloadMailMessageAttachment(
  token: string,
  folder: string,
  uid: number,
  attachmentId: string,
): Promise<Blob> {
  return apiGetMailMessageAttachment(uid, attachmentId, { folder }, mailApiAuthOptions(token));
}

export async function searchMailMessages(
  token: string,
  query: string,
  folders: readonly string[],
  limit = 50,
  cursor?: string | null,
): Promise<{ messages: MailMessageSummary[]; nextCursor: string | null }> {
  const data = await apiSearchMailMessages(
    {
      q: query,
      folders: folders.map((folder) => sanitizeFolderPath(folder)).join(","),
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

export async function syncMailFolder(
  token: string,
  folder: string,
  sinceUid: number,
): Promise<{ newMessages: MailMessageSummary[] }> {
  const data = await apiListMailMessagesSince({ folder, sinceUid }, mailApiAuthOptions(token));
  return {
    newMessages: Array.isArray(data.messages) ? data.messages : [],
  };
}

export async function batchMailMessages(
  token: string,
  folder: string,
  uids: number[],
  action: MailBatchAction,
  options: {
    toFolder?: string;
    addFlags?: string[];
    removeFlags?: string[];
    trashFolder?: string;
  } = {},
): Promise<void> {
  await runWithConcurrency(
    uids,
    async (uid) => {
      if (action === "delete") {
        if (options.trashFolder != null && options.trashFolder.length > 0) {
          await moveMailMessage(token, folder, options.trashFolder, uid);
          return;
        }
        await deleteMailMessage(token, folder, uid);
        return;
      }
      if (action === "move") {
        if (options.toFolder == null || options.toFolder.length === 0) {
          throw new Error("toFolder is required for move");
        }
        await moveMailMessage(token, folder, options.toFolder, uid);
        return;
      }
      await patchMailMessageFlags(token, folder, uid, {
        addFlags: options.addFlags,
        removeFlags: options.removeFlags,
      });
    },
    BATCH_CONCURRENCY,
  );
}

export async function createMailDraft(
  token: string,
  folder: string,
  payload: MailComposePayload,
): Promise<MailMessageDetail> {
  const validated = parseDraftMailPayload(payload);
  const data = await apiCreateMailDraft(
    { ...validated, folder: sanitizeFolderPath(folder) },
    mailApiAuthOptions(token),
  );
  return data.message;
}

export async function updateMailDraft(
  token: string,
  folder: string,
  uid: number,
  payload: MailComposePayload,
): Promise<MailMessageDetail> {
  const validated = parseDraftMailPayload(payload);
  const data = await apiUpdateMailDraft(
    uid,
    { ...validated, folder: sanitizeFolderPath(folder) },
    mailApiAuthOptions(token),
  );
  return data.message;
}

export async function deleteMailDraft(token: string, folder: string, uid: number): Promise<void> {
  await apiDeleteMailDraft(uid, { folder: sanitizeFolderPath(folder) }, mailApiAuthOptions(token));
}

export async function sendMailDraft(
  token: string,
  folder: string,
  uid: number,
  options: { saveToFolder?: string } = {},
): Promise<void> {
  const message = await fetchMailMessage(token, folder, uid, { markSeen: true });
  await sendMailMessage(
    token,
    {
      to: message.to.join(", ") || message.from,
      cc: message.cc.length > 0 ? message.cc.join(", ") : undefined,
      subject: message.subject,
      bodyHtml: message.bodyHtml ?? message.bodyText ?? "",
      bodyText: message.bodyText ?? undefined,
      inReplyTo: message.messageId ?? undefined,
      references: message.references ?? undefined,
    },
    options,
  );
  await deleteMailDraft(token, folder, uid);
}
