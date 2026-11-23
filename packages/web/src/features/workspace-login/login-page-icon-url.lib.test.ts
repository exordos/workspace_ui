import { afterEach, describe, expect, it, vi } from "vitest";
import * as electron from "~/shared/lib/electron";
import { resolveLoginIconUrl } from "./login-page-icon-url.lib";

describe("resolveLoginIconUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty for empty icon", () => {
    expect(resolveLoginIconUrl("https://zulip.example.com", "  ")).toBe("");
  });

  it("returns empty for invalid realm base", () => {
    expect(resolveLoginIconUrl("not-a-url", "/icon.png")).toBe("");
  });

  it("blocks same-origin icon urls in the browser to avoid Basic Auth on img", () => {
    vi.spyOn(electron, "isElectron").mockReturnValue(false);
    expect(resolveLoginIconUrl("https://chat.example.com", "/user_avatars/1/realm/icon.png")).toBe(
      "",
    );
  });

  it("resolves same-origin icon urls in Electron", () => {
    vi.spyOn(electron, "isElectron").mockReturnValue(true);
    expect(resolveLoginIconUrl("https://chat.example.com", "/user_avatars/1/realm/icon.png")).toBe(
      "https://chat.example.com/user_avatars/1/realm/icon.png",
    );
  });
});
