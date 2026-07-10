export interface WorkspaceQuoteHeaderInput {
  senderName: string;
  senderUuid: string;
  wroteLabel: string;
  messageUuid: string;
}

export function escapeWorkspaceMarkdownInline(value: string): string {
  return Array.from(value, (character) =>
    /[\\`*_{()[\]#+.!|>~-]/.test(character) ? `\\${character}` : character,
  ).join("");
}

export function buildWorkspaceUserMention(senderName: string, senderUuid: string): string {
  return `[${escapeWorkspaceMarkdownInline(senderName.trim())}](urn:user:${senderUuid})`;
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
  return `${lines.map((line) => (line.length === 0 ? ">" : `> ${line}`)).join("\n")}\n\n`;
}
