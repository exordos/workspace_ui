/**
 * Tests for avatar URL resolution and cache-busting.
 *
 * resolveAvatarUrl converts relative Workspace avatar paths to absolute URLs
 * with a version query parameter. A broken resolver causes missing avatars
 * or stale cached images after user profile updates.
 */
import { describe, expect, it } from "vitest";
import { resolveAvatarUrl, bumpAvatarVersion, getAvatarVersion } from "./avatar";

describe("resolveAvatarUrl", () => {
  const REALM = "https://chat.example.com";

  it("returns undefined for null input", () => {
    expect(resolveAvatarUrl(null, REALM)).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(resolveAvatarUrl(undefined, REALM)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(resolveAvatarUrl("", REALM)).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(resolveAvatarUrl("   ", REALM)).toBeUndefined();
  });

  it("resolves a relative path with leading slash", () => {
    const url = resolveAvatarUrl("/avatar/42.png", REALM);
    expect(url).toContain("https://chat.example.com/avatar/42.png");
    expect(url).toContain("_av=");
  });

  it("resolves a relative path without leading slash", () => {
    const url = resolveAvatarUrl("avatar/42.png", REALM);
    expect(url).toContain("https://chat.example.com/avatar/42.png");
  });

  it("handles absolute http URLs by keeping them intact", () => {
    const url = resolveAvatarUrl("http://cdn.example.com/img.png", REALM);
    expect(url).toContain("http://cdn.example.com/img.png");
    expect(url).toContain("_av=");
  });

  it("handles absolute https URLs by keeping them intact", () => {
    const url = resolveAvatarUrl("https://cdn.example.com/img.png", REALM);
    expect(url).toContain("https://cdn.example.com/img.png");
    expect(url).toContain("_av=");
  });

  it("resolves canonical Workspace Gravatar URNs", () => {
    const url = resolveAvatarUrl("urn:gravatar:8f0754ce153cb919f0a302266c469481", REALM);
    expect(url).toMatch(
      /^https:\/\/secure\.gravatar\.com\/avatar\/8f0754ce153cb919f0a302266c469481\?d=identicon&version=\d+&s=500$/,
    );
  });

  it("resolves Workspace URL avatar URNs", () => {
    const url = resolveAvatarUrl("urn:url:https://cdn.example.com/img.png?size=128", REALM);
    expect(url).toContain("https://cdn.example.com/img.png?size=128");
    expect(url).toMatch(/&_av=\d+$/);
  });

  it("resolves Workspace image avatar URNs to file download URLs", () => {
    const url = resolveAvatarUrl("urn:image:33333333-3333-4333-8333-333333333333", REALM);
    expect(url).toContain(
      "https://chat.example.com/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download",
    );
    expect(url).toContain("_av=");
  });

  it("returns undefined for invalid Workspace avatar URNs", () => {
    expect(resolveAvatarUrl("urn:gavatar:not-a-uuid", REALM)).toBeUndefined();
    expect(
      resolveAvatarUrl("urn:gavatar:8f0754ce-153c-b919-f0a3-02266c469481", REALM),
    ).toBeUndefined();
    expect(resolveAvatarUrl("urn:gravatar:not-a-hash", REALM)).toBeUndefined();
    expect(resolveAvatarUrl("urn:url:javascript:alert(1)", REALM)).toBeUndefined();
    expect(resolveAvatarUrl("urn:image:not-a-uuid", REALM)).toBeUndefined();
  });

  it("passes through blob URLs as-is for local previews", () => {
    expect(resolveAvatarUrl("blob:preview-123", REALM)).toBe("blob:preview-123");
  });

  it("passes through data URLs as-is for local previews", () => {
    expect(resolveAvatarUrl("data:image/png;base64,AAAA", REALM)).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("returns undefined for relative path when no realmBaseUrl", () => {
    expect(resolveAvatarUrl("/avatar/42.png")).toBeUndefined();
  });

  it("strips trailing slashes from realmBaseUrl", () => {
    const url = resolveAvatarUrl("/avatar/42.png", "https://chat.example.com///");
    expect(url).toContain("https://chat.example.com/avatar/42.png");
  });

  it("appends _av with ? separator when URL has no query", () => {
    const url = resolveAvatarUrl("/avatar/42.png", REALM)!;
    expect(url).toMatch(/\?_av=\d+$/);
  });

  it("appends _av with & separator when URL already has query params", () => {
    const url = resolveAvatarUrl("https://cdn.example.com/img.png?size=128", REALM)!;
    expect(url).toMatch(/&_av=\d+$/);
  });

  it("trims whitespace from the input URL", () => {
    const url = resolveAvatarUrl("  /avatar/42.png  ", REALM);
    expect(url).toContain("https://chat.example.com/avatar/42.png");
  });
});

describe("bumpAvatarVersion", () => {
  it("increments the global avatar version", () => {
    const before = getAvatarVersion();
    bumpAvatarVersion();
    expect(getAvatarVersion()).toBe(before + 1);
  });

  it("causes resolveAvatarUrl to return a new version suffix", () => {
    const url1 = resolveAvatarUrl("/avatar/1.png", "https://z.example.com")!;
    bumpAvatarVersion();
    const url2 = resolveAvatarUrl("/avatar/1.png", "https://z.example.com")!;
    expect(url1).not.toBe(url2);
  });
});

describe("getAvatarVersion", () => {
  it("returns a positive number", () => {
    expect(getAvatarVersion()).toBeGreaterThan(0);
  });
});
