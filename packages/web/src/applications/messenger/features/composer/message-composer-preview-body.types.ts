import type { LoadWorkspaceFilePreview } from "~/applications/messenger/features/timeline/messenger-workspace-message-file-preview.hook";
import type {
  WorkspaceMessageBodyMetadata,
  WorkspaceMessageFileReference,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type { MessageComposerAttachmentView } from "./message-composer.types";

export interface MessageComposerPreviewBodyProps {
  outgoingBodyTrim: string;
  previewLoading: boolean;
  previewError: string | null;
  previewHtml: string;
  previewMetadata: WorkspaceMessageBodyMetadata | null;
  fileReferences: readonly WorkspaceMessageFileReference[];
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  files?: File[];
  filePreviewUrls?: (string | null)[];
  removeFile?: (index: number) => void;
  attachments?: readonly MessageComposerAttachmentView[];
  onRemoveAttachment?: (localId: string) => void;
  onOpenComposerMedia?: (
    localId: string,
    attachments: readonly MessageComposerAttachmentView[],
  ) => void;
  onRetryAttachment?: (localId: string) => void;
}
