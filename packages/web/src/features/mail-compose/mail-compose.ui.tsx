import React, { useCallback, useEffect, useState } from "react";
import { buildMailComposePayload } from "~/entities/mail/mail-compose-payload.lib";
import {
  buildNewComposeState,
  getMailComposeDialogTitleKey,
} from "~/entities/mail/mail-compose.lib";
import { t } from "~/i18n/i18n";
import { stripHtml } from "~/shared/lib/html";
import { validateFileUpload } from "~/shared/lib/validation";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import { MailRichEditor } from "./mail-rich-editor.ui";
import type { MailComposeDialogProps } from "./mail-compose.types";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export const MailComposeDialog: React.FC<MailComposeDialogProps> = ({
  open,
  mode,
  initial,
  sending,
  error,
  onOpenChange,
  onSend,
  onAutosave,
}) => {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [attachments, setAttachments] = useState<
    { filename: string; mimeType: string; contentBase64: string }[]
  >([]);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p><br></p>");
  const [inReplyTo, setInReplyTo] = useState<string | undefined>();
  const [references, setReferences] = useState<string | undefined>();

  const applyInitial = useCallback((state: typeof initial) => {
    const next = state ?? buildNewComposeState();
    setTo(next.to);
    setCc(next.cc);
    setBcc("");
    setAttachments([]);
    setSubject(next.subject);
    setBodyHtml(next.bodyHtml);
    setInReplyTo(next.inReplyTo);
    setReferences(next.references);
  }, []);

  useEffect(() => {
    if (open) {
      applyInitial(initial);
    }
  }, [open, initial, applyInitial]);

  const resetForm = useCallback(() => {
    applyInitial(null);
  }, [applyInitial]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || onAutosave == null) return;
    const timer = setTimeout(() => {
      const payload = buildMailComposePayload({
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
        inReplyTo,
        references,
        attachments,
      });
      if (payload == null) return;
      onAutosave(payload);
    }, 2000);
    return () => clearTimeout(timer);
  }, [attachments, bcc, bodyHtml, cc, inReplyTo, onAutosave, open, references, subject, to]);

  const handleSubmit = useCallback(() => {
    const payload = buildMailComposePayload({
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      inReplyTo,
      references,
      attachments,
    });
    if (payload == null || payload.to.length === 0 || payload.subject.length === 0) return;
    onSend(payload);
  }, [attachments, bcc, bodyHtml, cc, inReplyTo, onSend, references, subject, to]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const handleCancel = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleAttachmentsChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files == null || files.length === 0) return;
      const next: { filename: string; mimeType: string; contentBase64: string }[] = [];
      for (const file of Array.from(files)) {
        const { valid } = validateFileUpload(file);
        if (!valid) continue;
        const buffer = await file.arrayBuffer();
        next.push({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: arrayBufferToBase64(buffer),
        });
      }
      setAttachments((prev) => [...prev, ...next]);
      event.target.value = "";
    },
    [],
  );

  const showCc = mode === "replyAll" || cc.length > 0;

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t(getMailComposeDialogTitleKey(mode))}
      showCloseButton
      maxWidthClassName="max-w-2xl"
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          submitLabel={t("mail.send")}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitDisabled={
            to.length === 0 || subject.length === 0 || stripHtml(bodyHtml).trim().length === 0
          }
          isSubmitting={sending}
        />
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("mail.to")}</span>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
            required
          />
        </label>
        {showCc ? (
          <label className="block text-sm">
            <span className="mb-1 block text-text-muted">{t("mail.cc")}</span>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
            />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("mail.bcc")}</span>
          <input
            type="text"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("mail.subject")}</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
            required
          />
        </label>
        <MailRichEditor value={bodyHtml} onChange={setBodyHtml} disabled={sending} />
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("mail.attachments")}</span>
          <input
            type="file"
            multiple
            onChange={handleAttachmentsChange}
            className="w-full text-sm text-text-secondary"
          />
          {attachments.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-text-muted">
              {attachments.map((item) => (
                <li key={item.filename}>{item.filename}</li>
              ))}
            </ul>
          ) : null}
        </label>
        {error != null && error.length > 0 ? (
          <p className="text-sm text-notice-base" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </AppDialog>
  );
};
