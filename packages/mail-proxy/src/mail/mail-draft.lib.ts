/**
 * IMAP draft operations — APPEND with \\Draft flag.
 */

import {
  appendMailMessage,
  deleteMailMessage,
  getMailMessage,
  resolveDraftsFolder,
  resolveTrashFolder,
} from "./imap.lib";
import { buildOutboundMime } from "./mime.lib";
import { sendMailMessage, type SendMailOptions } from "./smtp.lib";
import type { MailSessionRecord } from "../shared/session/session.lib";

export interface DraftMailPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

async function buildDraftMime(
  session: MailSessionRecord,
  payload: DraftMailPayload,
): Promise<Buffer> {
  return buildOutboundMime({
    from: session.email,
    to: payload.to.length > 0 ? payload.to : session.email,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    bodyHtml: payload.bodyHtml,
    bodyText: payload.bodyText,
    inReplyTo: payload.inReplyTo,
    references: payload.references,
    attachments: payload.attachments,
  });
}

export async function createMailDraft(
  session: MailSessionRecord,
  payload: DraftMailPayload,
): Promise<{ uid: number; folder: string }> {
  const draftsFolder = await resolveDraftsFolder(session);
  if (draftsFolder == null) {
    throw new Error("Drafts folder not found");
  }
  const rawMime = await buildDraftMime(session, payload);
  await appendMailMessage(session, draftsFolder, rawMime, ["\\Draft", "\\Seen"]);
  const { listMailMessages } = await import("./imap.lib");
  const messages = await listMailMessages(session, draftsFolder, 1, null);
  const latest = messages[0];
  if (latest == null) {
    throw new Error("Draft created but could not be located");
  }
  return { uid: latest.uid, folder: draftsFolder };
}

export async function updateMailDraft(
  session: MailSessionRecord,
  uid: number,
  payload: DraftMailPayload,
): Promise<{ uid: number; folder: string }> {
  const draftsFolder = await resolveDraftsFolder(session);
  if (draftsFolder == null) {
    throw new Error("Drafts folder not found");
  }
  const trashFolder = await resolveTrashFolder(session);
  await deleteMailMessage(session, draftsFolder, uid, trashFolder);
  return createMailDraft(session, payload);
}

export async function deleteMailDraft(session: MailSessionRecord, uid: number): Promise<void> {
  const draftsFolder = await resolveDraftsFolder(session);
  if (draftsFolder == null) {
    throw new Error("Drafts folder not found");
  }
  const trashFolder = await resolveTrashFolder(session);
  await deleteMailMessage(session, draftsFolder, uid, trashFolder);
}

export async function sendMailDraft(session: MailSessionRecord, uid: number): Promise<void> {
  const draftsFolder = await resolveDraftsFolder(session);
  if (draftsFolder == null) {
    throw new Error("Drafts folder not found");
  }
  const message = await getMailMessage(session, draftsFolder, uid, { markSeen: true });
  if (message == null) {
    throw new Error("Draft not found");
  }

  const sendOptions: SendMailOptions = {
    to: message.to.join(", ") || session.email,
    cc: message.cc.length > 0 ? message.cc.join(", ") : undefined,
    subject: message.subject,
    bodyHtml: message.bodyHtml ?? message.bodyText ?? "",
    bodyText: message.bodyText ?? undefined,
    inReplyTo: message.messageId ?? undefined,
    references: message.references ?? undefined,
  };
  await sendMailMessage(session, sendOptions);

  const trashFolder = await resolveTrashFolder(session);
  await deleteMailMessage(session, draftsFolder, uid, trashFolder);
}
