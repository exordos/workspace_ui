import React, { useEffect, useState } from "react";
import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import { t } from "~/i18n/i18n";
import { createDisplayableBlobUrl } from "~/shared/lib/media-display-url.lib";
import { AttachmentCard } from "~/shared/ui/attachment-card.ui";
import { formatAttachmentSize, getAttachmentExtensionLabel } from "./message-composer-body.lib";
import type { MessageComposerAttachmentView } from "./message-composer.types";

interface MessageComposerControlledAttachmentCardsProps {
  attachments: readonly MessageComposerAttachmentView[];
  onRemoveAttachment?: (localId: string) => void;
  onRetryAttachment?: (localId: string) => void;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
}

function RestoredWorkspaceAttachmentCard({
  attachment,
  onRemove,
  onLoadWorkspaceFilePreview,
}: Readonly<{
  attachment: MessageComposerAttachmentView;
  onRemove: () => void;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
}>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const reference = attachment.workspaceFile;

  useEffect(() => {
    if (
      reference?.kind !== "media" ||
      reference.mediaKind !== "image" ||
      onLoadWorkspaceFilePreview == null
    ) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const revokeRegistry: string[] = [];
    void onLoadWorkspaceFilePreview(reference, controller.signal)
      .then((blob) => createDisplayableBlobUrl(blob, revokeRegistry))
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        setPreviewUrl(url);
      })
      .catch(() => {
        if (active) setPreviewUrl(null);
      });
    return () => {
      active = false;
      controller.abort();
      for (const url of revokeRegistry) URL.revokeObjectURL(url);
    };
  }, [onLoadWorkspaceFilePreview, reference]);

  const metadata = {
    formatLabel: getAttachmentExtensionLabel(attachment.fileName),
    sizeLabel: formatAttachmentSize(attachment.sizeBytes),
  };
  return previewUrl == null ? (
    <AttachmentCard
      status="file"
      fileName={attachment.fileName}
      metadata={metadata}
      onRemove={onRemove}
    />
  ) : (
    <AttachmentCard
      status="image"
      fileName={attachment.fileName}
      previewUrl={previewUrl}
      metadata={metadata}
      onRemove={onRemove}
    />
  );
}

export const MessageComposerControlledAttachmentCards = React.memo(
  function MessageComposerControlledAttachmentCards({
    attachments,
    onRemoveAttachment,
    onRetryAttachment,
    onLoadWorkspaceFilePreview,
  }: Readonly<MessageComposerControlledAttachmentCardsProps>) {
    return attachments.map((attachment) => {
      if (attachment.workspaceFile != null) {
        return (
          <RestoredWorkspaceAttachmentCard
            key={attachment.localId}
            attachment={attachment}
            onRemove={() => onRemoveAttachment?.(attachment.localId)}
            onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
          />
        );
      }
      const metadata = {
        formatLabel: getAttachmentExtensionLabel(attachment.fileName),
        sizeLabel: formatAttachmentSize(attachment.sizeBytes),
      };
      if (attachment.status === "error") {
        return (
          <AttachmentCard
            key={attachment.localId}
            status="error"
            fileName={attachment.fileName}
            errorMessage={attachment.error ?? t("attachmentCard.uploadError")}
            onRetry={
              attachment.retryable ? () => onRetryAttachment?.(attachment.localId) : undefined
            }
            onRemove={() => onRemoveAttachment?.(attachment.localId)}
          />
        );
      }
      if (attachment.status === "validating" || attachment.status === "queued") {
        return (
          <AttachmentCard
            key={attachment.localId}
            status={attachment.status}
            fileName={attachment.fileName}
            detailText={
              attachment.status === "validating"
                ? t("attachmentCard.validating")
                : t("attachmentCard.queued")
            }
            onRemove={() => onRemoveAttachment?.(attachment.localId)}
          />
        );
      }
      if (attachment.status === "uploading") {
        const total = attachment.totalBytes ?? attachment.sizeBytes;
        const progress = total > 0 ? Math.round((attachment.loadedBytes / total) * 100) : 0;
        return (
          <AttachmentCard
            key={attachment.localId}
            status="uploading"
            fileName={attachment.fileName}
            progress={progress}
            onCancel={() => onRemoveAttachment?.(attachment.localId)}
          />
        );
      }
      if (attachment.previewUrl != null) {
        return (
          <AttachmentCard
            key={attachment.localId}
            status="image"
            fileName={attachment.fileName}
            previewUrl={attachment.previewUrl}
            metadata={metadata}
            onRemove={() => onRemoveAttachment?.(attachment.localId)}
          />
        );
      }
      return (
        <AttachmentCard
          key={attachment.localId}
          status="file"
          fileName={attachment.fileName}
          metadata={metadata}
          onRemove={() => onRemoveAttachment?.(attachment.localId)}
        />
      );
    });
  },
);
