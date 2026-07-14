/** Mail client for the IAM-authenticated local Workspace API. */

import { getWorkspaceApiBaseForCurrentInstance, workspaceApi } from "~/shared/api/client";
import { WorkspaceApiHttpError, workspaceOrvalMutator } from "~/shared/api/workspace-orval-mutator";
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
  sanitizeFolderPath,
} from "./mail-validation.lib";
import type { MailFolderClearOptions } from "./mail.lib";
import type {
  MailAttachmentMeta,
  MailBatchAction,
  MailComposeAttachment,
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

export class MailApiError extends WorkspaceApiHttpError {
  constructor(message: string, status: number, data: unknown = null) {
    super(message, status, data);
  }
}

interface WorkspaceMailFolder {
  uuid: string;
  external_user_uuid?: string | null;
  path: string;
  name: string;
  delimiter: string;
  special_use?: string | null;
  unread_count?: number;
  total_count?: number;
}

interface WorkspaceMailMessage {
  uuid: string;
  folder_uuid: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  snippet: string;
  body_html: string | null;
  body_text: string | null;
  message_id: string | null;
  reply_to: string | null;
  references: string | null;
  sent_at: string;
  seen: boolean;
  flagged: boolean;
}

interface WorkspaceMailAttachment {
  uuid: string;
  name: string;
  content_type: string;
  size_bytes: number;
}

const folderIdsByPath = new Map<string, string>();
const folderPathsById = new Map<string, string>();
const externalUserIdsByPath = new Map<string, string | null>();
const WORKSPACE_IAM_SESSION_TOKEN = "workspace-iam";

function query(params: Record<string, string | number | boolean | undefined>): string {
  const values = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) values.set(name, String(value));
  }
  const encoded = values.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return workspaceOrvalMutator<T>(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

function mapFolder(folder: WorkspaceMailFolder): MailFolder {
  folderIdsByPath.set(folder.path, folder.uuid);
  folderPathsById.set(folder.uuid, folder.path);
  externalUserIdsByPath.set(folder.path, folder.external_user_uuid ?? null);
  return {
    uuid: folder.uuid,
    path: folder.path,
    name: folder.name,
    unread: folder.unread_count ?? 0,
    total: folder.total_count ?? 0,
    specialUse: folder.special_use ?? null,
  };
}

function mapMessage(message: WorkspaceMailMessage): MailMessageDetail {
  return {
    uid: message.uuid,
    from: message.from_address,
    to: message.to_addresses,
    cc: message.cc_addresses,
    subject: message.subject,
    snippet: message.snippet,
    date: message.sent_at,
    seen: message.seen,
    flagged: message.flagged,
    bodyHtml: message.body_html,
    bodyText: message.body_text,
    messageId: message.message_id,
    replyTo: message.reply_to,
    references: message.references,
  };
}

function splitAddresses(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function getFolderId(path: string): Promise<string> {
  const cached = folderIdsByPath.get(path);
  if (cached != null) return cached;
  await fetchMailFolders("");
  const resolved = folderIdsByPath.get(path);
  if (resolved == null) throw new Error(`Mail folder not found: ${path}`);
  return resolved;
}

async function findFolderPathBySpecialUse(specialUse: string): Promise<string | null> {
  const { folders } = await fetchMailFolders("");
  return folders.find((folder) => folder.specialUse === specialUse)?.path ?? null;
}

export function createMailSession(email: string, _password?: string): Promise<MailSessionInfo> {
  return Promise.resolve({
    token: WORKSPACE_IAM_SESSION_TOKEN,
    expiresAt: new Date(8640000000000000).toISOString(),
    email,
  });
}

export async function deleteMailSession(_token?: string): Promise<void> {}

export async function exchangeMailSession(
  email: string,
  _realmUrl?: string,
  _apiKey?: string,
  _password?: string,
): Promise<MailSessionInfo> {
  return createMailSession(email);
}

export async function fetchMailFolders(_token: string): Promise<MailFoldersResult> {
  const data = await request<WorkspaceMailFolder[]>("/v1/mail/folders/");
  const folders = data.map(mapFolder);
  const delimiter =
    data.find((folder) => folder.delimiter.length > 0)?.delimiter ??
    detectMailFolderDelimiter(folders.map((folder) => folder.path));
  return { folders, delimiter };
}

export async function createMailFolder(
  _token: string,
  input: MailCreateFolderInput,
  delimiter: string,
): Promise<string> {
  const path = buildCreateFolderPath(input, delimiter);
  await fetchMailFolders("");
  const parentExternalUserUuid =
    input.parentPath == null ? null : externalUserIdsByPath.get(input.parentPath);
  const folder = await request<WorkspaceMailFolder>("/v1/mail/folders/", "POST", {
    path,
    name: input.name,
    delimiter,
    ...(parentExternalUserUuid == null ? {} : { external_user_uuid: parentExternalUserUuid }),
  });
  mapFolder(folder);
  return folder.path;
}

export async function renameMailFolder(
  _token: string,
  input: MailRenameFolderInput,
  delimiter: string,
): Promise<string> {
  const uuid = await getFolderId(input.path);
  const path = computeRenameFolderPath(input.path, input.name, delimiter);
  const folder = await request<WorkspaceMailFolder>(`/v1/mail/folders/${uuid}`, "PUT", {
    path,
    name: input.name,
  });
  folderIdsByPath.delete(input.path);
  mapFolder(folder);
  return path;
}

export async function moveMailFolder(
  _token: string,
  input: MailMoveFolderInput,
  delimiter: string,
): Promise<string> {
  const uuid = await getFolderId(input.path);
  const path = computeMoveFolderPath(input.path, input.parentPath, delimiter);
  const folder = await request<WorkspaceMailFolder>(`/v1/mail/folders/${uuid}`, "PUT", {
    path,
  });
  folderIdsByPath.delete(input.path);
  mapFolder(folder);
  return path;
}

export async function deleteMailFolder(
  _token: string,
  path: string,
  delimiter: string,
  clearOptions: MailFolderClearOptions,
): Promise<void> {
  assertDeleteFolderAllowed(path, delimiter);
  await clearMailFolder("", path, clearOptions);
  const uuid = await getFolderId(path);
  await request<void>(`/v1/mail/folders/${uuid}`, "DELETE");
  folderIdsByPath.delete(path);
  folderPathsById.delete(uuid);
}

export async function clearMailFolder(
  token: string,
  path: string,
  clearOptions: MailFolderClearOptions,
): Promise<void> {
  const { messages } = await fetchMailMessages(token, path, 1000);
  await runWithConcurrency(messages, async (message) => {
    if (clearOptions.mode === "move" && clearOptions.targetFolder != null) {
      await moveMailMessage(token, path, clearOptions.targetFolder, message.uid);
    } else {
      await deleteMailMessage(token, path, message.uid);
    }
  });
}

export async function markAllMailFolderRead(token: string, path: string): Promise<void> {
  const { messages } = await fetchMailMessages(token, path, 1000);
  await runWithConcurrency(
    messages.filter((message) => !message.seen),
    (message) => patchMailMessageFlags(token, path, message.uid, { addFlags: ["\\Seen"] }),
  );
}

export async function fetchMailMessages(
  _token: string,
  folder: string,
  limit = 50,
  _cursor?: string | null,
): Promise<{ messages: MailMessageSummary[]; nextCursor: string | null }> {
  const folderUuid = await getFolderId(folder);
  const data = await request<WorkspaceMailMessage[]>(
    `/v1/mail/messages/${query({ folder_uuid: folderUuid, page_limit: limit })}`,
  );
  return { messages: data.map(mapMessage), nextCursor: null };
}

export async function fetchMailMessage(
  token: string,
  _folder: string,
  uid: string,
  options: { markSeen?: boolean } = {},
): Promise<MailMessageDetail> {
  let message = await request<WorkspaceMailMessage>(`/v1/mail/messages/${uid}`);
  if (options.markSeen !== false && !message.seen) {
    await patchMailMessageFlags(token, "", uid, { addFlags: ["\\Seen"] });
    message = { ...message, seen: true };
  }
  return mapMessage(message);
}

export async function patchMailMessageFlags(
  _token: string,
  folder: string,
  uid: string,
  patch: MailFlagsPatch,
): Promise<void> {
  parseMessageFlagsPayload(folder || "INBOX", patch);
  const current = await request<WorkspaceMailMessage>(`/v1/mail/messages/${uid}`);
  await request(`/v1/mail/messages/${uid}`, "PUT", {
    seen: patch.addFlags?.includes("\\Seen")
      ? true
      : patch.removeFlags?.includes("\\Seen")
        ? false
        : current.seen,
    flagged: patch.addFlags?.includes("\\Flagged")
      ? true
      : patch.removeFlags?.includes("\\Flagged")
        ? false
        : current.flagged,
  });
}

export async function deleteMailMessage(
  _token: string,
  _folder: string,
  uid: string,
): Promise<void> {
  await request<void>(`/v1/mail/messages/${uid}`, "DELETE");
}

export async function moveMailMessage(
  _token: string,
  fromFolder: string,
  toFolder: string,
  uid: string,
): Promise<void> {
  parseMoveMailPayload(fromFolder, toFolder);
  const folderUuid = await getFolderId(toFolder);
  await request(`/v1/mail/messages/${uid}/actions/move/invoke`, "POST", {
    folder_uuid: folderUuid,
  });
}

async function uploadAttachments(
  messageUuid: string,
  attachments: readonly MailComposeAttachment[],
): Promise<void> {
  for (const attachment of attachments) {
    const binary = atob(attachment.contentBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const form = new FormData();
    form.set("message_uuid", messageUuid);
    form.set("file", new File([bytes], attachment.filename, { type: attachment.mimeType }));
    const response = await workspaceApi.postFormDataWithBase(
      getWorkspaceApiBaseForCurrentInstance(),
      "/v1/mail/attachments/",
      form,
    );
    if (!response.ok) {
      throw new WorkspaceApiHttpError(
        "Unable to upload mail attachment",
        response.status,
        response.data,
      );
    }
  }
}

async function createMessage(
  folder: string,
  payload: MailComposePayload,
  draft: boolean,
): Promise<MailMessageDetail> {
  const validated = draft ? parseDraftMailPayload(payload) : parseSendMailPayload(payload);
  const folderUuid = await getFolderId(folder);
  const message = await request<WorkspaceMailMessage>("/v1/mail/messages/", "POST", {
    folder_uuid: folderUuid,
    to_addresses: splitAddresses(validated.to),
    cc_addresses: splitAddresses(validated.cc),
    bcc_addresses: splitAddresses(validated.bcc),
    subject: validated.subject,
    body_html: validated.bodyHtml,
    body_text: validated.bodyText ?? "",
    reply_to: validated.inReplyTo,
    references: validated.references,
    draft,
  });
  await uploadAttachments(message.uuid, payload.attachments ?? []);
  return mapMessage(message);
}

export async function sendMailMessage(
  _token: string,
  payload: MailComposePayload,
  options: { saveToFolder?: string } = {},
): Promise<void> {
  const folder = options.saveToFolder ?? (await findFolderPathBySpecialUse("sent")) ?? "INBOX";
  const message = await createMessage(folder, payload, false);
  await request(`/v1/mail/messages/${message.uid}/actions/send/invoke`, "POST", {});
}

export async function fetchMailMessageAttachments(
  _token: string,
  _folder: string,
  uid: string,
): Promise<MailAttachmentMeta[]> {
  const data = await request<WorkspaceMailAttachment[]>(
    `/v1/mail/attachments/${query({ message_uuid: uid })}`,
  );
  return data.map((attachment) => ({
    id: attachment.uuid,
    filename: attachment.name,
    mimeType: attachment.content_type,
    sizeBytes: attachment.size_bytes,
  }));
}

export async function downloadMailMessageAttachment(
  _token: string,
  _folder: string,
  _uid: string,
  attachmentId: string,
): Promise<Blob> {
  const response = await workspaceApi.getWithBase(
    getWorkspaceApiBaseForCurrentInstance(),
    `/v1/mail/attachments/${attachmentId}/actions/download`,
  );
  if (!response.ok) {
    throw new WorkspaceApiHttpError(
      "Unable to download mail attachment",
      response.status,
      response.data,
    );
  }
  return response.raw.blob();
}

export async function searchMailMessages(
  token: string,
  search: string,
  folders: readonly string[],
): Promise<{ messages: MailMessageSummary[]; nextCursor: string | null }> {
  const normalized = search.trim().toLocaleLowerCase();
  const pages = await Promise.all(folders.map((folder) => fetchMailMessages(token, folder, 1000)));
  const messages = pages
    .flatMap((page) => page.messages)
    .filter((message) =>
      [message.from, message.subject, message.snippet].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
  return { messages, nextCursor: null };
}

export async function syncMailFolder(
  token: string,
  folder: string,
): Promise<{ newMessages: MailMessageSummary[] }> {
  const { messages } = await fetchMailMessages(token, folder);
  return { newMessages: messages };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  await Promise.all(items.map(worker));
}

export async function batchMailMessages(
  token: string,
  folder: string,
  uids: string[],
  action: MailBatchAction,
  options: {
    toFolder?: string;
    addFlags?: string[];
    removeFlags?: string[];
    trashFolder?: string;
  } = {},
): Promise<void> {
  await runWithConcurrency(uids, async (uid) => {
    if (action === "delete") {
      if (options.trashFolder != null) {
        await moveMailMessage(token, folder, options.trashFolder, uid);
      } else {
        await deleteMailMessage(token, folder, uid);
      }
    } else if (action === "move" && options.toFolder != null) {
      await moveMailMessage(token, folder, options.toFolder, uid);
    } else {
      await patchMailMessageFlags(token, folder, uid, options);
    }
  });
}

export async function createMailDraft(
  _token: string,
  folder: string,
  payload: MailComposePayload,
): Promise<MailMessageDetail> {
  return createMessage(sanitizeFolderPath(folder), payload, true);
}

export async function updateMailDraft(
  _token: string,
  _folder: string,
  uid: string,
  payload: MailComposePayload,
): Promise<MailMessageDetail> {
  const validated = parseDraftMailPayload(payload);
  const message = await request<WorkspaceMailMessage>(`/v1/mail/messages/${uid}`, "PUT", {
    to_addresses: splitAddresses(validated.to),
    cc_addresses: splitAddresses(validated.cc),
    bcc_addresses: splitAddresses(validated.bcc),
    subject: validated.subject,
    body_html: validated.bodyHtml,
    body_text: validated.bodyText ?? "",
    reply_to: validated.inReplyTo,
    references: validated.references,
    draft: true,
  });
  return mapMessage(message);
}

export async function deleteMailDraft(token: string, folder: string, uid: string): Promise<void> {
  await deleteMailMessage(token, folder, uid);
}

export async function sendMailDraft(
  _token: string,
  _folder: string,
  uid: string,
  _options: { saveToFolder?: string } = {},
): Promise<void> {
  await request(`/v1/mail/messages/${uid}/actions/send/invoke`, "POST", {});
}
