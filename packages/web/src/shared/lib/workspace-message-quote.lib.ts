interface BuildWorkspaceQuoteHeaderOptions {
  senderName: string;
  wroteLabel: string;
  permalinkUrl?: string | null;
}

export function buildWorkspaceQuoteHeader(options: BuildWorkspaceQuoteHeaderOptions): string {
  const { senderName, wroteLabel, permalinkUrl } = options;
  const normalizedPermalink = permalinkUrl?.trim();
  const permalinkSuffix =
    normalizedPermalink != null && normalizedPermalink.length > 0
      ? ` [${wroteLabel}](${normalizedPermalink})`
      : "";

  return `**${senderName}**${permalinkSuffix}:`;
}

export function buildWorkspaceQuoteBlock(header: string, content: string): string {
  const normalizedContent = content.trim();
  const quoteLines = [header, ...normalizedContent.split(/\r?\n/)].map((line) => `> ${line}`);

  return `${quoteLines.join("\n")}\n\n`;
}
