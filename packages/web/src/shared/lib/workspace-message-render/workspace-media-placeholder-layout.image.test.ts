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
  it("reserves the displayed height without usable dimensions, which is all it needs", () => {
    // Anything taller than the cap is displayed at exactly the cap, so the height is
    // known even when the message states no size; only the width is a guess.
    for (const reference of [
      imageReference(),
      imageReference({ width: 100 }),
      imageReference({ width: 0, height: 100 }),
    ]) {
      expect(deriveWorkspaceImagePlaceholderLayout(reference)).toEqual({
        width: 240,
        height: 180,
        aspectRatio: 4 / 3,
        usesMetadata: false,
      });
    }
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

  // A wide image runs out of bubble before it runs out of cap, and then it is the
  // width that decides its height. Reserving the cap regardless is the same jump the
  // reservation exists to remove, only downwards.
  it("derives the height from the room available when the image is wider than it", () => {
    const layout = deriveWorkspaceImagePlaceholderLayout(
      imageReference({ width: 2400, height: 400 }),
      { maxWidth: 700 },
    );

    expect(layout).toEqual({ width: 700, height: 117, aspectRatio: 6, usesMetadata: true });
  });

  it("leaves an image that fits alone", () => {
    const layout = deriveWorkspaceImagePlaceholderLayout(
      imageReference({ width: 640, height: 480 }),
      { maxWidth: 700 },
    );

    expect(layout).toEqual({ width: 240, height: 180, aspectRatio: 1.3333, usesMetadata: true });
  });

  it("caps the guessed width without moving the height it cannot derive", () => {
    const layout = deriveWorkspaceImagePlaceholderLayout(imageReference(), { maxWidth: 160 });

    expect(layout).toEqual({ width: 160, height: 180, aspectRatio: 4 / 3, usesMetadata: false });
  });

  it("uses the tighter cap inside a composition row", () => {
    const layout = deriveWorkspaceImagePlaceholderLayout(
      imageReference({ width: 640, height: 960 }),
      { inComposition: true },
    );

    expect(layout).toEqual({ width: 67, height: 100, aspectRatio: 0.6667, usesMetadata: true });
  });
});
