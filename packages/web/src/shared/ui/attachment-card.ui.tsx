import React from "react";
import { t } from "~/i18n/i18n";
import AttachmentRetryIcon from "~/shared/assets/icons/attachment-retry.svg?react";
import AttachmentUploadErrorIcon from "~/shared/assets/icons/attachment-upload-error.svg?react";
import type {
  AttachmentCardListProps,
  AttachmentCardMetadata,
  AttachmentCardProps,
  AttachmentErrorCardProps,
  AttachmentFileCardProps,
  AttachmentImageCardProps,
  AttachmentPendingCardProps,
  AttachmentUploadingCardProps,
} from "~/shared/ui/attachment-card.types";
import { Icon } from "~/shared/ui/icon";

const ATTACHMENT_CARD_CLASS_NAME =
  "flex h-[58px] w-60 shrink-0 items-center gap-3 border bg-composer-outer p-2 text-text-primary";

interface AttachmentCardFrameProps {
  fileName: string;
  preview: React.ReactNode;
  details: React.ReactNode;
  action: React.ReactNode;
  tone?: "default" | "error";
  className?: string;
}

function AttachmentCardFrame({
  fileName,
  preview,
  details,
  action,
  tone = "default",
  className = "",
}: Readonly<AttachmentCardFrameProps>) {
  return (
    <article
      className={`${ATTACHMENT_CARD_CLASS_NAME} ${
        tone === "error" ? "rounded-xl border-danger" : "rounded-lg border-border-subtle"
      } ${className}`.trim()}
      role="listitem"
    >
      {preview}
      <span className="w-[134px] min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium leading-[14px]" title={fileName}>
          {fileName}
        </span>
        <span className="mt-0.5 block truncate text-xs leading-[15px] text-text-muted">
          {details}
        </span>
      </span>
      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center">{action}</span>
    </article>
  );
}

function AttachmentMetadataText({ metadata }: Readonly<{ metadata: AttachmentCardMetadata }>) {
  return (
    <>
      <span>{metadata.formatLabel}</span>
      {metadata.sizeLabel != null && metadata.sizeLabel.length > 0 ? (
        <>
          <span aria-hidden> · </span>
          <span>{metadata.sizeLabel}</span>
        </>
      ) : null}
    </>
  );
}

function AttachmentActionButton({
  ariaLabel,
  onClick,
  children,
}: Readonly<{
  ariaLabel: string;
  onClick?: () => void;
  children: React.ReactNode;
}>) {
  if (onClick == null) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      aria-label={ariaLabel}
      title={ariaLabel}
      data-icon-hover="custom"
    >
      {children}
    </button>
  );
}

function AttachmentFilePreview() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg">
      <Icon name="files" size={18} className="text-text-muted" />
    </span>
  );
}

export const AttachmentFileCard = React.memo<AttachmentFileCardProps>(
  ({ fileName, metadata, onRemove, className }) => (
    <AttachmentCardFrame
      fileName={fileName}
      preview={<AttachmentFilePreview />}
      details={<AttachmentMetadataText metadata={metadata} />}
      action={
        <AttachmentActionButton
          ariaLabel={t("attachmentCard.remove", { fileName })}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </AttachmentActionButton>
      }
      className={className}
    />
  ),
);

AttachmentFileCard.displayName = "AttachmentFileCard";

