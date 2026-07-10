/**
 * SMTP send via Nodemailer against Mailcow Postfix.
 */

import nodemailer from "nodemailer";
import {
  appendMailMessage,
  resolveSentFolder,
} from "./imap.lib";
import { buildOutboundMime, buildPlainTextFallback } from "./mime.lib";
import { mailProxyEnv } from "../shared/env.lib";
import type { MailSessionRecord } from "../shared/session/session.lib";

export interface SendMailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
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
  if (options.bcc != null && options.bcc.trim().length > 0) {
    mailOptions.bcc = options.bcc;
  }
  if (options.attachments != null && options.attachments.length > 0) {
    mailOptions.attachments = options.attachments.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
    }));
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
      bcc: options.bcc,
      subject: options.subject,
      bodyHtml: options.bodyHtml,
      bodyText,
      inReplyTo: options.inReplyTo,
      references: options.references,
      attachments: options.attachments,
    });
    await appendMailMessage(session, sentFolder, rawMime, ["\\Seen"]);
  } catch {
    /* Sent append is best-effort — SMTP delivery already succeeded */
  }
}
