/**
 * Outgoing message body and attachment label helpers for the composer.
 */
import type { ReplyQuote } from "./message-composer.types";

export function buildOutgoingMessageBody(value: string, replyQuote?: ReplyQuote | null): string {
  let body = value.trim();
  if (replyQuote) {
    const quoteBlock = `> **${replyQuote.sender_full_name}:**\n\n${replyQuote.content}\n\n`;
    body = quoteBlock + body;
  }
  return body;
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
