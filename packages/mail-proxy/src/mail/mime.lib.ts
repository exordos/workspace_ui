/**
 * MIME decoding for raw IMAP message sources (quoted-printable, base64, charsets).
 */

import { createRequire } from "node:module";
import type { Readable } from "node:stream";
import { simpleParser } from "mailparser";

const require = createRequire(import.meta.url);
const libmime = require("libmime") as { decodeWords: (value: string) => string };
const { decode: decodeQuotedPrintable } = require("libqp") as {
  decode: (value: string) => Buffer;
};

export interface ParsedMailContent {
  text: string | null;
  html: string | null;
  subject: string | null;
  from: string | null;
  messageId: string | null;
  replyTo: string | null;
  to: string[];
  cc: string[];
  references: string | null;
}

export interface ParsedMailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
}

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function normalizeBody(value: string | false | undefined): string | null {
  if (value == null || value === false) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function countQuotedPrintableTokens(value: string): number {
  return (value.match(/=[0-9A-Fa-f]{2}/g) ?? []).length;
}

function hasCyrillic(value: string): boolean {
  return /[\u0400-\u04FF]/.test(value);
}

/** True when a string still looks like undecoded quoted-printable (=D0=9F…). */
export function looksLikeUndecodedQuotedPrintable(value: string): boolean {
  if (!/=[0-9A-Fa-f]{2}/.test(value)) return false;
  if (hasCyrillic(value)) return false;
  const tokens = value.match(/=[0-9A-Fa-f]{2}/g);
  return tokens != null && tokens.length >= 2;
}

/** Decodes a quoted-printable UTF-8 string (headers or malformed plain text). */
export function decodeQuotedPrintableUtf8(value: string): string {
  try {
    const bytes = decodeQuotedPrintable(value.replace(/\r?\n/g, ""));
    return bytes.toString("utf8");
  } catch {
    return value;
  }
}

/** Decodes =XX runs embedded in HTML or plain text (SOGo sometimes leaves these in HTML). */
export function decodeEmbeddedQuotedPrintableRuns(value: string): string {
  if (!/=[0-9A-Fa-f]{2}/.test(value)) return value;
  return value.replace(/(?:=[0-9A-Fa-f]{2})+/g, (segment) => {
    if (segment.length < 6) return segment;
    try {
      const decoded = decodeQuotedPrintableUtf8(segment);
      if (decoded.includes("\uFFFD")) return segment;
      return decoded;
    } catch {
      return segment;
    }
  });
}

/**
 * Decodes mail header values: RFC2047 encoded-words and raw quoted-printable
 * (some MTAs emit =D0=9F… in Subject without =?utf-8?q?…?= wrappers).
 */
export function decodeMailHeaderValue(value: string | undefined | null): string | null {
  if (value == null) return null;
  let trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.includes("=?")) {
    try {
      trimmed = libmime.decodeWords(trimmed).trim();
    } catch {
      /* keep original on decode failure */
    }
  }

  if (looksLikeUndecodedQuotedPrintable(trimmed)) {
    trimmed = decodeQuotedPrintableUtf8(trimmed);
  }

  if (/=[0-9A-Fa-f]{2}/.test(trimmed) && !hasCyrillic(trimmed)) {
    trimmed = decodeEmbeddedQuotedPrintableRuns(trimmed);
  }

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMailTextBody(value: string | false | undefined): string | null {
  const normalized = normalizeBody(value);
  if (normalized == null) return null;
  if (looksLikeUndecodedQuotedPrintable(normalized)) {
    return decodeQuotedPrintableUtf8(normalized);
  }
  if (/=[0-9A-Fa-f]{2}/.test(normalized) && !hasCyrillic(normalized)) {
    return decodeEmbeddedQuotedPrintableRuns(normalized);
  }
  return normalized;
}

function normalizeMailHtmlBody(value: string | false | undefined): string | null {
  const normalized = normalizeBody(value);
  if (normalized == null) return null;
  if (/=[0-9A-Fa-f]{2}/.test(normalized) && !hasCyrillic(normalized)) {
    return decodeEmbeddedQuotedPrintableRuns(normalized);
  }
  return normalized;
}

export function normalizeMailSourceBuffer(
  source: Buffer | Uint8Array | string | false | null | undefined,
): Buffer | null {
  if (source == null || source === false) return null;
  if (Buffer.isBuffer(source)) return source.length > 0 ? source : null;
  if (source instanceof Uint8Array) return source.length > 0 ? Buffer.from(source) : null;
  if (typeof source === "string") return source.length > 0 ? Buffer.from(source, "binary") : null;
  return null;
}

/** Parses RFC822 header block into lowercase field map (handles folded headers). */
export function parseRawHeaderFields(headers: Buffer | string | null | undefined): Record<string, string> {
  if (headers == null) return {};
  const text = Buffer.isBuffer(headers) ? headers.toString("utf8") : headers;
  if (text.trim().length === 0) return {};

  const result: Record<string, string> = {};
  let currentKey: string | null = null;
  let currentValue = "";

  for (const line of text.split(/\r?\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && currentKey != null) {
      currentValue += ` ${line.trim()}`;
      continue;
    }
    if (currentKey != null) {
      result[currentKey] = currentValue.trim();
    }
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) {
      currentKey = null;
      currentValue = "";
      continue;
    }
    currentKey = line.slice(0, colonIndex).trim().toLowerCase();
    currentValue = line.slice(colonIndex + 1).trim();
  }

  if (currentKey != null) {
    result[currentKey] = currentValue.trim();
  }

  return result;
}

