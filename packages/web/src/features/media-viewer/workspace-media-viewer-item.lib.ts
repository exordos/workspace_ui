import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type {
  MediaItem,
  MediaType,
  MediaViewerResourceState,
  MediaViewerWorkspaceFile,
} from "./media-viewer.types";

export type WorkspaceMediaDownloadHandler = (
  file: Pick<MediaViewerWorkspaceFile, "fileUuid" | "name">,
) => void | Promise<void>;

export interface BuildWorkspaceMediaViewerItemInput {
  file: WorkspaceMessageFileReference;
  downloadFileName: string;
  blob?: Blob;
  objectUrl?: string;
  resourceState?: MediaViewerResourceState;
  onDownload: WorkspaceMediaDownloadHandler;
}

function resolveWorkspaceMediaType(file: WorkspaceMessageFileReference): MediaType | null {
  if (file.kind !== "media") return null;
  if (file.mediaKind === "image" || file.mediaKind === "video") return file.mediaKind;
  return null;
}

export function buildWorkspaceMediaViewerItem({
  file,
  downloadFileName,
  blob,
  objectUrl,
  resourceState,
  onDownload,
}: BuildWorkspaceMediaViewerItemInput): MediaItem | null {
  const type = resolveWorkspaceMediaType(file);
  if (type == null || file.fileUuid.trim().length === 0) return null;

  const blobContentType = blob?.type.trim() ?? "";
  const contentType =
    file.contentType?.trim() || (blobContentType.length > 0 ? blobContentType : undefined);
  const normalizedObjectUrl = objectUrl?.startsWith("blob:") === true ? objectUrl : undefined;
  const resolvedResourceState =
    resourceState ?? (normalizedObjectUrl == null ? "loading" : "ready");

  return {
    url: normalizedObjectUrl ?? "",
    type,
    resourceState: resolvedResourceState,
    ...(type === "image" && normalizedObjectUrl != null ? { previewUrl: normalizedObjectUrl } : {}),
    alt: file.name ?? downloadFileName,
    downloadFileName,
    ...(file.width == null ? {} : { width: file.width }),
    ...(file.height == null ? {} : { height: file.height }),
    workspaceFile: {
      fileUuid: file.fileUuid,
      name: downloadFileName,
      ...(contentType == null ? {} : { contentType }),
      ...(normalizedObjectUrl == null ? {} : { objectUrl: normalizedObjectUrl }),
      onDownload,
    },
  };
}
