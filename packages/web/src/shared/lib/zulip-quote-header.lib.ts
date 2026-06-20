interface BuildZulipQuoteHeaderOptions {
  senderName: string;
  senderId: number;
  wroteLabel: string;
  permalinkUrl?: string | null;
}

/** Zulip-style quote header: silent mention + optional "wrote" permalink suffix. */
export function buildZulipQuoteHeader(options: BuildZulipQuoteHeaderOptions): string {
  const { senderName, senderId, wroteLabel, permalinkUrl } = options;
  const normalizedPermalink = permalinkUrl?.trim();
  const permalinkSuffix =
    normalizedPermalink != null && normalizedPermalink.length > 0
      ? ` [${wroteLabel}](${normalizedPermalink})`
      : "";
  return `@_**${senderName}|${senderId}**${permalinkSuffix}:`;
}