function scoreReadableMailText(value: string | null | undefined): number {
  if (value == null || value.trim().length === 0) return -1;
  const qpTokens = countQuotedPrintableTokens(value);
  const cyrillic = hasCyrillic(value) ? 10 : 0;
  const mimeMarkers = value.includes("=?") ? -8 : 0;
  const brokenQuote = /^"[^"\n]*$/.test(value) ? -6 : 0;
  return cyrillic - qpTokens * 3 + mimeMarkers + brokenQuote + value.length * 0.01;
}

function looksBrokenMailHeader(value: string): boolean {
  if (value.includes("=?")) return true;
  if (looksLikeUndecodedQuotedPrintable(value)) return true;
  if (/^"[^"\n]*$/.test(value)) return true;
  return false;
}

function pickBestReadableMailText(...candidates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const decoded = candidate != null ? decodeMailHeaderValue(candidate) : null;
    if (decoded == null || looksBrokenMailHeader(decoded)) continue;
    const score = scoreReadableMailText(decoded);
    if (score > bestScore) {
      bestScore = score;
      best = decoded;
    }
  }
  return best;
}

/** Parses a full RFC822/MIME message buffer into decoded headers and bodies. */
export async function parseMailMimeSource(
  source: Buffer | Uint8Array | string | false | null | undefined,
): Promise<ParsedMailContent> {
  const buffer = normalizeMailSourceBuffer(source);
  if (buffer == null) {
    return {
      text: null,
      html: null,
      subject: null,
      from: null,
      messageId: null,
      replyTo: null,
      to: [],
      cc: [],
      references: null,
    };
  }

  const parsed = await simpleParser(buffer, { defaultCharset: "utf-8" });
  return {
    text: normalizeMailTextBody(parsed.text),
    html: normalizeMailHtmlBody(parsed.html),
    subject: decodeMailHeaderValue(parsed.subject),
    from:
      decodeMailHeaderValue(parsed.from?.text?.trim()) ??
      (parsed.from?.text?.trim() || null),
    messageId: parsed.messageId?.trim() || null,
    replyTo: formatAddressObject(parsed.replyTo) ?? null,
    to: formatAddressList(parsed.to),
    cc: formatAddressList(parsed.cc),
    references: formatReferences(parsed.references),
  };
}

/** Parses attachment metadata and content from a raw MIME message. */
export async function parseMailAttachments(
  source: Buffer | Uint8Array | string | false | null | undefined,
): Promise<ParsedMailAttachment[]> {
  const buffer = normalizeMailSourceBuffer(source);
  if (buffer == null) return [];

  const parsed = await simpleParser(buffer, { defaultCharset: "utf-8" });
  const attachments = parsed.attachments ?? [];
  const result: ParsedMailAttachment[] = [];

  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index]!;
    const content = attachment.content;
    if (content == null || content.length === 0) continue;
    if (content.length > MAX_ATTACHMENT_BYTES) continue;
    const filename =
      decodeMailHeaderValue(attachment.filename) ??
      attachment.filename ??
      `attachment-${index + 1}`;
    result.push({
      id: String(index),
      filename,
      mimeType: attachment.contentType ?? "application/octet-stream",
      sizeBytes: content.length,
      content: Buffer.isBuffer(content) ? content : Buffer.from(content),
    });
  }

  return result;
}

