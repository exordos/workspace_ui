import { describe, expect, it } from "vitest";
import { resolveComposerKeyboardInsetPx } from "./message-composer-keyboard-inset.lib";

describe("message-composer-keyboard-inset", () => {
  it("returns zero outside WebView", () => {
    expect(
      resolveComposerKeyboardInsetPx({
        isWebViewMode: false,
        isKeyboardOpen: true,
        keyboardHeight: 280,
      }),
    ).toBe(0);
  });

  it("returns zero when keyboard is closed", () => {
    expect(
      resolveComposerKeyboardInsetPx({
        isWebViewMode: true,
        isKeyboardOpen: false,
        keyboardHeight: 280,
      }),
    ).toBe(0);
  });

  it("returns clamped positive inset for open keyboard in WebView", () => {
    expect(
      resolveComposerKeyboardInsetPx({
        isWebViewMode: true,
        isKeyboardOpen: true,
        keyboardHeight: 320.8,
      }),
    ).toBe(320);
    expect(
      resolveComposerKeyboardInsetPx({
        isWebViewMode: true,
        isKeyboardOpen: true,
        keyboardHeight: 1024,
      }),
    ).toBe(480);
  });
});
