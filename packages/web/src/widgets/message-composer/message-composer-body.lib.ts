/**
 * Outgoing message body and attachment label helpers for the composer.
 */
import { t } from "~/i18n/i18n";
import { buildZulipQuoteBlock } from "~/shared/lib/message-zulip-quote.lib";
import { buildZulipQuoteHeader } from "~/shared/lib/zulip-quote-header.lib";
import type { ReplyQuote } from "./message-composer.types";

/** Zulip-style reply: silent user mention, optional “wrote” permalink link, and fenced `quote` block. */
export function buildOutgoingMessageBody(value: string, replyQuote?: ReplyQuote | null): string {
  let body = value.trim();
  if (replyQuote) {
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
  const subtype = normalizeImageMime(mime).split("/")[1] ?? "png";
  return `pasted-image.${subtype}`;
}

/** True when the file is an image by MIME type or by common image extension. */
export function isLikelyImageAttachment(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const extension = file.name.split(".").pop()?.trim().toLowerCase() ?? "";
  return IMAGE_ATTACHMENT_EXTENSIONS.has(extension);
}

/** Ensures clipboard/dropped image files have a usable MIME type for preview and upload. */
export function normalizeImageAttachmentFile(file: File, fallbackMime?: string): File {
  const currentType = normalizeImageMime(file.type);
  if (currentType.startsWith("image/")) {
    if (file.type === currentType) return file;
    return new File([file], file.name, { type: currentType });
  }

  const fallback = fallbackMime != null ? normalizeImageMime(fallbackMime) : "";
  const resolvedMime = fallback.startsWith("image/")
    ? fallback
    : (imageMimeFromFileName(file.name) ?? "");
  if (!resolvedMime.startsWith("image/")) {
    return file;
  }

  const name = file.name.trim().length > 0 ? file.name : defaultFileNameForImageMime(resolvedMime);
  return new File([file], name, { type: resolvedMime });
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
  if (sizeBytes < 1024 * 1024 * 1024) return `${Math.round(sizeBytes / (1024 * 1024))} MB`;
  return `${Math.round(sizeBytes / (1024 * 1024 * 1024))} GB`;
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
