export type WorkspaceComposerAttachmentStatus =
  | "validating"
  | "queued"
  | "uploading"
  | "ready"
  | "error";

export interface WorkspaceComposerAttachmentScope {
  ownerKey: string;
  runtimeGeneration: number;
  /** Opaque conversation/stream/topic boundary owned by the future integration. */
  scopeKey: string;
}

export interface WorkspaceComposerAttachmentServerMetadata {
  uuid: string;
  markdownLink: string;
  contentType: string | null;
  name: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export type WorkspaceComposerAttachmentErrorKind = "validation" | "upload";

export interface WorkspaceComposerAttachment {
  localId: string;
  file: File;
  previewUrl: string | null;
  status: WorkspaceComposerAttachmentStatus;
  scope: WorkspaceComposerAttachmentScope;
  attemptToken: number;
  serverMetadata: WorkspaceComposerAttachmentServerMetadata | null;
  error: string | null;
  errorKind: WorkspaceComposerAttachmentErrorKind | null;
  loadedBytes: number;
  totalBytes: number | null;
}

export interface WorkspaceComposerAttachmentView {
  localId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  previewUrl: string | null;
  status: WorkspaceComposerAttachmentStatus;
  serverMetadata: WorkspaceComposerAttachmentServerMetadata | null;
  error: string | null;
  errorKind: WorkspaceComposerAttachmentErrorKind | null;
  loadedBytes: number;
  totalBytes: number | null;
}

export interface WorkspaceComposerReadyAttachmentTransfer {
  localId: string;
  serverMetadata: WorkspaceComposerAttachmentServerMetadata;
}

export interface WorkspaceComposerAttachmentRequestContext {
  localId: string;
  scope: WorkspaceComposerAttachmentScope;
  signal: AbortSignal;
}

export interface WorkspaceComposerAttachmentUploadContext extends WorkspaceComposerAttachmentRequestContext {
  onProgress: (loadedBytes: number, totalBytes?: number | null) => void;
}

export interface WorkspaceComposerAttachmentTransport {
  upload: (
    file: File,
    context: WorkspaceComposerAttachmentUploadContext,
  ) => Promise<WorkspaceComposerAttachmentServerMetadata>;
  delete: (
    metadata: WorkspaceComposerAttachmentServerMetadata,
    context: WorkspaceComposerAttachmentRequestContext,
  ) => Promise<void>;
}

export interface WorkspaceComposerAttachmentsState {
  attachments: WorkspaceComposerAttachment[];
}