export const AttachmentImageCard = React.memo<AttachmentImageCardProps>(
  ({ fileName, previewUrl, metadata, onRemove, className }) => (
    <AttachmentCardFrame
      fileName={fileName}
      preview={
        <img
          src={previewUrl}
          alt={fileName}
          className="h-10 w-10 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      }
      details={<AttachmentMetadataText metadata={metadata} />}
      action={
        <AttachmentActionButton
          ariaLabel={t("attachmentCard.remove", { fileName })}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </AttachmentActionButton>
      }
      className={className}
    />
  ),
);

AttachmentImageCard.displayName = "AttachmentImageCard";

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function AttachmentProgressPreview({
  fileName,
  progress,
}: Readonly<{ fileName: string; progress: number }>) {
  const safeProgress = clampProgress(progress);
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg"
      role="progressbar"
      aria-label={t("attachmentCard.uploadProgress", {
        fileName,
        percent: safeProgress,
      })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeProgress}
    >
      <span
        className="relative h-[18px] w-[18px] rounded-full"
        style={{
          background: `conic-gradient(var(--color-accent) ${safeProgress}%, color-mix(in srgb, var(--color-text-muted) 24%, transparent) 0)`,
        }}
        aria-hidden
      >
        <span className="absolute inset-[3px] rounded-full bg-bg" />
      </span>
    </span>
  );
}

export const AttachmentUploadingCard = React.memo<AttachmentUploadingCardProps>(
  ({ fileName, progress, detailText, onCancel, className }) => {
    const safeProgress = clampProgress(progress);
    return (
      <AttachmentCardFrame
        fileName={fileName}
        preview={<AttachmentProgressPreview fileName={fileName} progress={safeProgress} />}
        details={detailText ?? t("attachmentCard.uploading", { percent: safeProgress })}
        action={
          <AttachmentActionButton
            ariaLabel={t("attachmentCard.cancelUpload", { fileName })}
            onClick={onCancel}
          >
            <Icon name="close" size={12} />
          </AttachmentActionButton>
        }
        className={className}
      />
    );
  },
);

AttachmentUploadingCard.displayName = "AttachmentUploadingCard";

export const AttachmentPendingCard = React.memo<AttachmentPendingCardProps>(
  ({ fileName, detailText, onRemove, className }) => (
    <AttachmentCardFrame
      fileName={fileName}
      preview={<AttachmentFilePreview />}
      details={detailText}
      action={
        <AttachmentActionButton
          ariaLabel={t("attachmentCard.remove", { fileName })}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </AttachmentActionButton>
      }
      className={className}
    />
  ),
);

AttachmentPendingCard.displayName = "AttachmentPendingCard";

export const AttachmentErrorCard = React.memo<AttachmentErrorCardProps>(
  ({ fileName, errorMessage = t("attachmentCard.uploadError"), onRetry, onRemove, className }) => (
    <AttachmentCardFrame
      fileName={fileName}
      preview={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg">
          <AttachmentUploadErrorIcon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      }
      details={<span className="text-danger">{errorMessage}</span>}
      action={
        <span className="flex items-center">
          <AttachmentActionButton
            ariaLabel={t("attachmentCard.retryUpload", { fileName })}
            onClick={onRetry}
          >
            <AttachmentRetryIcon className="h-4 w-4" aria-hidden />
          </AttachmentActionButton>
          <AttachmentActionButton
            ariaLabel={t("attachmentCard.remove", { fileName })}
            onClick={onRemove}
          >
            <Icon name="close" size={12} />
          </AttachmentActionButton>
        </span>
      }
      tone="error"
      className={className}
    />
  ),
);

AttachmentErrorCard.displayName = "AttachmentErrorCard";

export const AttachmentCard = React.memo<AttachmentCardProps>((props) => {
  switch (props.status) {
    case "file":
      return <AttachmentFileCard {...props} />;
    case "image":
      return <AttachmentImageCard {...props} />;
    case "validating":
    case "queued":
      return <AttachmentPendingCard {...props} />;
    case "uploading":
      return <AttachmentUploadingCard {...props} />;
    case "error":
      return <AttachmentErrorCard {...props} />;
  }
});

AttachmentCard.displayName = "AttachmentCard";

export const AttachmentCardList = React.memo<AttachmentCardListProps>(
  ({ children, ariaLabel, className = "" }) => (
    <div
      className={`flex flex-nowrap items-center gap-2.5 overflow-x-auto scrollbar-none ${className}`.trim()}
      role="list"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  ),
);

AttachmentCardList.displayName = "AttachmentCardList";
