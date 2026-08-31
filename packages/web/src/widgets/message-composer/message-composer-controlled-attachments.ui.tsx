import React, { useEffect, useMemo, useState } from "react";
import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import { t } from "~/i18n/i18n";
import { createDisplayableBlobUrl } from "~/shared/lib/media-display-url.lib";
import { AttachmentCard } from "~/shared/ui/attachment-card.ui";
import { Icon } from "~/shared/ui/icon";
import { formatAttachmentSize, getAttachmentExtensionLabel } from "./message-composer-body.lib";
import type { MessageComposerAttachmentView } from "./message-composer.types";

interface MessageComposerControlledAttachmentCardsProps {
  attachments: readonly MessageComposerAttachmentView[];
  onRemoveAttachment?: (localId: string) => void;
  onRemoveImageFromText?: (localId: string) => void;
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
  onRemoveImageFromText,
}: Readonly<{
  attachmentLocalId: string;
  children: React.ReactNode;
  inText: boolean;
  visibleText: string;
  previewAvailable: boolean;
  onRemoveImageFromText?: (localId: string) => void;
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
      className={`${className} group/inline-image`}
      title={canDragIntoMessage ? t("attachmentCard.dragIntoMessage") : t("attachmentCard.inText")}
      role="group"
      aria-label={
        canDragIntoMessage ? t("attachmentCard.dragIntoMessage") : t("attachmentCard.inText")
      }
    >
      {children}
      {inText ? (
        <span className="absolute -bottom-1 -right-1 z-base flex h-5 min-w-0 items-center justify-center overflow-hidden rounded-full bg-accent px-1 text-[9px] font-bold leading-none tracking-wide text-on-accent shadow-sm ring-2 ring-composer-outer transition-[min-width] duration-150 ease-out group-focus-within/inline-image:min-w-12 group-hover/inline-image:min-w-12">
          TX
          <button
            type="button"
            className="pointer-events-none inline-flex h-4 w-0 min-w-0 max-w-0 shrink-0 items-center justify-center overflow-hidden opacity-0 transition-[opacity,margin,max-width] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-on-accent group-focus-within/inline-image:pointer-events-auto group-focus-within/inline-image:ml-0.5 group-focus-within/inline-image:w-4 group-focus-within/inline-image:max-w-4 group-focus-within/inline-image:opacity-100 group-hover/inline-image:pointer-events-auto group-hover/inline-image:ml-0.5 group-hover/inline-image:w-4 group-hover/inline-image:max-w-4 group-hover/inline-image:opacity-100"
            aria-label={t("attachmentCard.removeFromText")}
            title={t("attachmentCard.removeFromText")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRemoveImageFromText?.(attachmentLocalId);
            }}
          >
            <Icon name="close" size={11} />
          </button>
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
    onRemoveImageFromText,
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
            onRemoveImageFromText={onRemoveImageFromText}
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
                  onRemoveImageFromText={onRemoveImageFromText}
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
