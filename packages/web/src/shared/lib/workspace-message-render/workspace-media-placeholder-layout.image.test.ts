/**
 * An image that does not reserve its box moves everything below it when the bytes
 * arrive — the jump users report while scrolling a chat with pictures. The reserved
 * box has to match what the loaded image is styled to, or it just trades one jump
 * for another.
 */
import { describe, expect, it } from "vitest";
import { deriveWorkspaceImagePlaceholderLayout } from "./workspace-media-placeholder-layout.lib";
import type { WorkspaceMessageFileReference } from "./workspace-message-document.types";

function imageReference(
  overrides: Partial<WorkspaceMessageFileReference> = {},
): WorkspaceMessageFileReference {
  return {
    kind: "media",
    mediaKind: "image",
    href: "urn:image:11111111-1111-4111-8111-111111111111",
    fileUuid: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

describe("deriveWorkspaceImagePlaceholderLayout", () => {
  // The `w`/`h` params are written by the sending client and are not always there.
  it("reserves nothing without usable dimensions", () => {
    expect(deriveWorkspaceImagePlaceholderLayout(imageReference())).toBeNull();
    expect(deriveWorkspaceImagePlaceholderLayout(imageReference({ width: 100 }))).toBeNull();
    expect(
      deriveWorkspaceImagePlaceholderLayout(imageReference({ width: 0, height: 100 })),
    ).toBeNull();
  });

  it("caps a tall image at the height the loaded image is styled to", () => {
    const layout = deriveWorkspaceImagePlaceholderLayout(
      imageReference({ width: 640, height: 960 }),
    );

    expect(layout).toEqual({ width: 120, height: 180, aspectRatio: 0.6667, usesMetadata: true });
  });

  it("leaves an image shorter than the cap at its own size", () => {
    const layout = deriveWorkspaceImagePlaceholderLayout(
      imageReference({ width: 120, height: 60 }),
    );

    expect(layout).toEqual({ width: 120, height: 60, aspectRatio: 2, usesMetadata: true });
  });

  it("uses the tighter cap inside a composition row", () => {
    const layout = deriveWorkspaceImagePlaceholderLayout(
      imageReference({ width: 640, height: 960 }),
      { inComposition: true },
    );

    expect(layout).toEqual({ width: 67, height: 100, aspectRatio: 0.6667, usesMetadata: true });
  });
});
