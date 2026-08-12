/**
 * Outgoing message body and attachment label helpers for the composer.
 */
import { t } from "~/i18n/i18n";
import { buildZulipQuoteBlock } from "~/shared/lib/message-zulip-quote.lib";
import {
  buildWorkspaceQuoteReference,
  buildWorkspaceUserMention,
} from "~/shared/lib/workspace-message-quote.lib";
import { buildZulipQuoteHeader } from "~/shared/lib/zulip-quote-header.lib";
import type { ReplyQuote } from "./message-composer.types";

export interface WorkspaceComposerMention {
  userUuid: string;
  displayName: string;
  visibleText: string;
}

export interface WorkspaceMentionInsertion {
  value: string;
  cursorPosition: number;
}

/** Replaces the active @query with the person's name shown in the composer. */
export function insertWorkspaceMention(
  value: string,
  mentionStartPos: number,
  cursorPos: number,
  displayName: string,
): WorkspaceMentionInsertion {
  const before = value.slice(0, mentionStartPos);
  const after = value.slice(cursorPos);
  const mention = `@${displayName} `;
  const nextValue = before + mention + after;
  return {
    value: nextValue,
    cursorPosition: before.length + mention.length,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts visible person names to the canonical URNs required by the Workspace API. */
export function serializeWorkspaceComposerMentions(
  value: string,
  mentions: readonly WorkspaceComposerMention[],
): string {
  if (mentions.length === 0) return value;

  const mentionsByVisibleText = new Map(
    mentions
      .filter((mention) => mention.visibleText.trim().length > 0)
      .map((mention) => [mention.visibleText, mention] as const),
  );
  const visibleTexts = [...mentionsByVisibleText.keys()].sort(
    (left, right) => right.length - left.length,
  );
  if (visibleTexts.length === 0) return value;

  const visibleTextPattern = visibleTexts.map(escapeRegExp).join("|");
  const mentionPattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_.-])@(${visibleTextPattern})(?![\\p{L}\\p{N}_.-])`,
    "gu",
  );
  return value.replace(mentionPattern, (match, prefix: string, visibleText: string) => {
    const mention = mentionsByVisibleText.get(visibleText);
    return mention == null
      ? match
      : `${prefix}${buildWorkspaceUserMention(mention.displayName, mention.userUuid)}`;
  });
}

/** Builds a reply quote prefix before the outgoing draft body. */
export function buildOutgoingMessageBody(
  value: string,
  replyQuote?: ReplyQuote | null,
  mentions: readonly WorkspaceComposerMention[] = [],
): string {
  let body = serializeWorkspaceComposerMentions(value, mentions).trim();
  if (replyQuote) {
    if (replyQuote.quoteFormat === "workspace") {
      const quoteReference = buildWorkspaceQuoteReference({
        senderName: replyQuote.sender_full_name,
        messageUuid: replyQuote.id,
      });
      if (quoteReference == null || body.length === 0) {
        return quoteReference ?? body;
      }
      return `${quoteReference}\n\n${body}`;
    }

    if (replyQuote.sender_id == null) {
      return body;
    }

    const header = buildZulipQuoteHeader({
      senderName: replyQuote.sender_full_name,
      senderId: replyQuote.sender_id,
      wroteLabel: t("message.replyQuoteWrote"),
      permalinkUrl: replyQuote.permalinkUrl,
    });
    body = buildZulipQuoteBlock(header, replyQuote.content) + body;
  }
  return body;
}

const IMAGE_ATTACHMENT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

const EXTENSION_TO_IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

const MIME_TO_FILE_EXTENSION: Record<string, string> = {
  "application/octet-stream": "bin",
  "application/pdf": "pdf",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "text/plain": "txt",
};

const GENERIC_CLIPBOARD_FILE_STEM = /^(?:image|pasted[-_ ]?image|blob)(?:[-_ ]?\(?\d+\)?)?$/i;

export type AttachmentInputSource = "picker" | "drop" | "clipboard";

export interface AttachmentFileCandidate {
  file: File;
  fallbackMime?: string;
}

interface PrepareAttachmentFilesOptions {
  source: AttachmentInputSource;
  existingFiles?: readonly File[];
  now?: Date;
}

function normalizeImageMime(mime: string): string {
  const normalized = mime.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function imageMimeFromFileName(fileName: string): string | null {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? (parts.at(-1) ?? "").trim().toLowerCase() : "";
  if (extension.length === 0) return null;
  return EXTENSION_TO_IMAGE_MIME[extension] ?? null;
}

function defaultFileNameForImageMime(mime: string): string {
  const normalizedMime = normalizeImageMime(mime);
  const extension =
    MIME_TO_FILE_EXTENSION[normalizedMime] ?? normalizedMime.split("/")[1]?.split("+")[0] ?? "png";
  return `pasted-image.${extension}`;
}

function fileExtension(file: File): string {
  const normalizedMime = normalizeImageMime(file.type);
  const mappedExtension = MIME_TO_FILE_EXTENSION[normalizedMime];
  if (normalizedMime.startsWith("image/") && mappedExtension != null) {
    return mappedExtension;
  }

  const trimmedName = file.name.trim();
  const lastDot = trimmedName.lastIndexOf(".");
  if (lastDot > 0 && lastDot < trimmedName.length - 1) {
    return trimmedName.slice(lastDot + 1).toLowerCase();
  }

  if (mappedExtension != null) return mappedExtension;

  const subtype = normalizedMime.split("/")[1]?.split("+")[0] ?? "";
  const safeSubtype = subtype.replace(/[^a-z0-9]/g, "");
  return safeSubtype.length > 0 && safeSubtype.length <= 10 ? safeSubtype : "bin";
}

function fileStem(fileName: string): string {
  const trimmedName = fileName.trim();
  const lastDot = trimmedName.lastIndexOf(".");
  return lastDot > 0 ? trimmedName.slice(0, lastDot) : trimmedName;
}

function isGenericClipboardFileName(fileName: string): boolean {
  const trimmedName = fileName.trim();
  return trimmedName.length === 0 || GENERIC_CLIPBOARD_FILE_STEM.test(fileStem(trimmedName));
}

function formatAttachmentTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function uniqueGeneratedFileName(file: File, date: Date, usedNames: Set<string>): string {
  const prefix = isLikelyImageAttachment(file) ? "pasted-image" : "pasted-file";
  const baseName = `${prefix}-${formatAttachmentTimestamp(date)}`;
  const extension = fileExtension(file);
  let candidate = `${baseName}.${extension}`;
  let index = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName}-${index}.${extension}`;
    index += 1;
  }

  return candidate;
}

