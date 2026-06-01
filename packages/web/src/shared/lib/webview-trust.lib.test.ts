import { describe, expect, it } from "vitest";
import { isTrustedWebViewMessageOrigin } from "./webview-trust.lib";

describe("isTrustedWebViewMessageOrigin", () => {
  it("accepts same document origin", () => {
    expect(isTrustedWebViewMessageOrigin(window.location.origin)).toBe(true);
  });

  it("rejects empty and bare null without bridge", () => {
    expect(isTrustedWebViewMessageOrigin("")).toBe(false);
    expect(isTrustedWebViewMessageOrigin("null")).toBe(false);
  });
});
