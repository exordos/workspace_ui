import type { ReactNode } from "react";

interface AttachmentCardBaseProps {
  fileName: string;
  className?: string;
}

interface AttachmentCardRemovableProps {
  onRemove?: () => void;
}

export interface AttachmentReadyCardProps
  extends AttachmentCardBaseProps, AttachmentCardRemovableProps {
  contentType?: string;
  sizeBytes?: number;
  previewUrl?: string;
  appearance?: "default" | "embedded";
  role?: "listitem" | "presentation";
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
  | ({ status: "file" } & AttachmentReadyCardProps)
  | ({ status: "image"; previewUrl: string } & AttachmentReadyCardProps)
  | ({ status: "validating" | "queued" } & AttachmentPendingCardProps)
  | ({ status: "uploading" } & AttachmentUploadingCardProps)
  | ({ status: "error" } & AttachmentErrorCardProps);

export interface AttachmentCardListProps {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}
