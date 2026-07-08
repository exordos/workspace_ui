import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type {
  WorkspaceMessageBodyMetadata,
  WorkspaceMessageFileReference,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";

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
}
