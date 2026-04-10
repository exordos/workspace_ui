/**
 * Regression: overlay must call the same hooks when closed vs open (Rules of Hooks).
 */
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MediaViewerOverlay } from "./media-viewer-overlay.ui";
import { useMediaViewerStore } from "./media-viewer.model";

describe("MediaViewerOverlay", () => {
  afterEach(() => {
    useMediaViewerStore.getState().close();
  });

  it("does not change hook count when opening from closed (no Rules of Hooks violation)", () => {
    const { rerender } = render(<MediaViewerOverlay />);

    useMediaViewerStore.getState().open([{ url: "https://example.com/a.png", type: "image" }], 0);
    rerender(<MediaViewerOverlay />);

    expect(useMediaViewerStore.getState().isOpen).toBe(true);
  });
});
