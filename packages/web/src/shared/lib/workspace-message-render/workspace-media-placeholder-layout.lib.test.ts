import { describe, expect, it } from "vitest";
import { deriveWorkspaceMediaPlaceholderLayout } from "./workspace-media-placeholder-layout.lib";
import type { WorkspaceMessageFileReference } from "./workspace-message-document.types";

function videoReference(
  dimensions: Pick<WorkspaceMessageFileReference, "width" | "height">,
): WorkspaceMessageFileReference {
  return {
    kind: "media",
    href: "urn:video:22222222-2222-4222-8222-222222222222",
    fileUuid: "22222222-2222-4222-8222-222222222222",
    mediaKind: "video",
    ...dimensions,
  };
}

describe("deriveWorkspaceMediaPlaceholderLayout", () => {
  it.each([
    [
      { width: 1920, height: 1080 },
      { width: 320, aspectRatio: 16 / 9 },
    ],
    [
      { width: 1080, height: 1920 },
      { width: 135, aspectRatio: 9 / 16 },
    ],
    [
      { width: 800, height: 800 },
      { width: 240, aspectRatio: 1 },
    ],
  ])("preserves valid media ratio for %o", (dimensions, expected) => {
    expect(deriveWorkspaceMediaPlaceholderLayout(videoReference(dimensions))).toEqual({
      ...expected,
      usesMetadata: true,
    });
  });

  it.each([
    {},
    { width: 1920 },
    { height: 1080 },
    { width: 0, height: 1080 },
    { width: -1, height: 1080 },
    { width: Number.POSITIVE_INFINITY, height: 1080 },
  ])("uses a 16:9 fallback for invalid dimensions %o", (dimensions) => {
    expect(deriveWorkspaceMediaPlaceholderLayout(videoReference(dimensions))).toEqual({
      width: 320,
      aspectRatio: 16 / 9,
      usesMetadata: false,
    });
  });

  it.each([
    [
      { width: 100_000, height: 100 },
      { width: 320, aspectRatio: 2 },
    ],
    [
      { width: 100, height: 100_000 },
      { width: 120, aspectRatio: 1 / 2 },
    ],
  ])("bounds extreme display ratios for %o", (dimensions, expected) => {
    expect(deriveWorkspaceMediaPlaceholderLayout(videoReference(dimensions))).toEqual({
      ...expected,
      usesMetadata: true,
    });
  });
});
