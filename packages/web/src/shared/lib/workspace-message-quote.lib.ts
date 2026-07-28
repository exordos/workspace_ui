import { buildWorkspaceQuoteUrn } from "./workspace-reference-urn.lib";

export interface WorkspaceQuoteHeaderInput {
  senderName: string;
  senderUuid: string;
  wroteLabel: string;
  messageUuid: string;
}

export interface WorkspaceQuoteReferenceInput {
  senderName: string;
  messageUuid: string;
  selectedText?: string;
}

export function escapeWorkspaceMarkdownInline(value: string): string {
  return Array.from(value, (character) =>
    /[\\`*_{()[\]#+.!|>~-]/.test(character) ? `\\${character}` : character,
  ).join("");
}

export function buildWorkspaceUserMention(senderName: string, senderUuid: string): string {
  return `[${escapeWorkspaceMarkdownInline(senderName.trim())}](urn:user:${senderUuid})`;
}

export function buildWorkspaceQuoteReference({
  senderName,
  messageUuid,
  selectedText,
}: WorkspaceQuoteReferenceInput): string | null {
  const quoteUrn = buildWorkspaceQuoteUrn(messageUuid, selectedText);
  const authorLabel = escapeWorkspaceMarkdownInline(senderName.trim());
  if (quoteUrn == null || authorLabel.length === 0) {
    return null;
  }
  return `[${authorLabel}](${quoteUrn})`;
}

function normalizeQuoteMarkdown(value: string): string {
  return value.trim().replace(/\r\n?/g, "\n");
}

export function buildWorkspaceQuoteHeader({
  senderName,
  senderUuid,
  wroteLabel,
  messageUuid,
}: WorkspaceQuoteHeaderInput): string {
  const author = buildWorkspaceUserMention(senderName, senderUuid);
  const wrote = escapeWorkspaceMarkdownInline(wroteLabel.trim());
  const messageLink = `[${wrote}](urn:message:${messageUuid})`;
  return `${author} ${messageLink}:`;
}

export function buildWorkspaceQuoteBlock(header: string, content: string): string {
  const normalizedContent = normalizeQuoteMarkdown(content);
  const lines = [header, ...normalizedContent.split("\n")];
  const quotedLines = lines.map((line) => {
    return line.length === 0 ? ">" : `> ${line}`;
  });
  return `${quotedLines.join("\n")}\n\n`;
}
