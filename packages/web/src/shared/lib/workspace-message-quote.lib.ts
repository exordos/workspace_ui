export interface WorkspaceQuoteHeaderInput {
  senderName: string;
  wroteLabel: string;
  permalinkUrl?: string | null;
}

function escapeMarkdownInline(value: string): string {
  return Array.from(value, (character) =>
    /[\\`*_{()[\]#+.!|>~-]/.test(character) ? `\\${character}` : character,
  ).join("");
}

function normalizeQuoteMarkdown(value: string): string {
  return value.trim().replace(/\r\n?/g, "\n");
}

export function buildWorkspaceQuoteHeader({
  senderName,
  wroteLabel,
  permalinkUrl,
}: WorkspaceQuoteHeaderInput): string {
  const author = escapeMarkdownInline(senderName.trim());
  const normalizedUrl = permalinkUrl?.trim();
  if (normalizedUrl != null && normalizedUrl.length > 0) {
    return `**${author}** [${wroteLabel}](${normalizedUrl}):`;
  }
  return `**${author}**:`;
}

export function buildWorkspaceQuoteBlock(header: string, content: string): string {
  const normalizedContent = normalizeQuoteMarkdown(content);
  const lines = [header, ...normalizedContent.split("\n")];
  return `${lines.map((line) => (line.length === 0 ? ">" : `> ${line}`)).join("\n")}\n\n`;
}
