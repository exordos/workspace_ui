import type { MailComposePayload } from "~/entities/mail/mail.types";
import { stripHtml } from "~/shared/lib/html";
import { sanitizeMailComposeHtml } from "./mail-compose.lib";

export function buildMailComposePayload(input: {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { filename: string; mimeType: string; contentBase64: string }[];
}): MailComposePayload | null {
  const sanitized = sanitizeMailComposeHtml(input.bodyHtml);
  const plain = stripHtml(sanitized).trim();
  if (input.to.length === 0 && input.subject.length === 0 && plain.length === 0) {
    return null;
  }
  return {
    to: input.to,
    cc: input.cc.length > 0 ? input.cc : undefined,
    bcc: input.bcc.length > 0 ? input.bcc : undefined,
    subject: input.subject,
    bodyHtml: sanitized,
    bodyText: plain,
    inReplyTo: input.inReplyTo,
    references: input.references,
    attachments:
      input.attachments != null && input.attachments.length > 0 ? input.attachments : undefined,
  };
}
