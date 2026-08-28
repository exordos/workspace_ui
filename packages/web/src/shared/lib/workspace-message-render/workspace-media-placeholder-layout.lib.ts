import type { WorkspaceMessageFileReference } from "./workspace-message-document.types";

const DEFAULT_VIDEO_WIDTH = 320;
/** Mirrors the loaded image's max height in messenger-workspace-message-body.ui.tsx. */
const MAX_IMAGE_HEIGHT = 180;
const MAX_COMPOSITION_IMAGE_HEIGHT = 100;
const MAX_VIDEO_WIDTH = 320;
const MAX_VIDEO_HEIGHT = 240;
const MIN_DISPLAY_ASPECT_RATIO = 1 / 2;
const MAX_DISPLAY_ASPECT_RATIO = 2;

export interface WorkspaceMediaPlaceholderLayout {
  width: number;
  aspectRatio: number;
  usesMetadata: boolean;
}

export interface WorkspaceImagePlaceholderLayout extends WorkspaceMediaPlaceholderLayout {
  /** Stated outright: an aspect ratio alone loses to the placeholder's own content. */
  height: number;
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

/**
 * The box an image will occupy once it has loaded, so the text below it does not
 * move when the bytes arrive. Mirrors what the loaded image is styled to:
 * height capped, width following the aspect ratio, never wider than the bubble.
 *
 * Null when the reference carries no usable dimensions — the `w`/`h` params are
 * written by the sending client and are not always there. Reserving a guessed box
 * would just trade one jump for another.
 */
export function deriveWorkspaceImagePlaceholderLayout(
  reference: WorkspaceMessageFileReference,
  options: { inComposition?: boolean } = {},
): WorkspaceImagePlaceholderLayout | null {
  if (!hasValidDimensions(reference)) return null;

  const maxHeight =
    options.inComposition === true ? MAX_COMPOSITION_IMAGE_HEIGHT : MAX_IMAGE_HEIGHT;
  const aspectRatio = reference.width / reference.height;
  const height = Math.min(maxHeight, reference.height);

  return {
    width: Math.round(height * aspectRatio),
    height,
    // Rounded so the emitted style stays short and stable.
    aspectRatio: Number(aspectRatio.toFixed(4)),
    usesMetadata: true,
  };
}
