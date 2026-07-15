import React, { useMemo } from "react";
import { resolveMailPreviewBody } from "~/entities/mail/mail.lib";
import { MailMessageActionBar } from "~/features/mail-message-actions/mail-message-action-bar.ui";
import { t } from "~/i18n/i18n";
import { formatMailMessageDetailTime } from "~/shared/lib/datetime.lib";
import { sanitizeHtml } from "~/shared/lib/html";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { ProviderDeliveryBadge } from "~/shared/ui/provider-delivery-badge";
import { Skeleton } from "~/shared/ui/skeleton.ui";
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
  onBack,
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
      <div className="flex flex-1 flex-col" role="status" aria-label={t("app.loading")}>
        <div className="space-y-3 border-b border-border-subtle p-5">
          <Skeleton className="h-5 w-2/3" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-4xl space-y-3 p-6">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
    );
  }

  if (message == null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-sm text-text-muted">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-card-bg text-text-muted shadow-sm">
          <Icon name="mail_outline" size={28} />
        </span>
        <span>{t("mail.previewEmpty")}</span>
      </div>
    );
  }

  const senderInitial = message.from.trim().charAt(0).toUpperCase() || "@";
  let previewContent: React.ReactNode = null;
  if (previewBody?.mode === "html") {
    previewContent = (
      <div
        className="mail-body max-w-none text-text-primary"
        dangerouslySetInnerHTML={{ __html: previewBody.html }}
      />
    );
  } else if (previewBody?.mode === "plain") {
    previewContent = <p className="mail-body whitespace-pre-wrap">{previewBody.text}</p>;
  }

  return (
    <article className="flex min-h-0 flex-1 flex-col bg-bg">
      <header className="relative z-sticky shrink-0 overflow-visible border-b border-border-subtle bg-sidebar-bg">
        <div className="flex items-start gap-3 px-3 pb-3 pt-4 md:px-5">
          {onBack != null ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onBack}
              className="h-8 w-8 shrink-0 px-0 md:hidden"
              aria-label={t("mail.backToList")}
              title={t("mail.backToList")}
            >
              <Icon name="chevron-right" size={18} className="rotate-180" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-text-primary">
              {message.subject}
            </h2>
            <div className="mt-3 flex min-w-0 items-center gap-2.5">
              <span
                className="bg-accent/15 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-accent"
                aria-hidden
              >
                {senderInitial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{message.from}</p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                  <span>{formatMailMessageDetailTime(message.date)}</span>
                  <ProviderDeliveryBadge provider={message.provider} delivery={message.delivery} />
                </div>
              </div>
            </div>
          </div>
          {inDrafts && onEditDraft != null ? (
            <Button type="button" size="sm" variant="ghost" onClick={onEditDraft}>
              {t("mail.editDraft")}
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto border-t border-border-subtle bg-card-bg px-2 py-1">
          <MailMessageActionBar message={message} inTrash={inTrash} onAction={onAction} />
        </div>
      </header>
      {attachments.length > 0 ? (
        <div className="shrink-0 overflow-x-auto border-b border-border-subtle bg-bg-elevated px-3 py-2 md:px-5">
          <ul className="flex min-w-max gap-2" aria-label={t("mail.attachments")}>
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-2 rounded-lg border border-border-subtle bg-bg px-3 py-1.5 text-xs text-text-secondary"
                  onClick={() => onDownloadAttachment?.(attachment.id)}
                >
                  <Icon name="attach" size={14} />
                  {attachment.filename} ({Math.round(attachment.sizeBytes / 1024)} KB)
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 text-sm text-text-primary md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-4xl leading-relaxed">{previewContent}</div>
      </div>
    </article>
  );
};
