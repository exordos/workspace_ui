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
  onCancel?: () => void;
}

export interface AttachmentErrorCardProps extends AttachmentCardBaseProps {
  errorMessage?: string;
  onRetry?: () => void;
}

export type AttachmentCardProps =
  | ({ status: "file" } & AttachmentFileCardProps)
  | ({ status: "image" } & AttachmentImageCardProps)
  | ({ status: "uploading" } & AttachmentUploadingCardProps)
  | ({ status: "error" } & AttachmentErrorCardProps);

export interface AttachmentCardListProps {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}
