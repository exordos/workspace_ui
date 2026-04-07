/**
 * Tests for avatar URL resolution and cache-busting.
 *
 * resolveAvatarUrl converts relative Zulip avatar paths to absolute URLs
 * with a version query parameter. A broken resolver causes missing avatars
 * or stale cached images after user profile updates.
 */
import { describe, expect, it } from "vitest";
import { resolveAvatarUrl, bumpAvatarVersion, getAvatarVersion } from "./avatar";

describe("resolveAvatarUrl", () => {
  const REALM = "https://zulip.example.com";

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
    expect(url).toContain("https://zulip.example.com/avatar/42.png");
    expect(url).toContain("_av=");
  });

  it("resolves a relative path without leading slash", () => {
    const url = resolveAvatarUrl("avatar/42.png", REALM);
    expect(url).toContain("https://zulip.example.com/avatar/42.png");
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

  it("returns undefined for relative path when no realmBaseUrl", () => {
    expect(resolveAvatarUrl("/avatar/42.png")).toBeUndefined();
  });

  it("strips trailing slashes from realmBaseUrl", () => {
    const url = resolveAvatarUrl("/avatar/42.png", "https://zulip.example.com///");
    expect(url).toContain("https://zulip.example.com/avatar/42.png");
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
    expect(url).toContain("https://zulip.example.com/avatar/42.png");
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
