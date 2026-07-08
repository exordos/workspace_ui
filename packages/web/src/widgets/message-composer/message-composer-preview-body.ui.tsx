import React from "react";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import { useWorkspaceMessageFilePreviews } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import { t } from "~/i18n/i18n";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { Icon } from "~/shared/ui/icon";
import { formatAttachmentSize, getAttachmentExtensionLabel } from "./message-composer-body.lib";
import type { MessageComposerPreviewBodyProps } from "./message-composer-preview-body.types";

export const MessageComposerPreviewBody = React.memo(function MessageComposerPreviewBody({
  outgoingBodyTrim,
  previewLoading,
  previewError,
  previewHtml,
  previewMetadata,
  fileReferences,
  onLoadWorkspaceFilePreview,
  files = [],
  filePreviewUrls = [],
  removeFile,
}: MessageComposerPreviewBodyProps) {
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const hasFiles = files.length > 0;

  useWorkspaceMessageFilePreviews({
    bodyRef,
    renderedHtml: previewHtml,
    fileReferences,
    onLoadWorkspaceFilePreview,
  });

  const renderPreviewContent = () => {
    if (outgoingBodyTrim.length === 0 && !hasFiles) {
      return <p className="text-text-muted">{t("composer.previewEmpty")}</p>;
    }
    if (outgoingBodyTrim.length === 0) {
      return null;
    }
    if (previewLoading) {
      return <p className="text-text-muted">{t("composer.previewLoading")}</p>;
    }
    if (previewError) {
      return <p className="text-notice-base">{previewError}</p>;
    }
    if (previewMetadata == null) {
      return <p className="text-notice-base">{t("composer.previewError")}</p>;
    }

    return (
      <WorkspaceMessageBody
        html={previewHtml}
        metadata={previewMetadata}
        useInlineMeta={false}
        bodyRef={bodyRef}
      />
    );
  };

  return (
    <div
      className={`max-h-32 min-h-10 w-full min-w-0 overflow-y-auto px-3 py-2 text-sm text-text-primary ${SCROLL_AREA_CLASS}`}
      role="region"
      aria-label={t("composer.preview")}
    >
      {renderPreviewContent()}
      {hasFiles && (
        <div
          className={
            outgoingBodyTrim.length > 0 ? "mt-2 flex flex-col gap-2" : "flex flex-col gap-2"
          }
        >
          {files.map((file, i) => {
            const previewUrl = filePreviewUrls[i] ?? null;
            const isImage = previewUrl != null;

            if (isImage) {
              return (
                <img
                  key={`${file.name}-${file.size}-${i}`}
                  src={previewUrl}
                  alt={file.name}
                  className="max-h-[180px] max-w-full self-start rounded object-contain"
                  loading="lazy"
                />
              );
            }

            return (
              <span
                key={`${file.name}-${file.size}-${i}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 py-1 text-xs text-text-primary"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded bg-bg-elevated px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {getAttachmentExtensionLabel(file.name)}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[160px] truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="block text-[10px] text-text-muted">
                    {formatAttachmentSize(file.size)}
                  </span>
                </span>
                {removeFile != null && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="rounded p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});
