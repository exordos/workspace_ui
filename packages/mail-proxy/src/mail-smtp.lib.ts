/**
 * SMTP send via Nodemailer against Mailcow Postfix.
 */

import nodemailer from "nodemailer";
import {
  appendMailMessage,
  resolveSentFolder,
} from "./mail-imap.lib";
import { buildOutboundMime, buildPlainTextFallback } from "./mail-mime.lib";
import { mailProxyEnv } from "./mail-env.lib";
import type { MailSessionRecord } from "./mail-session.lib";

export interface SendMailOptions {
  to: string;
  cc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
}

function createTransporter(session: MailSessionRecord) {
  return nodemailer.createTransport({
    host: mailProxyEnv.SMTP_HOST,
    port: mailProxyEnv.SMTP_PORT,
    secure: mailProxyEnv.SMTP_PORT === 465,
    auth: {
      user: session.email,
      pass: session.password,
    },
    tls: {
      rejectUnauthorized: mailProxyEnv.TLS_REJECT_UNAUTHORIZED,
    },
  });
}

export async function sendMailMessage(
  session: MailSessionRecord,
  options: SendMailOptions,
): Promise<void> {
  const bodyText = options.bodyText ?? buildPlainTextFallback(options.bodyHtml);
  const mailOptions: nodemailer.SendMailOptions = {
    from: session.email,
    to: options.to,
    subject: options.subject,
    html: options.bodyHtml,
    text: bodyText,
    encoding: "utf-8",
  };
  if (options.cc != null && options.cc.trim().length > 0) {
    mailOptions.cc = options.cc;
  }
  const headers: Record<string, string> = {};
  if (options.inReplyTo != null && options.inReplyTo.length > 0) {
    headers["In-Reply-To"] = options.inReplyTo;
  }
  if (options.references != null && options.references.length > 0) {
    headers.References = options.references;
  }
  if (Object.keys(headers).length > 0) {
    mailOptions.headers = headers;
  }

  const transporter = createTransporter(session);
  await transporter.sendMail(mailOptions);

  try {
    const sentFolder = await resolveSentFolder(session);
    if (sentFolder == null) return;
    const rawMime = await buildOutboundMime({
      from: session.email,
      to: options.to,
      cc: options.cc,
      subject: options.subject,
      bodyHtml: options.bodyHtml,
      bodyText,
      inReplyTo: options.inReplyTo,
      references: options.references,
    });
    await appendMailMessage(session, sentFolder, rawMime, ["\\Seen"]);
  } catch {
    /* Sent append is best-effort — SMTP delivery already succeeded */
  }
}
