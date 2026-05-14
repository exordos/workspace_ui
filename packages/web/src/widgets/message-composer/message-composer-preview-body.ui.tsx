import React, { useMemo, useRef } from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { MESSAGE_COMPOSER_PREVIEW_BODY_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import { prepareProtectedMessageHtml } from "~/shared/lib/protected-message-media";
import { useProtectedMessageHtml } from "~/shared/lib/protected-message-media.hook";
import type { MessageComposerPreviewBodyProps } from "./message-composer-preview-body.types";

export const MessageComposerPreviewBody = React.memo(function MessageComposerPreviewBody({
  outgoingBodyTrim,
  previewLoading,
  previewError,
  previewHtml,
}: MessageComposerPreviewBodyProps) {
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const safePreviewHtml = useMemo(
    () => prepareProtectedMessageHtml(previewHtml, getRealmBaseUrl() || undefined),
    [previewHtml],
  );

  useProtectedMessageHtml(previewBodyRef, safePreviewHtml);

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
        <div ref={previewBodyRef} className={MESSAGE_COMPOSER_PREVIEW_BODY_CLASS_NAME} />
      )}
    </div>
  );
});
