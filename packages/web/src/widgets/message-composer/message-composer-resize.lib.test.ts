import { describe, expect, it } from "vitest";
import {
  COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
  COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
} from "./message-composer-constants.lib";
import {
  isComposerHeightButtonVisible,
  isComposerResizeHandleVisible,
  shouldReleaseManualComposerResize,
} from "./message-composer-resize.lib";

describe("shouldReleaseManualComposerResize", () => {
  it("releases when content is back at the two-line handle threshold", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
        isFullHeight: false,
        nextHeight: 400,
        minHeight: 200,
      }),
    ).toBe(true);
  });

  it("releases fullscreen when content is back at the two-line handle threshold", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
        isFullHeight: true,
        nextHeight: 800,
        minHeight: 200,
      }),
    ).toBe(true);
  });

  it("releases when the shell is dragged back to its natural height", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: 128,
        isFullHeight: false,
        nextHeight: 200,
        minHeight: 200,
      }),
    ).toBe(true);
  });

  it("keeps fullscreen when the messenger max shrinks down to natural height", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: 128,
        isFullHeight: true,
        nextHeight: 200,
        minHeight: 200,
      }),
    ).toBe(false);
  });

  it("releases when deleted text pulls a non-fullscreen shell down", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: 110,
        isFullHeight: false,
        contentShrunk: true,
        nextHeight: 400,
        minHeight: 200,
      }),
    ).toBe(true);
  });

  it("keeps fullscreen after a content shrink until the two-line floor", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: 110,
        isFullHeight: true,
        contentShrunk: true,
        nextHeight: 800,
        minHeight: 200,
      }),
    ).toBe(false);
  });

  it("keeps a dragged-up shell while content stays tall and does not shrink", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: 128,
        isFullHeight: false,
        nextHeight: 400,
        minHeight: 200,
      }),
    ).toBe(false);
  });
});

describe("isComposerResizeHandleVisible", () => {
  it("shows the handle from two lines, even without a locked height", () => {
    expect(isComposerResizeHandleVisible(COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX, null)).toBe(
      true,
    );
    expect(isComposerResizeHandleVisible(COMPOSER_TEXTAREA_MIN_HEIGHT_PX, null)).toBe(false);
  });

  it("keeps the handle while a manual height is still locked", () => {
    expect(isComposerResizeHandleVisible(COMPOSER_TEXTAREA_MIN_HEIGHT_PX, 400)).toBe(true);
  });
});

describe("isComposerHeightButtonVisible", () => {
  it("shows the button from the four-line threshold, not from a height lock", () => {
    expect(
      isComposerHeightButtonVisible(COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX, false),
    ).toBe(true);
    expect(isComposerHeightButtonVisible(80, false)).toBe(false);
  });

  it("keeps the collapse control while the shell is fullscreen", () => {
    expect(isComposerHeightButtonVisible(80, true)).toBe(true);
  });
});