function renameFile(file: File, name: string): File {
  return new File([file], name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/** True when the file is an image by MIME type or by common image extension. */
export function isLikelyImageAttachment(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const extension = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  return IMAGE_ATTACHMENT_EXTENSIONS.has(extension);
}

/** Ensures clipboard and dropped files have a usable MIME type for preview and upload. */
export function normalizeImageAttachmentFile(file: File, fallbackMime?: string): File {
  const currentType = normalizeImageMime(file.type);
  if (currentType.startsWith("image/")) {
    if (file.type === currentType) return file;
    return new File([file], file.name, { type: currentType, lastModified: file.lastModified });
  }
  if (currentType.length > 0) return file;

  const fallback = fallbackMime != null ? normalizeImageMime(fallbackMime) : "";
  const resolvedMime = fallback || imageMimeFromFileName(file.name) || "";
  if (resolvedMime.length === 0) return file;

  const name =
    file.name.trim().length > 0 || !resolvedMime.startsWith("image/")
      ? file.name
      : defaultFileNameForImageMime(resolvedMime);
  return new File([file], name, { type: resolvedMime, lastModified: file.lastModified });
}

/** Preserves real names and replaces browser clipboard placeholders with unique names. */
export function prepareAttachmentFiles(
  candidates: readonly AttachmentFileCandidate[],
  options: PrepareAttachmentFilesOptions,
): File[] {
  const usedNames = new Set((options.existingFiles ?? []).map((file) => file.name.toLowerCase()));
  const now = options.now ?? new Date();

  return candidates.map(({ file, fallbackMime }) => {
    const normalized = normalizeImageAttachmentFile(file, fallbackMime);
    const needsGeneratedName =
      normalized.name.trim().length === 0 ||
      (options.source === "clipboard" && isGenericClipboardFileName(normalized.name));
    const name = needsGeneratedName
      ? uniqueGeneratedFileName(normalized, now, usedNames)
      : normalized.name;
    const prepared = name === normalized.name ? normalized : renameFile(normalized, name);
    usedNames.add(prepared.name.toLowerCase());
    return prepared;
  });
}

export function getAttachmentExtensionLabel(fileName: string): string {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? (parts.at(-1) ?? "") : "";
  const normalized = extension.trim().toUpperCase();
  if (normalized.length === 0) return "FILE";
  return normalized.slice(0, 4);
}

export function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${Math.round((sizeBytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  return `${Math.round((sizeBytes / (1024 * 1024 * 1024)) * 10) / 10} GB`;
}

export function resolveTomorrowMorningTimestamp(baseTimeMs: number): number {
  const nextMorning = new Date(baseTimeMs);
  nextMorning.setDate(nextMorning.getDate() + 1);
  nextMorning.setHours(9, 0, 0, 0);
  return nextMorning.getTime();
}

export function formatScheduledTimestamp(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}
