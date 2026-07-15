import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { buildMailComposePayload } from "~/entities/mail/mail-compose-payload.lib";
import {
  buildNewComposeState,
  getMailComposeDialogTitleKey,
} from "~/entities/mail/mail-compose.lib";
import { t } from "~/i18n/i18n";
import { stripHtml } from "~/shared/lib/html";
import { validateFileUpload } from "~/shared/lib/validation";
import { AppDialogShell } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
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
  const [showCcField, setShowCcField] = useState(false);
  const [showBccField, setShowBccField] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

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
      setShowCcField(mode === "replyAll" || (initial?.cc.length ?? 0) > 0);
      setShowBccField(false);
    }
  }, [open, initial, mode, applyInitial]);

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

  const handleShowCc = useCallback(() => {
    setShowCcField(true);
  }, []);

  const handleShowBcc = useCallback(() => {
    setShowBccField(true);
  }, []);

  const handleOpenAttachmentPicker = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const submitDisabled =
    to.length === 0 || subject.length === 0 || stripHtml(bodyHtml).trim().length === 0;

  return (
    <AppDialogShell
      open={open}
      onOpenChange={handleOpenChange}
      modal={false}
      showOverlay={false}
      contentClassName="fixed bottom-2 right-2 z-modal flex h-[min(680px,calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-elevated shadow-xl ring-1 ring-border-subtle sm:bottom-4 sm:right-4 sm:w-[min(680px,calc(100vw-2rem))]"
    >
      <header className="flex min-h-11 shrink-0 items-center justify-between border-b border-border-subtle bg-sidebar-bg px-4 py-2.5">
        <Dialog.Title className="text-sm font-semibold text-text-primary md:text-base">
          {t(getMailComposeDialogTitleKey(mode))}
        </Dialog.Title>
        <Dialog.Close asChild>
          <button
            type="button"
            className="hover:bg-bg/60 flex h-8 w-8 items-center justify-center rounded text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={t("common.close")}
          >
            <Icon name="close" size={18} />
          </button>
        </Dialog.Close>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center border-b border-border-subtle px-4 transition-colors focus-within:bg-card-bg">
          <label htmlFor="mail-compose-to" className="w-16 shrink-0 text-xs text-text-muted">
            {t("mail.to")}
          </label>
          <input
            id="mail-compose-to"
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-text-primary outline-none"
            required
          />
          <div className="flex shrink-0 items-center gap-1">
            {!showCcField ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleShowCc}
                aria-expanded={false}
                className="h-7 px-2"
              >
                {t("mail.cc")}
              </Button>
            ) : null}
            {!showBccField ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleShowBcc}
                aria-expanded={false}
                className="h-7 px-2"
              >
                {t("mail.bcc")}
              </Button>
            ) : null}
          </div>
        </div>
        {showCcField ? (
          <div className="flex items-center border-b border-border-subtle px-4 transition-colors focus-within:bg-card-bg">
            <label htmlFor="mail-compose-cc" className="w-16 shrink-0 text-xs text-text-muted">
              {t("mail.cc")}
            </label>
            <input
              id="mail-compose-cc"
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-text-primary outline-none"
            />
          </div>
        ) : null}
        {showBccField ? (
          <div className="flex items-center border-b border-border-subtle px-4 transition-colors focus-within:bg-card-bg">
            <label htmlFor="mail-compose-bcc" className="w-16 shrink-0 text-xs text-text-muted">
              {t("mail.bcc")}
            </label>
            <input
              id="mail-compose-bcc"
              type="text"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-text-primary outline-none"
            />
          </div>
        ) : null}
        <div className="flex items-center border-b border-border-subtle px-4 transition-colors focus-within:bg-card-bg">
          <label htmlFor="mail-compose-subject" className="w-16 shrink-0 text-xs text-text-muted">
            {t("mail.subject")}
          </label>
          <input
            id="mail-compose-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm font-medium text-text-primary outline-none"
            required
          />
        </div>
        <div className="p-3 md:p-4">
          <MailRichEditor value={bodyHtml} onChange={setBodyHtml} disabled={sending} />
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            onChange={handleAttachmentsChange}
            className="sr-only"
            tabIndex={-1}
          />
          {attachments.length > 0 ? (
            <ul
              className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted"
              aria-label={t("mail.attachments")}
            >
              {attachments.map((item) => (
                <li
                  key={item.filename}
                  className="flex items-center gap-1 rounded-lg border border-border-subtle bg-card-bg px-2 py-1"
                >
                  <Icon name="attach" size={14} />
                  {item.filename}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle bg-sidebar-bg px-3 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleOpenAttachmentPicker}
          className="gap-1.5 px-2 sm:px-3"
        >
          <Icon name="attach" size={16} />
          {t("mail.addAttachment")}
        </Button>
        {error != null && error.length > 0 ? (
          <p className="min-w-0 flex-1 truncate text-sm text-notice-base" role="alert">
            {error}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <Button type="button" size="sm" variant="ghost" onClick={handleCancel} disabled={sending}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={handleSubmit}
          disabled={submitDisabled || sending}
          className="gap-1.5 px-4 shadow-sm"
        >
          <Icon name="send" size={16} />
          {sending ? t("app.loading") : t("mail.send")}
        </Button>
      </footer>
    </AppDialogShell>
  );
};
