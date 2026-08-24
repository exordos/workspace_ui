import { describe, expect, it } from "vitest";
import {
  COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
  COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
} from "./message-composer-constants.lib";
import {
  isComposerResizeHandleVisible,
  resolveComposerHeightButtonVisibility,
  resolveComposerManualEditorMinHeight,
  shouldReleaseManualComposerResize,
} from "./message-composer-resize.lib";

describe("shouldReleaseManualComposerResize", () => {
  it("keeps short content locked while the shell is above its natural floor", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
        isFullHeight: false,
        nextHeight: 400,
        minHeight: 200,
      }),
    ).toBe(false);
  });

  it("releases short content when the shell reaches its natural floor", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
        isFullHeight: false,
        nextHeight: 200,
        minHeight: 200,
      }),
    ).toBe(true);
  });

  it("keeps long content locked at the four-line floor", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: 128,
        isFullHeight: false,
        nextHeight: 200,
        minHeight: 200,
      }),
    ).toBe(false);
  });

  it("keeps fullscreen even when content becomes short", () => {
    expect(
      shouldReleaseManualComposerResize({
        textareaContentHeight: COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
        isFullHeight: true,
        nextHeight: 800,
        minHeight: 200,
      }),
    ).toBe(false);
  });
});

describe("resolveComposerManualEditorMinHeight", () => {
  it("uses natural short heights and caps long content at four lines", () => {
    expect(resolveComposerManualEditorMinHeight(40)).toBe(40);
    expect(resolveComposerManualEditorMinHeight(64)).toBe(64);
    expect(resolveComposerManualEditorMinHeight(80)).toBe(80);
    expect(resolveComposerManualEditorMinHeight(300)).toBe(96);
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

describe("resolveComposerHeightButtonVisibility", () => {
  it("enters the tall layout at the four-line threshold", () => {
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX,
        isFullHeight: false,
        isManualResize: false,
        wasVisible: false,
      }),
    ).toBe(true);
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: 80,
        isFullHeight: false,
        isManualResize: false,
        wasVisible: false,
      }),
    ).toBe(false);
  });

  it("keeps the tall layout through the hysteresis window", () => {
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: 80,
        isFullHeight: false,
        isManualResize: false,
        wasVisible: true,
      }),
    ).toBe(true);
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
        isFullHeight: false,
        isManualResize: false,
        wasVisible: true,
      }),
    ).toBe(false);
  });

  it("follows the actual editor height during a manual resize", () => {
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: 104,
        isFullHeight: false,
        isManualResize: true,
        wasVisible: false,
      }),
    ).toBe(true);
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: 80,
        isFullHeight: false,
        isManualResize: true,
        wasVisible: true,
      }),
    ).toBe(false);
  });

  it("resets the auto hysteresis after a manual resize returns to natural height", () => {
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: 80,
        isFullHeight: false,
        isManualResize: false,
        resetHysteresis: true,
        wasVisible: true,
      }),
    ).toBe(false);
  });

  it("keeps the collapse control while the shell is fullscreen", () => {
    expect(
      resolveComposerHeightButtonVisibility({
        effectiveEditorHeight: 40,
        isFullHeight: true,
        isManualResize: true,
        wasVisible: false,
      }),
    ).toBe(true);
  });
});
