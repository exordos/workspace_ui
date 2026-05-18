import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOrganizationFallbackLogoUrl,
  getOrganizationLogoSrc,
  resolveFaviconHref,
  resolveOrganizationLogoUrl,
  setDocumentFaviconHref,
  setOrganizationFaviconHref,
  syncFaviconWithUnreadIndicator,
  syncOrganizationFavicon,
} from "./organization-branding";

async function flushFaviconUpdates(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(() => resolve());
  });
}

describe("organization-branding", () => {
  afterEach(() => {
    document.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
  });

  it("returns null for invalid organization logo urls", () => {
    expect(resolveOrganizationLogoUrl("")).toBeNull();
    expect(resolveOrganizationLogoUrl("   ")).toBeNull();
    expect(resolveOrganizationLogoUrl("mailto:logo@example.com")).toBeNull();
    expect(resolveOrganizationLogoUrl("/user_avatars/1/realm/icon.png")).toBeNull();
    expect(resolveOrganizationLogoUrl("/user_avatars/1/realm/icon.png", "")).toBeNull();
    expect(resolveOrganizationLogoUrl("/user_avatars/1/realm/icon.png", "   ")).toBeNull();
  });

  it("returns normalized logo url for valid organization logos", () => {
    expect(resolveOrganizationLogoUrl("https://cdn.example.com/logo.svg")).toBe(
      "https://cdn.example.com/logo.svg",
    );
  });

  it("resolves realm-relative realm_icon against organization url", () => {
    expect(
      resolveOrganizationLogoUrl("/user_avatars/1/realm/icon.png", "https://chat.example.com"),
    ).toBe("https://chat.example.com/user_avatars/1/realm/icon.png");
  });

  it("returns fallback logo when organization logo is missing", () => {
    const fallback = getOrganizationFallbackLogoUrl();
    expect(getOrganizationLogoSrc()).toBe(fallback);
    expect(getOrganizationLogoSrc("")).toBe(fallback);
  });

  it("uses organization logo when available", () => {
    expect(getOrganizationLogoSrc("https://cdn.example.com/logo.svg")).toBe(
      "https://cdn.example.com/logo.svg",
    );
    expect(
      getOrganizationLogoSrc("/user_avatars/1/realm/icon.png", "https://chat.example.com"),
    ).toBe("https://chat.example.com/user_avatars/1/realm/icon.png");
  });

  it("setDocumentFaviconHref updates every icon link in the document head", () => {
    const svg = document.createElement("link");
    svg.rel = "icon";
    svg.href = "/favicon.svg";
    const png = document.createElement("link");
    png.rel = "icon";
    png.href = "/favicon-32x32.png";
    document.head.append(svg, png);

    setDocumentFaviconHref("/favicon-unread.svg");
    expect(svg.getAttribute("href")).toBe("/favicon-unread.svg");
    expect(png.getAttribute("href")).toBe("/favicon-unread.svg");

    svg.remove();
    png.remove();
  });

  it("creates and updates dynamic favicon link", async () => {
    setOrganizationFaviconHref("https://cdn.example.com/favicon-a.svg");
    await flushFaviconUpdates();
    setOrganizationFaviconHref("https://cdn.example.com/favicon-b.svg");
    await flushFaviconUpdates();

    const dynamic = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(dynamic).toBeInstanceOf(HTMLLinkElement);
    expect(dynamic).toHaveAttribute("rel", "icon");
    expect(dynamic).toHaveAttribute("href", "https://cdn.example.com/favicon-b.svg");
  });

  it("syncs fallback favicon when organization logo is missing", async () => {
    syncOrganizationFavicon();
    await flushFaviconUpdates();

    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(icon?.getAttribute("href")).toBe(getOrganizationFallbackLogoUrl());
  });

  it("resolveFaviconHref swaps known static paths when hasUnread", () => {
    expect(resolveFaviconHref("/favicon.svg", false)).toBe("/favicon.svg");
    expect(resolveFaviconHref("/favicon.svg", true)).toBe("/favicon-unread.svg");
    expect(resolveFaviconHref(`${getOrganizationFallbackLogoUrl()}`, true)).toBe(
      `${import.meta.env.BASE_URL}organization-fallback-unread.svg`,
    );
    expect(resolveFaviconHref("https://cdn.example.com/org.png", true)).toBe(
      "https://cdn.example.com/org.png",
    );
  });

  it("syncFaviconWithUnreadIndicator applies unread variant for fallback", async () => {
    syncFaviconWithUnreadIndicator({ hasUnread: true });
    await flushFaviconUpdates();

    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(icon?.getAttribute("href")).toBe(
      `${import.meta.env.BASE_URL}organization-fallback-unread.svg`,
    );
  });

  it("falls back favicon when organization logo cannot be loaded", async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onerror?.();
      }
    }

    vi.stubGlobal("Image", BrokenImage);
    syncOrganizationFavicon("https://cdn.example.com/broken.svg");
    await flushFaviconUpdates();

    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(icon?.getAttribute("href")).toBe(getOrganizationFallbackLogoUrl());
    vi.unstubAllGlobals();
  });
});
