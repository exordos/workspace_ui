import type { WorkspaceMessageFileReference } from "./workspace-message-document.types";

const DEFAULT_VIDEO_WIDTH = 320;
/** Mirrors the loaded image's max height in messenger-workspace-message-body.ui.tsx. */
const MAX_IMAGE_HEIGHT = 180;
const MAX_COMPOSITION_IMAGE_HEIGHT = 100;
const MAX_VIDEO_WIDTH = 320;
const MAX_VIDEO_HEIGHT = 240;
const MIN_DISPLAY_ASPECT_RATIO = 1 / 2;
/** Only the width is a guess when a message states no size; the height is the cap. */
const UNKNOWN_DISPLAY_ASPECT_RATIO = 4 / 3;
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

function isUsableMaxWidth(maxWidth: number | undefined): maxWidth is number {
  return maxWidth != null && Number.isFinite(maxWidth) && maxWidth > 0;
}

/**
 * The box an image will occupy once it has loaded, so the text below it does not
 * move when the bytes arrive. Mirrors what the loaded image is styled to:
 * height capped, width following the aspect ratio, never wider than the bubble.
 *
 * A wide image runs out of bubble before it runs out of cap, and then it is the
 * width that decides its height. `maxWidth` is the room the placeholder actually
 * has; without it the reserved height would stay at the cap while the loaded image
 * came out shorter, which is the same jump the reservation exists to remove. It is
 * measured from the DOM at reserve time, so the markup emitted without it is
 * corrected before the first paint.
 *
 * The `w`/`h` params are written by the sending client and are not always there —
 * nothing bridged from another messenger carries them. The height is still known
 * for all but the smallest images: anything taller than the cap is displayed at
 * exactly the cap, so that is what gets reserved, with a neutral width. Only an
 * image shorter than the cap then changes the layout, and only until its size has
 * been measured once.
 */
export function deriveWorkspaceImagePlaceholderLayout(
  reference: WorkspaceMessageFileReference,
  options: { inComposition?: boolean; maxWidth?: number } = {},
): WorkspaceImagePlaceholderLayout | null {
  const maxHeight =
    options.inComposition === true ? MAX_COMPOSITION_IMAGE_HEIGHT : MAX_IMAGE_HEIGHT;
  const maxWidth = options.maxWidth;

  if (!hasValidDimensions(reference)) {
    const width = Math.round(maxHeight * UNKNOWN_DISPLAY_ASPECT_RATIO);
    return {
      // The width is a guess either way, so the room available only caps it. The
      // height stays at the cap: without an aspect ratio there is nothing to derive
      // a shorter one from.
      width: isUsableMaxWidth(maxWidth) ? Math.min(width, Math.round(maxWidth)) : width,
      height: maxHeight,
      aspectRatio: UNKNOWN_DISPLAY_ASPECT_RATIO,
      usesMetadata: false,
    };
  }

  const aspectRatio = reference.width / reference.height;
  const cappedHeight = Math.min(maxHeight, reference.height);
  const cappedWidth = Math.round(cappedHeight * aspectRatio);
  const width = isUsableMaxWidth(maxWidth)
    ? Math.min(cappedWidth, Math.round(maxWidth))
    : cappedWidth;

  return {
    width,
    height: width === cappedWidth ? cappedHeight : Math.round(width / aspectRatio),
    // Rounded so the emitted style stays short and stable.
    aspectRatio: Number(aspectRatio.toFixed(4)),
    usesMetadata: true,
  };
}
