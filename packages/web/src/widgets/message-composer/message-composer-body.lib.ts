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
