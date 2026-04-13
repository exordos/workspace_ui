import React from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { sanitizeHtml } from "~/shared/lib/html";
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
          className="composer-preview-html message-body min-w-0 max-w-full break-words [&_a]:text-accent [&_a]:underline hover:[&_a]:opacity-90 [&_blockquote]:border-l-2 [&_blockquote]:border-border-subtle [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_img]:my-1 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded [&_p:last-child]:mb-0 [&_p]:mb-1 [&_pre]:my-1 [&_pre]:min-w-0 [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:border-l-2 [&_pre]:border-border-subtle [&_pre]:py-2 [&_pre]:pl-2 [&_pre]:pr-2 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:italic [&_pre]:text-text-muted [&_pre]:[overflow-wrap:anywhere] [&_pre_code]:min-w-0 [&_pre_code]:max-w-full [&_pre_code]:whitespace-pre-wrap [&_pre_code]:[overflow-wrap:anywhere] [&_span.user-mention]:text-accent hover:[&_span.user-mention]:opacity-90 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-border-subtle [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border-subtle [&_th]:px-2 [&_th]:py-1 [&_th]:text-left"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(previewHtml, getRealmBaseUrl() || undefined),
          }}
        />
      )}
    </div>
  );
});
