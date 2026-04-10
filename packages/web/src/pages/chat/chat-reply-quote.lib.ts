/**
 * Builds the text inserted into the composer when replying to a message (markdown / plain, not rendered HTML).
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import { stripHtml } from "~/shared/lib/html";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";

/** True when the string starts like rendered HTML, not Zulip `<https://…>` autolinks. */
function looksLikeLeadingHtmlMarkup(s: string): boolean {
  const t = s.trimStart();
  if (!t.startsWith("<")) return false;
  if (/^<(https?:|mailto:)/i.test(t)) return false;
  return /^<[a-z!?]/i.test(t);
}

export function resolveReplyQuoteContent(
  msg: Pick<MockMessage, "content" | "markdown_source">,
  selectedText?: string,
): string {
  const trimmedSelected = selectedText?.trim();
  if (trimmedSelected != null && trimmedSelected.length > 0) {
    return trimmedSelected;
  }
  const md = msg.markdown_source?.trim();
  if (md != null && md.length > 0) {
    return looksLikeLeadingHtmlMarkup(md) ? stripHtml(md).trim() : md;
  }
  return plainTextPreviewFromMessageBody(msg.content).trim();
}
