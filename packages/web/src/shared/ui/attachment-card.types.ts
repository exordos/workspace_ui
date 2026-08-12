import type { ReactNode } from "react";

export interface AttachmentCardMetadata {
  formatLabel: string;
  sizeLabel?: string;
}

interface AttachmentCardBaseProps {
  fileName: string;
  className?: string;
}

interface AttachmentCardRemovableProps {
  onRemove?: () => void;
}

export interface AttachmentFileCardProps
  extends AttachmentCardBaseProps, AttachmentCardRemovableProps {
  metadata: AttachmentCardMetadata;
}

export interface AttachmentImageCardProps
  extends AttachmentCardBaseProps, AttachmentCardRemovableProps {
  previewUrl: string;
  metadata: AttachmentCardMetadata;
}

export interface AttachmentUploadingCardProps extends AttachmentCardBaseProps {
  progress: number;
  detailText?: string;
  onCancel?: () => void;
}

export interface AttachmentPendingCardProps
  extends AttachmentCardBaseProps, AttachmentCardRemovableProps {
  detailText: string;
}

export interface AttachmentErrorCardProps
  extends AttachmentCardBaseProps, AttachmentCardRemovableProps {
  errorMessage?: string;
  onRetry?: () => void;
}

export type AttachmentCardProps =
  | ({ status: "file" } & AttachmentFileCardProps)
  | ({ status: "image" } & AttachmentImageCardProps)
  | ({ status: "validating" | "queued" } & AttachmentPendingCardProps)
  | ({ status: "uploading" } & AttachmentUploadingCardProps)
  | ({ status: "error" } & AttachmentErrorCardProps);

export interface AttachmentCardListProps {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}
