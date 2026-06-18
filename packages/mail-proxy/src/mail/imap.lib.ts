/**
 * IMAP operations via ImapFlow against Mailcow Dovecot.
 */

import type { Readable } from "node:stream";
import { ImapFlow } from "imapflow";
import {
  logMimeDetailRow,
  logMimeListComplete,
  logMimeListRow,
  logMimeSourceDownloadFailed,
} from "./debug.lib";
import { mailProxyEnv } from "../shared/env.lib";
import {
  buildMailSnippet,
  decodeMailHeaderValue,
  normalizeMailSourceBuffer,
  parseMailMimeSource,
  parseRawHeaderFields,
  readStreamToBuffer,
  resolveMailFrom,
  resolveMailSubject,
} from "./mime.lib";
import type { MailSessionRecord } from "../shared/session/session.lib";

export interface MailFolderDto {
  path: string;
  name: string;
  unread: number;
  total: number;
}

export interface MailMessageSummaryDto {
  uid: number;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  seen: boolean;
  flagged: boolean;
}

export interface MailMessageDetailDto extends MailMessageSummaryDto {
  bodyHtml: string | null;
  bodyText: string | null;
  messageId: string | null;
  replyTo: string | null;
  to: string[];
  cc: string[];
  references: string | null;
}

export interface MailMessageFlagsPatch {
  add?: string[];
  remove?: string[];
}

const TRASH_FOLDER_CANDIDATES = ["Trash", "INBOX.Trash", "Deleted", "INBOX.Deleted"] as const;
const SENT_FOLDER_CANDIDATES = ["Sent", "INBOX.Sent", "Sent Messages", "INBOX.Sent Messages"] as const;

function tlsOptions() {
  return { rejectUnauthorized: mailProxyEnv.TLS_REJECT_UNAUTHORIZED };
}

function createImapClient(session: MailSessionRecord): ImapFlow {
  return new ImapFlow({
    host: mailProxyEnv.IMAP_HOST,
    port: mailProxyEnv.IMAP_PORT,
    secure: true,
    auth: {
      user: session.email,
      pass: session.password,
    },
    tls: tlsOptions(),
    logger: false,
  });
}

function formatAddress(envelope: { from?: { name?: string; address?: string }[] } | undefined): string {
  const first = envelope?.from?.[0];
  if (!first) return "";
  const name = decodeMailHeaderValue(first.name?.trim()) ?? first.name?.trim() ?? "";
  const address = first.address?.trim() ?? "";
  if (name.length > 0 && address.length > 0) return `${name} <${address}>`;
  return address || name;
}

function extractHeaderFields(msg: { headers?: Buffer | false } | null | undefined): Record<string, string> {
  const headers = normalizeMailSourceBuffer(msg?.headers ?? null);
  return parseRawHeaderFields(headers);
}

async function loadMessageSource(
  client: ImapFlow,
  uid: number,
  initialSource: unknown,
): Promise<{ buffer: Buffer | null; loadedVia: "fetch" | "download" | "none" }> {
  const fromFetch = normalizeMailSourceBuffer(
    initialSource as Buffer | Uint8Array | string | false | null | undefined,
  );
  if (fromFetch != null) {
    return { buffer: fromFetch, loadedVia: "fetch" };
  }

  try {
    const downloaded = await client.download(String(uid), false, { uid: true });
    const content = downloaded.content as Readable | undefined;
    if (content != null) {
      const buffer = await readStreamToBuffer(content);
      if (buffer.length > 0) {
        return { buffer, loadedVia: "download" };
      }
    }
  } catch (error) {
    logMimeSourceDownloadFailed(uid, error);
  }

  return { buffer: null, loadedVia: "none" };
}

export function resolveFolderByCandidates(
  folders: readonly MailFolderDto[],
  candidates: readonly string[],
): string | null {
  const paths = new Set(folders.map((folder) => folder.path));
  for (const candidate of candidates) {
    if (paths.has(candidate)) return candidate;
  }
  const lowerMap = new Map(folders.map((folder) => [folder.path.toLowerCase(), folder.path]));
  for (const candidate of candidates) {
    const match = lowerMap.get(candidate.toLowerCase());
    if (match != null) return match;
  }
  return null;
}

export function isTrashFolderPath(folder: string): boolean {
  const lower = folder.toLowerCase();
  return lower === "trash" || lower.endsWith(".trash") || lower === "deleted";
}

export async function listMailFolders(
  session: MailSessionRecord,
): Promise<{ folders: MailFolderDto[]; delimiter: string }> {
  const client = createImapClient(session);
  await client.connect();
  try {
    const mailboxes = await client.list();
    let delimiter = ".";
    const folders: MailFolderDto[] = [];
    for (const mailbox of mailboxes) {
      if (mailbox.path == null) continue;
      if (typeof mailbox.delimiter === "string" && mailbox.delimiter.length > 0) {
        delimiter = mailbox.delimiter;
      }
      const status = await client.status(mailbox.path, { unseen: true, messages: true });
      folders.push({
        path: mailbox.path,
        name: mailbox.name ?? mailbox.path,
        unread: status.unseen ?? 0,
        total: status.messages ?? 0,
      });
    }
    return {
      folders: folders.sort((a, b) => a.path.localeCompare(b.path)),
      delimiter,
    };
  } finally {
    await client.logout();
  }
}

