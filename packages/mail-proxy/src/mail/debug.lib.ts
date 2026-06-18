/**
 * Opt-in MIME / IMAP debug logging for mail-proxy (dev troubleshooting).
 *
 * Enable: MAIL_PROXY_DEBUG_MIME=1
 * Never logs passwords, tokens, or full message bodies.
 */

import { looksLikeUndecodedQuotedPrintable, normalizeMailSourceBuffer } from "./mime.lib";
import { mailProxyEnv } from "../shared/env.lib";
import { mailLog } from "../shared/logger.lib";

const PREVIEW_MAX = 120;
const LIST_DEBUG_LIMIT = 8;

export function isMailMimeDebugEnabled(): boolean {
  return mailProxyEnv.DEBUG_MIME;
}

function previewMailText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, PREVIEW_MAX)}…`;
}

function describeMailTextEncoding(value: string | null | undefined): Record<string, unknown> | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return {
    length: trimmed.length,
    preview: previewMailText(trimmed),
    hasCyrillic: /[\u0400-\u04FF]/.test(trimmed),
    hasMimeEncodedWords: trimmed.includes("=?"),
    qpTokenCount: (trimmed.match(/=[0-9A-Fa-f]{2}/g) ?? []).length,
    looksLikeUndecodedQuotedPrintable: looksLikeUndecodedQuotedPrintable(trimmed),
  };
}

function describeMailSourceInput(source: unknown): Record<string, unknown> {
  if (source == null || source === false) {
    return { present: false, type: source === false ? "false" : "null" };
  }
  if (Buffer.isBuffer(source)) {
    return { present: true, type: "Buffer", byteLength: source.length };
  }
  if (source instanceof Uint8Array) {
    return { present: true, type: "Uint8Array", byteLength: source.length };
  }
  if (typeof source === "string") {
    return { present: true, type: "string", charLength: source.length };
  }
  return { present: true, type: typeof source };
}

function describeNormalizedSource(source: unknown): Record<string, unknown> {
  const normalized = normalizeMailSourceBuffer(
    source as Buffer | Uint8Array | string | false | null | undefined,
  );
  if (normalized == null) {
    return { normalized: false };
  }
  return { normalized: true, byteLength: normalized.length };
}

function logMailMimeDebug(phase: string, data: Record<string, unknown>): void {
  if (!isMailMimeDebugEnabled()) return;
  mailLog.info(`mime-debug:${phase}`, data);
}

export interface MimeListRowDebugInput {
  folder: string;
  uid: number;
  headers: unknown;
  headerSubject: string | undefined;
  headerFrom: string | undefined;
  envelopeSubject: string | undefined;
  envelopeFrom: string;
  resolvedSubject: string;
  resolvedFrom: string;
}

export function logMimeListRow(input: MimeListRowDebugInput, index: number): void {
  if (!isMailMimeDebugEnabled() || index >= LIST_DEBUG_LIMIT) return;
  logMailMimeDebug("list-message", {
    folder: input.folder,
    uid: input.uid,
    headersPresent: describeNormalizedSource(input.headers).normalized === true,
    headersRaw: describeMailTextEncoding(input.headerSubject),
    headerFrom: describeMailTextEncoding(input.headerFrom),
    envelopeSubject: describeMailTextEncoding(input.envelopeSubject),
    envelopeFrom: describeMailTextEncoding(input.envelopeFrom),
    resolvedSubject: describeMailTextEncoding(input.resolvedSubject),
    resolvedFrom: describeMailTextEncoding(input.resolvedFrom),
  });
}

export function logMimeListComplete(folder: string, count: number, logged: number): void {
  logMailMimeDebug("list-complete", { folder, count, logged });
}

export interface MimeDetailRowDebugInput {
  folder: string;
  uid: number;
  source: unknown;
  sourceLoadedVia: string;
  sourceBuffer: unknown;
  headers: unknown;
  headerSubject: string | undefined;
  headerFrom: string | undefined;
  envelopeSubject: string | undefined;
  envelopeFrom: string;
  parsedSubject: string | null;
  parsedFrom: string | null;
  resolvedSubject: string;
  resolvedFrom: string;
  bodyText: string | null;
  bodyHtml: string | null;
}

export function logMimeDetailRow(input: MimeDetailRowDebugInput): void {
  if (!isMailMimeDebugEnabled()) return;
  logMailMimeDebug("detail-message", {
    folder: input.folder,
    uid: input.uid,
    sourceFetch: describeMailSourceInput(input.source),
    sourceLoadedVia: input.sourceLoadedVia,
    sourceNormalized: describeNormalizedSource(input.sourceBuffer),
    headersPresent: describeNormalizedSource(input.headers).normalized === true,
    headerSubjectRaw: describeMailTextEncoding(input.headerSubject),
    headerFromRaw: describeMailTextEncoding(input.headerFrom),
    envelopeSubject: describeMailTextEncoding(input.envelopeSubject),
    envelopeFrom: describeMailTextEncoding(input.envelopeFrom),
    parsedSubject: describeMailTextEncoding(input.parsedSubject),
    parsedFrom: describeMailTextEncoding(input.parsedFrom),
    resolvedSubject: describeMailTextEncoding(input.resolvedSubject),
    resolvedFrom: describeMailTextEncoding(input.resolvedFrom),
    parsedBodyText: describeMailTextEncoding(input.bodyText),
    parsedBodyHtml: describeMailTextEncoding(input.bodyHtml),
    bodyTextPreview: previewMailText(input.bodyText),
    bodyHtmlPreview: previewMailText(input.bodyHtml),
  });
}

export function logMimeSourceDownloadFailed(uid: number, error: unknown): void {
  logMailMimeDebug("source-download-failed", {
    uid,
    error: error instanceof Error ? error.message : String(error),
  });
}

/** @internal test helpers */
export const mailDebugTestUtils = {
  describeMailTextEncoding,
  previewMailText,
};
