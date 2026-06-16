/**
 * Mail compose helpers — reply/forward prefills and recipient resolution.
 */

import DOMPurify from "dompurify";
import type { MailComposeInitialState, MailComposeMode, MailMessageDetail } from "./mail.types";

const RE_PREFIX = /^re:\s*/i;
const FWD_PREFIX = /^(fwd|fw):\s*/i;

export function extractMailAddress(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export function formatMailAddressList(addresses: readonly string[]): string {
  return addresses.filter((item) => item.trim().length > 0).join(", ");
}

export function buildReplySubject(subject: string): string {
  const trimmed = subject.trim();
  if (RE_PREFIX.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function buildForwardSubject(subject: string): string {
  const trimmed = subject.trim();
  if (FWD_PREFIX.test(trimmed)) return trimmed;
  return `Fwd: ${trimmed}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildQuotedHtmlFromMessage(message: MailMessageDetail): string {
  const body =
    message.bodyHtml != null && message.bodyHtml.trim().length > 0
      ? message.bodyHtml
      : escapeHtml(message.bodyText ?? "").replace(/\n/g, "<br>");
  return [
    "<br><br>",
    `<div>On ${escapeHtml(message.date)}, ${escapeHtml(message.from)} wrote:</div>`,
    `<blockquote style="margin:0 0 0 8px;border-left:2px solid #ccc;padding-left:8px">`,
    `<div><strong>${escapeHtml(message.subject)}</strong></div>`,
    body,
    "</blockquote>",
  ].join("");
}

export function resolveReplyRecipients(
  message: MailMessageDetail,
  userEmail: string,
  mode: Extract<MailComposeMode, "reply" | "replyAll">,
): { to: string; cc: string } {
  const self = extractMailAddress(userEmail);
  const primary = message.replyTo?.trim() || message.from;
  if (mode === "reply") {
    return { to: primary, cc: "" };
  }

  const recipients = new Set<string>();
  const addRecipient = (value: string) => {
    const email = extractMailAddress(value);
    if (email.length === 0 || email === self) return;
    recipients.add(value.trim());
  };

  addRecipient(message.from);
  for (const item of message.to) addRecipient(item);
  for (const item of message.cc) addRecipient(item);
  if (message.replyTo != null) addRecipient(message.replyTo);

  const primaryEmail = extractMailAddress(primary);
  const ccList = [...recipients].filter((item) => extractMailAddress(item) !== primaryEmail);

  return {
    to: primary,
    cc: formatMailAddressList(ccList),
  };
}

export function buildReferencesHeader(message: MailMessageDetail): string | undefined {
  if (message.messageId == null) return message.references ?? undefined;
  if (message.references != null && message.references.length > 0) {
    return `${message.references} ${message.messageId}`;
  }
  return message.messageId;
}

export function buildReplyComposeState(
  message: MailMessageDetail,
  mode: Extract<MailComposeMode, "reply" | "replyAll">,
  userEmail: string,
): MailComposeInitialState {
  const { to, cc } = resolveReplyRecipients(message, userEmail, mode);
  return {
    to,
    cc,
    subject: buildReplySubject(message.subject),
    bodyHtml: `<p><br></p>${buildQuotedHtmlFromMessage(message)}`,
    inReplyTo: message.messageId ?? undefined,
    references: buildReferencesHeader(message),
  };
}

export function buildForwardComposeState(message: MailMessageDetail): MailComposeInitialState {
  return {
    to: "",
    cc: "",
    subject: buildForwardSubject(message.subject),
    bodyHtml: `<p><br></p>${buildQuotedHtmlFromMessage(message)}`,
  };
}

export function buildNewComposeState(): MailComposeInitialState {
  return {
    to: "",
    cc: "",
    subject: "",
    bodyHtml: "<p><br></p>",
  };
}

const MAIL_COMPOSE_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "a",
  "blockquote",
  "div",
  "ul",
  "ol",
  "li",
] as const;

/** Sanitizes outbound compose HTML before send. */
export function sanitizeMailComposeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...MAIL_COMPOSE_ALLOWED_TAGS],
    ALLOWED_ATTR: ["href", "target", "rel", "style"],
  });
}

export function getMailComposeDialogTitleKey(mode: MailComposeMode): string {
  switch (mode) {
    case "reply":
      return "mail.reply";
    case "replyAll":
      return "mail.replyAll";
    case "forward":
      return "mail.forward";
    default:
      return "mail.compose";
  }
}
