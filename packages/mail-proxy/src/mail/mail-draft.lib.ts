/**
 * IMAP draft transport — APPEND with \\Draft flag.
 */

import {
  appendMailMessage,
  deleteMailMessage,
  listMailMessages,
} from "./imap.lib";
import { buildOutboundMime } from "./mime.lib";
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
  folder: string,
  payload: DraftMailPayload,
): Promise<{ uid: number; folder: string }> {
  const rawMime = await buildDraftMime(session, payload);
  await appendMailMessage(session, folder, rawMime, ["\\Draft", "\\Seen"]);
  const messages = await listMailMessages(session, folder, 1, null);
  const latest = messages[0];
  if (latest == null) {
    throw new Error("Draft created but could not be located");
  }
  return { uid: latest.uid, folder };
}

export async function updateMailDraft(
  session: MailSessionRecord,
  folder: string,
  uid: number,
  payload: DraftMailPayload,
): Promise<{ uid: number; folder: string }> {
  await deleteMailMessage(session, folder, uid);
  return createMailDraft(session, folder, payload);
}

export async function deleteMailDraft(
  session: MailSessionRecord,
  folder: string,
  uid: number,
): Promise<void> {
  await deleteMailMessage(session, folder, uid);
}
