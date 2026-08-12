import React from "react";
import { t } from "~/i18n/i18n";
import { AttachmentCard } from "~/shared/ui/attachment-card.ui";
import { formatAttachmentSize, getAttachmentExtensionLabel } from "./message-composer-body.lib";
import type { MessageComposerAttachmentView } from "./message-composer.types";

interface MessageComposerControlledAttachmentCardsProps {
  attachments: readonly MessageComposerAttachmentView[];
  onRemoveAttachment?: (localId: string) => void;
  onRetryAttachment?: (localId: string) => void;
}

export const MessageComposerControlledAttachmentCards = React.memo(
  function MessageComposerControlledAttachmentCards({
    attachments,
    onRemoveAttachment,
    onRetryAttachment,
  }: Readonly<MessageComposerControlledAttachmentCardsProps>) {
    return attachments.map((attachment) => {
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
