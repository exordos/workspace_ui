import type {
  WorkspaceMessageDocument,
  WorkspaceMessageFileReference,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import {
  collectWorkspaceMarkdownFileReferences,
  collectWorkspaceMarkdownPreviewFileReferences,
} from "~/shared/lib/workspace-message-render/workspace-message-marked.lib";

export function collectWorkspaceMessageFileReferences(
  document: WorkspaceMessageDocument,
): readonly WorkspaceMessageFileReference[] {
  return collectWorkspaceMarkdownFileReferences(document.markdownTokens);
}

export function collectWorkspaceMessagePreviewFileReferences(
  document: WorkspaceMessageDocument,
): readonly WorkspaceMessageFileReference[] {
  return collectWorkspaceMarkdownPreviewFileReferences(document.markdownTokens);
}

export function selectWorkspaceMessageMediaPreviewReference(
  document: WorkspaceMessageDocument,
): WorkspaceMessageFileReference | null {
  let firstVideo: WorkspaceMessageFileReference | null = null;

  for (const reference of collectWorkspaceMessagePreviewFileReferences(document)) {
    if (reference.kind !== "media") continue;
    if (reference.mediaKind === "image") return reference;
    if (reference.mediaKind === "video" && firstVideo == null) {
      firstVideo = reference;
    }
  }

  return firstVideo;
}
