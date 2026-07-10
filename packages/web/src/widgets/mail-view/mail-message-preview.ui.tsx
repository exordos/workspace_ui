import React, { useMemo } from "react";
import { resolveMailPreviewBody } from "~/entities/mail/mail.lib";
import { MailMessageActionBar } from "~/features/mail-message-actions/mail-message-action-bar.ui";
import { t } from "~/i18n/i18n";
import { formatMailMessageDetailTime } from "~/shared/lib/datetime.lib";
import { sanitizeHtml } from "~/shared/lib/html";
import { Button } from "~/shared/ui/button";
import type { MailMessagePreviewProps } from "./mail-view.types";

export const MailMessagePreview: React.FC<MailMessagePreviewProps> = ({
  loading,
  message,
  attachments = [],
  inTrash,
  inDrafts = false,
  onAction,
  onEditDraft,
  onDownloadAttachment,
}) => {
  const previewBody = useMemo(() => {
    if (message == null) return null;
    const resolved = resolveMailPreviewBody(message.bodyHtml, message.bodyText);
    if (resolved == null) return null;
    if (resolved.mode === "html") {
      return { mode: "html" as const, html: sanitizeHtml(resolved.html) };
    }
    return resolved;
  }, [message]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-muted">
        {t("app.loading")}
      </div>
    );
  }

  if (message == null) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-muted">
        {t("mail.previewEmpty")}
      </div>
    );
  }

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <header className="relative z-sticky flex shrink-0 items-start justify-between gap-2 overflow-visible border-b border-border-subtle px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-text-muted">
            {t("mail.from")}: {message.from}
          </p>
          <h2 className="mt-1 line-clamp-2 text-base font-medium text-text-primary">
            {message.subject}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {formatMailMessageDetailTime(message.date)}
          </p>
        </div>
        <MailMessageActionBar message={message} inTrash={inTrash} onAction={onAction} />
        {inDrafts && onEditDraft != null ? (
          <Button type="button" size="sm" variant="ghost" onClick={onEditDraft}>
            {t("mail.editDraft")}
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-text-primary">
        {attachments.length > 0 ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-lg border border-border-subtle bg-card-bg px-3 py-2 text-xs text-text-secondary"
                  onClick={() => onDownloadAttachment?.(attachment.id)}
                >
                  {attachment.filename} ({Math.round(attachment.sizeBytes / 1024)} KB)
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {previewBody?.mode === "html" ? (
          <div
            className="mail-body max-w-none text-text-primary"
            dangerouslySetInnerHTML={{ __html: previewBody.html }}
          />
        ) : previewBody?.mode === "plain" ? (
          <p className="mail-body whitespace-pre-wrap">{previewBody.text}</p>
        ) : null}
      </div>
    </article>
  );
};