function formatAddressEntry(entry: { name?: string; address?: string }): string {
  const name = decodeMailHeaderValue(entry.name?.trim()) ?? entry.name?.trim() ?? "";
  const address = entry.address?.trim() ?? "";
  if (name.length > 0 && address.length > 0) return `${name} <${address}>`;
  return address || name;
}

function formatAddressList(
  value: { value?: { name?: string; address?: string }[]; text?: string } | undefined,
): string[] {
  if (value?.value != null && value.value.length > 0) {
    return value.value.map(formatAddressEntry).filter((item) => item.length > 0);
  }
  const text = value?.text?.trim();
  return text != null && text.length > 0 ? [text] : [];
}

function formatAddressObject(
  value: { value?: { name?: string; address?: string }[]; text?: string } | undefined,
): string | null {
  const list = formatAddressList(value);
  return list.length > 0 ? list.join(", ") : null;
}

function formatReferences(
  value: string | string[] | undefined,
): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const joined = value.filter((item) => item.trim().length > 0).join(" ");
    return joined.length > 0 ? joined : null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Strips HTML tags for multipart text alternative. */
export function buildPlainTextFallback(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface OutboundMimeOptions {
  from: string;
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

/** Builds RFC822 MIME buffer for IMAP append (Sent folder). */
export async function buildOutboundMime(options: OutboundMimeOptions): Promise<Buffer> {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const MailComposer = require("nodemailer/lib/mail-composer") as new (
    options: Record<string, unknown>,
  ) => {
    compile: () => { build: (callback: (err: Error | null, message: Buffer) => void) => void };
  };

  const text = options.bodyText ?? buildPlainTextFallback(options.bodyHtml);
  const mailOptions: Record<string, unknown> = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.bodyHtml,
    text,
    encoding: "utf-8",
  };
  if (options.cc != null && options.cc.trim().length > 0) {
    mailOptions.cc = options.cc;
  }
  if (options.bcc != null && options.bcc.trim().length > 0) {
    mailOptions.bcc = options.bcc;
  }
  if (options.attachments != null && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
    }));
  }
  const headers: Record<string, string> = {};
  if (options.inReplyTo != null && options.inReplyTo.length > 0) {
    headers["In-Reply-To"] = options.inReplyTo;
  }
  if (options.references != null && options.references.length > 0) {
    headers.References = options.references;
  }
  if (Object.keys(headers).length > 0) {
    mailOptions.headers = headers;
  }

  const composer = new MailComposer(mailOptions);
  return await new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err != null) {
        reject(err);
        return;
      }
      resolve(message);
    });
  });
}

export function buildMailSnippet(text: string | null, html: string | null): string {
  const plain =
    text ??
    (html != null
      ? html
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<[^>]+>/g, " ")
      : "");

  if (plain.length === 0) return "";
  const collapsed = plain.replace(/\s+/g, " ").trim();
  const decoded = decodeEmbeddedQuotedPrintableRuns(collapsed);
  return decoded.length > 160 ? `${decoded.slice(0, 157)}...` : decoded;
}

function resolveMailHeaderField(
  candidates: Array<string | null | undefined>,
  fallback: string,
): string {
  for (const candidate of candidates) {
    const decoded = candidate != null ? decodeMailHeaderValue(candidate) : null;
    if (decoded != null && decoded.length > 0 && !looksBrokenMailHeader(decoded)) {
      return decoded;
    }
  }
  const best = pickBestReadableMailText(...candidates);
  if (best != null) return best;
  for (const candidate of candidates) {
    const decoded = decodeMailHeaderValue(candidate);
    if (decoded != null && decoded.length > 0) return decoded;
  }
  return fallback;
}

export function resolveMailSubject(
  parsedSubject: string | null,
  envelopeSubject: string | undefined,
  rawHeaderSubject?: string | null,
): string {
  return resolveMailHeaderField(
    [rawHeaderSubject, parsedSubject, envelopeSubject],
    envelopeSubject?.trim() ?? "(no subject)",
  );
}

export function resolveMailFrom(
  parsedFrom: string | null,
  envelopeFrom: string,
  rawHeaderFrom?: string | null,
): string {
  return resolveMailHeaderField([rawHeaderFrom, parsedFrom, envelopeFrom], envelopeFrom);
}

export async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