export async function listMailMessages(
  session: MailSessionRecord,
  folder: string,
  limit: number,
  cursorUid: number | null,
): Promise<MailMessageSummaryDto[]> {
  const client = createImapClient(session);
  await client.connect();
  const lock = await client.getMailboxLock(folder);
  try {
    const status = await client.status(folder, { uidNext: true });
    const maxUid = (status.uidNext ?? 2) - 1;
    if (maxUid < 1) return [];

    const upperUid = cursorUid != null && cursorUid > 0 ? cursorUid - 1 : maxUid;
    if (upperUid < 1) return [];

    const lowerUid = Math.max(1, upperUid - limit + 1);
    const range = `${lowerUid}:${upperUid}`;

    const messages: MailMessageSummaryDto[] = [];
    let debugLogged = 0;
    for await (const msg of client.fetch(
      range,
      { uid: true, envelope: true, flags: true, headers: ["Subject", "From"] },
      { uid: true },
    )) {
      const uid = msg.uid;
      if (uid == null) continue;
      const envelope = msg.envelope;
      const headerFields = extractHeaderFields(msg);
      const envelopeFrom = formatAddress(envelope);
      const resolvedFrom = resolveMailFrom(null, envelopeFrom, headerFields.from);
      const resolvedSubject = resolveMailSubject(null, envelope?.subject, headerFields.subject);

      logMimeListRow(
        {
          folder,
          uid,
          headers: msg.headers,
          headerSubject: headerFields.subject,
          headerFrom: headerFields.from,
          envelopeSubject: envelope?.subject,
          envelopeFrom,
          resolvedSubject,
          resolvedFrom,
        },
        debugLogged,
      );
      debugLogged += 1;

      messages.push({
        uid,
        from: resolvedFrom,
        subject: resolvedSubject,
        snippet: "",
        date: envelope?.date?.toISOString() ?? new Date().toISOString(),
        seen: msg.flags?.has("\\Seen") ?? false,
        flagged: msg.flags?.has("\\Flagged") ?? false,
      });
    }
    logMimeListComplete(folder, messages.length, debugLogged);
    return messages.sort((a, b) => b.uid - a.uid);
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function getMailMessage(
  session: MailSessionRecord,
  folder: string,
  uid: number,
  options: { markSeen?: boolean } = {},
): Promise<MailMessageDetailDto | null> {
  const markSeen = options.markSeen !== false;
  const client = createImapClient(session);
  await client.connect();
  const lock = await client.getMailboxLock(folder);
  try {
    const msg = await client.fetchOne(
      String(uid),
      {
        uid: true,
        envelope: true,
        flags: true,
        source: true,
        headers: ["Subject", "From", "To", "Cc", "Reply-To", "Message-ID", "References"],
      },
      { uid: true },
    );
    if (!msg || msg.uid == null) return null;
    const envelope = msg.envelope;
    const headerFields = extractHeaderFields(msg);
    const wasSeen = msg.flags?.has("\\Seen") ?? false;
    if (markSeen && !wasSeen) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    }
    const rawSource = await loadMessageSource(client, msg.uid, msg.source);
    const parsed = await parseMailMimeSource(rawSource.buffer);
    const envelopeFrom = formatAddress(envelope);
    const resolvedFrom = resolveMailFrom(parsed.from, envelopeFrom, headerFields.from);
    const resolvedSubject = resolveMailSubject(parsed.subject, envelope?.subject, headerFields.subject);
    const flagged = msg.flags?.has("\\Flagged") ?? false;

    logMimeDetailRow({
      folder,
      uid: msg.uid,
      source: msg.source,
      sourceLoadedVia: rawSource.loadedVia,
      sourceBuffer: rawSource.buffer,
      headers: msg.headers,
      headerSubject: headerFields.subject,
      headerFrom: headerFields.from,
      envelopeSubject: envelope?.subject,
      envelopeFrom,
      parsedSubject: parsed.subject,
      parsedFrom: parsed.from,
      resolvedSubject,
      resolvedFrom,
      bodyText: parsed.text,
      bodyHtml: parsed.html,
    });

    return {
      uid: msg.uid,
      from: resolvedFrom,
      subject: resolvedSubject,
      snippet: buildMailSnippet(parsed.text, parsed.html),
      date: envelope?.date?.toISOString() ?? new Date().toISOString(),
      seen: markSeen ? true : wasSeen,
      flagged,
      bodyHtml: parsed.html,
      bodyText: parsed.text,
      messageId: parsed.messageId ?? headerFields["message-id"] ?? null,
      replyTo: parsed.replyTo ?? headerFields["reply-to"] ?? null,
      to: parsed.to.length > 0 ? parsed.to : splitHeaderAddresses(headerFields.to),
      cc: parsed.cc.length > 0 ? parsed.cc : splitHeaderAddresses(headerFields.cc),
      references: parsed.references ?? headerFields.references ?? null,
    };
  } finally {
    lock.release();
    await client.logout();
  }
}

function splitHeaderAddresses(value: string | undefined): string[] {
  if (value == null || value.trim().length === 0) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export async function moveMailMessage(
  session: MailSessionRecord,
  fromFolder: string,
  toFolder: string,
  uid: number,
): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  const lock = await client.getMailboxLock(fromFolder);
  try {
    await client.messageMove(String(uid), toFolder, { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function deleteMailMessage(
  session: MailSessionRecord,
  folder: string,
  uid: number,
  trashFolder: string | null,
): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  const lock = await client.getMailboxLock(folder);
  try {
    if (!isTrashFolderPath(folder) && trashFolder != null) {
      await client.messageMove(String(uid), trashFolder, { uid: true });
      return;
    }
    await client.messageDelete(String(uid), { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function updateMailMessageFlags(
  session: MailSessionRecord,
  folder: string,
  uid: number,
  patch: MailMessageFlagsPatch,
): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  const lock = await client.getMailboxLock(folder);
  try {
    const uidStr = String(uid);
    if (patch.add != null && patch.add.length > 0) {
      await client.messageFlagsAdd(uidStr, patch.add, { uid: true });
    }
    if (patch.remove != null && patch.remove.length > 0) {
      await client.messageFlagsRemove(uidStr, patch.remove, { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function createMailFolder(session: MailSessionRecord, path: string): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  try {
    await client.mailboxCreate(path);
  } finally {
    await client.logout();
  }
}

export async function renameMailFolder(
  session: MailSessionRecord,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  try {
    await client.mailboxRename(fromPath, toPath);
  } finally {
    await client.logout();
  }
}

async function clearMailFolderMessages(
  session: MailSessionRecord,
  folder: string,
  trashFolder: string | null,
): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  const lock = await client.getMailboxLock(folder);
  try {
    const status = await client.status(folder, { messages: true });
    if ((status.messages ?? 0) < 1) return;
    if (isTrashFolderPath(folder) || trashFolder == null) {
      await client.messageDelete("1:*", { uid: true });
      return;
    }
    await client.messageMove("1:*", trashFolder, { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function clearMailFolder(
  session: MailSessionRecord,
  folder: string,
  trashFolder: string | null,
): Promise<void> {
  await clearMailFolderMessages(session, folder, trashFolder);
}

export async function markAllMailFolderRead(session: MailSessionRecord, folder: string): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  const lock = await client.getMailboxLock(folder);
  try {
    const status = await client.status(folder, { messages: true });
    if ((status.messages ?? 0) < 1) return;
    await client.messageFlagsAdd("1:*", ["\\Seen"], { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

async function deleteMailFolderMailbox(session: MailSessionRecord, path: string): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  try {
    await client.mailboxDelete(path);
  } finally {
    await client.logout();
  }
}

export async function deleteMailFolder(
  session: MailSessionRecord,
  path: string,
  delimiter: string,
  trashFolder: string | null,
): Promise<void> {
  const { folders } = await listMailFolders(session);
  const descendantPaths = folders
    .map((folder) => folder.path)
    .filter((candidate) => candidate !== path && candidate.startsWith(`${path}${delimiter}`))
    .sort((a, b) => b.split(delimiter).length - a.split(delimiter).length);

  for (const childPath of descendantPaths) {
    await clearMailFolderMessages(session, childPath, trashFolder);
    await deleteMailFolderMailbox(session, childPath);
  }
  await clearMailFolderMessages(session, path, trashFolder);
  await deleteMailFolderMailbox(session, path);
}

export async function appendMailMessage(
  session: MailSessionRecord,
  folder: string,
  rawMime: Buffer,
  flags: string[] = ["\\Seen"],
): Promise<void> {
  const client = createImapClient(session);
  await client.connect();
  try {
    await client.append(folder, rawMime, flags, new Date());
  } finally {
    await client.logout();
  }
}

export async function resolveTrashFolder(session: MailSessionRecord): Promise<string | null> {
  const { folders } = await listMailFolders(session);
  return resolveFolderByCandidates(folders, TRASH_FOLDER_CANDIDATES);
}

export async function resolveSentFolder(session: MailSessionRecord): Promise<string | null> {
  const { folders } = await listMailFolders(session);
  return resolveFolderByCandidates(folders, SENT_FOLDER_CANDIDATES);
}

/** Verifies IMAP credentials without creating a persistent session record. */
export async function verifyImapCredentials(email: string, password: string): Promise<void> {
  const client = createImapClient({ token: "", email, password, createdAt: 0, expiresAt: 0 });
  await client.connect();
  await client.logout();
}
