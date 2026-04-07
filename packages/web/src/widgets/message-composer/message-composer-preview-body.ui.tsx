import React from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { sanitizeHtml } from "~/shared/lib/html";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import type { MessageComposerPreviewBodyProps } from "./message-composer-preview-body.types";

export const MessageComposerPreviewBody = React.memo(function MessageComposerPreviewBody({
  outgoingBodyTrim,
  previewLoading,
  previewError,
  previewHtml,
}: MessageComposerPreviewBodyProps) {
  return (
    <div
      className={`max-h-32 min-h-10 w-full min-w-0 overflow-y-auto px-3 py-2 text-sm text-text-primary ${SCROLL_AREA_CLASS}`}
      role="region"
      aria-label={t("composer.preview")}
    >
      {outgoingBodyTrim.length === 0 ? (
        <p className="text-text-muted">{t("composer.previewEmpty")}</p>
      ) : previewLoading ? (
        <p className="text-text-muted">{t("composer.previewLoading")}</p>
      ) : previewError ? (
        <p className="text-notice-base">{previewError}</p>
      ) : (
        <div
          className="composer-preview-html message-body [&_pre]:bg-bg/50 break-words [&_a]:text-accent [&_a]:underline hover:[&_a]:opacity-90 [&_blockquote]:border-l-2 [&_blockquote]:border-border-subtle [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_img]:my-1 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded [&_p:last-child]:mb-0 [&_p]:mb-1 [&_pre]:rounded [&_pre]:p-2 [&_pre]:text-sm"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(previewHtml, getRealmBaseUrl() || undefined),
          }}
        />
      )}
    </div>
  );
});
