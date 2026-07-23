import type { WorkspaceMessageFileReference } from "./workspace-message-document.types";

const DEFAULT_VIDEO_WIDTH = 320;
const MAX_VIDEO_WIDTH = 320;
const MAX_VIDEO_HEIGHT = 240;
const MIN_DISPLAY_ASPECT_RATIO = 1 / 2;
const MAX_DISPLAY_ASPECT_RATIO = 2;

export interface WorkspaceMediaPlaceholderLayout {
  width: number;
  aspectRatio: number;
  usesMetadata: boolean;
}

function hasValidDimensions(
  reference: WorkspaceMessageFileReference,
): reference is WorkspaceMessageFileReference & { width: number; height: number } {
  return (
    reference.width != null &&
    reference.height != null &&
    Number.isFinite(reference.width) &&
    Number.isFinite(reference.height) &&
    reference.width > 0 &&
    reference.height > 0
  );
}

export function deriveWorkspaceMediaPlaceholderLayout(
  reference: WorkspaceMessageFileReference,
): WorkspaceMediaPlaceholderLayout {
  if (!hasValidDimensions(reference)) {
    return {
      width: DEFAULT_VIDEO_WIDTH,
      aspectRatio: 16 / 9,
      usesMetadata: false,
    };
  }

  const sourceAspectRatio = reference.width / reference.height;
  const displayAspectRatio = Math.min(
    MAX_DISPLAY_ASPECT_RATIO,
    Math.max(MIN_DISPLAY_ASPECT_RATIO, sourceAspectRatio),
  );

  return {
    width: Math.min(MAX_VIDEO_WIDTH, MAX_VIDEO_HEIGHT * displayAspectRatio),
    aspectRatio: displayAspectRatio,
    usesMetadata: true,
  };
}
