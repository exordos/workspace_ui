import React, { useEffect, useMemo, useState } from "react";
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
  imageAliases?: readonly { localId: string; visibleText: string }[];
  inlineImageLocalIds?: ReadonlySet<string>;
}

const EMPTY_IMAGE_ALIASES: readonly { localId: string; visibleText: string }[] = [];
const EMPTY_INLINE_IMAGE_LOCAL_IDS: ReadonlySet<string> = new Set();
const WORKSPACE_INLINE_IMAGE_DRAG_TYPE = "application/x-workspace-inline-image";

function ReadyImageDragWrapper({
  attachmentLocalId,
  children,
  inText,
  visibleText,
  previewAvailable,
}: Readonly<{
  attachmentLocalId: string;
  children: React.ReactNode;
  inText: boolean;
  visibleText: string;
  previewAvailable: boolean;
}>) {
  const canDragIntoMessage = !inText && previewAvailable;
  const className = inText
    ? "relative rounded-lg [&>article]:ring-2 [&>article]:ring-accent/60"
    : "relative cursor-grab [&_img]:pointer-events-none";
  return (
    <div
      draggable={canDragIntoMessage}
      onDragStart={(event) => {
        if (!canDragIntoMessage) return;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", visibleText);
        event.dataTransfer.setData(WORKSPACE_INLINE_IMAGE_DRAG_TYPE, attachmentLocalId);
      }}
      className={className}
      title={canDragIntoMessage ? t("attachmentCard.dragIntoMessage") : t("attachmentCard.inText")}
      role="group"
      aria-label={
        canDragIntoMessage ? t("attachmentCard.dragIntoMessage") : t("attachmentCard.inText")
      }
    >
      {children}
      {inText ? (
        <span
          className="pointer-events-none absolute -left-1 -top-1 z-base flex h-5 min-w-6 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none tracking-wide text-on-accent shadow-sm ring-2 ring-composer-outer"
          aria-hidden
        >
          TX
        </span>
      ) : null}
    </div>
  );
}

function RestoredWorkspaceAttachmentCard({
  attachment,
  onRemove,
  onLoadWorkspaceFilePreview,
  renderCard,
}: Readonly<{
  attachment: MessageComposerAttachmentView;
  onRemove: () => void;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  renderCard: (card: React.ReactElement, previewAvailable: boolean) => React.ReactElement;
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
  const card =
    previewUrl == null ? (
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
  return renderCard(card, previewUrl != null);
}

export const MessageComposerControlledAttachmentCards = React.memo(
  function MessageComposerControlledAttachmentCards({
    attachments,
    onRemoveAttachment,
    onRetryAttachment,
    onLoadWorkspaceFilePreview,
    imageAliases = EMPTY_IMAGE_ALIASES,
    inlineImageLocalIds = EMPTY_INLINE_IMAGE_LOCAL_IDS,
  }: Readonly<MessageComposerControlledAttachmentCardsProps>) {
    const imageAliasByLocalId = useMemo(
      () => new Map(imageAliases.map((alias) => [alias.localId, alias] as const)),
      [imageAliases],
    );

    return attachments.map((attachment) => {
      const alias = imageAliasByLocalId.get(attachment.localId);
      const inText = inlineImageLocalIds.has(attachment.localId);
      const wrapReadyImage = (node: React.ReactElement): React.ReactElement => {
        if (alias == null) return node;
        return (
          <ReadyImageDragWrapper
            key={attachment.localId}
            attachmentLocalId={attachment.localId}
            inText={inText}
            visibleText={alias.visibleText}
            previewAvailable={attachment.previewUrl != null}
          >
            {node}
          </ReadyImageDragWrapper>
        );
      };
      if (attachment.workspaceFile != null) {
        return (
          <RestoredWorkspaceAttachmentCard
            attachment={attachment}
            onRemove={() => onRemoveAttachment?.(attachment.localId)}
            onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
            renderCard={(card, previewAvailable) =>
              alias == null ? (
                card
              ) : (
                <ReadyImageDragWrapper
                  attachmentLocalId={attachment.localId}
                  inText={inText}
                  visibleText={alias.visibleText}
                  previewAvailable={previewAvailable}
                >
                  {card}
                </ReadyImageDragWrapper>
              )
            }
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
        return wrapReadyImage(
          <AttachmentCard
            status="image"
            fileName={attachment.fileName}
            previewUrl={attachment.previewUrl}
            metadata={metadata}
            onRemove={() => onRemoveAttachment?.(attachment.localId)}
          />,
        );
      }
      return wrapReadyImage(
        <AttachmentCard
          status="file"
          fileName={attachment.fileName}
          metadata={metadata}
          onRemove={() => onRemoveAttachment?.(attachment.localId)}
        />,
      );
    });
  },
);
