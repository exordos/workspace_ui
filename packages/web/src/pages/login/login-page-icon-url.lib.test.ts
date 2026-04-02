import { describe, expect, it } from "vitest";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";

describe("resolveLoginIconUrl", () => {
  it("returns empty for empty icon", () => {
    expect(resolveLoginIconUrl("https://zulip.example.com", "  ")).toBe("");
  });

  it("returns empty for invalid realm base", () => {
    expect(resolveLoginIconUrl("not-a-url", "/icon.png")).toBe("");
  });
});
