import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_IMAGE_PLACEHOLDER_SRC,
  collapseDuplicateWorkspaceV1InUrl,
  isAuthMediaPlaceholderAttr,
  resolveProtectedUploadFetchOptions,
} from "./message-bubble-protected-media.lib";

describe("collapseDuplicateWorkspaceV1InUrl", () => {
  it("collapses repeated /workspace/v1 before user_uploads", () => {
    expect(
      collapseDuplicateWorkspaceV1InUrl(
        "https://sys.t/workspace/v1/workspace/v1/user_uploads/1/a.png",
      ),
    ).toBe("https://sys.t/workspace/v1/user_uploads/1/a.png");
  });

  it("collapses multiple repeats", () => {
    expect(
      collapseDuplicateWorkspaceV1InUrl(
        "https://sys.t/workspace/v1/workspace/v1/workspace/v1/user_uploads/x",
      ),
    ).toBe("https://sys.t/workspace/v1/user_uploads/x");
  });
});

describe("isAuthMediaPlaceholderAttr", () => {
  it("treats missing src as placeholder", () => {
    expect(isAuthMediaPlaceholderAttr(null)).toBe(true);
    expect(isAuthMediaPlaceholderAttr("")).toBe(true);
  });

  it("recognizes the 1×1 transparent gif placeholder", () => {
    expect(isAuthMediaPlaceholderAttr(AUTH_IMAGE_PLACEHOLDER_SRC)).toBe(true);
  });

  it("returns false for blob or http URLs", () => {
    expect(isAuthMediaPlaceholderAttr("blob:http://localhost/x")).toBe(false);
    expect(isAuthMediaPlaceholderAttr("https://zulip.test/user_uploads/1/a.png")).toBe(false);
  });
});

describe("resolveProtectedUploadFetchOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Authorization on cross-origin candidate (credentials omit, headers kept)", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com" },
    });
    const headers = { Authorization: "Basic abc" };
    const init = resolveProtectedUploadFetchOptions(
      "https://zulip.example.com/user_uploads/1/a.png",
      headers,
    );
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual(headers);
  });

  it("uses include credentials for same-origin candidate", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://zulip.example.com" },
    });
    const headers = { Authorization: "Basic abc" };
    const init = resolveProtectedUploadFetchOptions(
      "/user_uploads/1/a.png",
      headers,
    );
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual(headers);
  });
});
