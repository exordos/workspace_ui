import React, { useCallback, useEffect, useState } from "react";
import {
  buildNewComposeState,
  getMailComposeDialogTitleKey,
  sanitizeMailComposeHtml,
} from "~/entities/mail/mail-compose.lib";
import { t } from "~/i18n/i18n";
import { stripHtml } from "~/shared/lib/html";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
import { MailRichEditor } from "./mail-rich-editor.ui";
import type { MailComposeDialogProps } from "./mail-compose.types";

export const MailComposeDialog: React.FC<MailComposeDialogProps> = ({
  open,
  mode,
  initial,
  sending,
  error,
  onOpenChange,
  onSend,
}) => {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p><br></p>");
  const [inReplyTo, setInReplyTo] = useState<string | undefined>();
  const [references, setReferences] = useState<string | undefined>();

  const applyInitial = useCallback((state: typeof initial) => {
    const next = state ?? buildNewComposeState();
    setTo(next.to);
    setCc(next.cc);
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

  const handleSubmit = useCallback(() => {
    const sanitized = sanitizeMailComposeHtml(bodyHtml);
    const plain = stripHtml(sanitized).trim();
    if (to.length === 0 || subject.length === 0 || plain.length === 0) return;
    onSend({
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject,
      bodyHtml: sanitized,
      bodyText: plain,
      inReplyTo,
      references,
    });
  }, [bodyHtml, cc, inReplyTo, onSend, references, subject, to]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const handleCancel = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

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
        {error != null && error.length > 0 ? (
          <p className="text-sm text-notice-base" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </AppDialog>
  );
};
