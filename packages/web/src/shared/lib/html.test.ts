// Tests for HTML processing module: `stripHtml` and `sanitizeHtml`.
//
// These tests are critical for XSS protection. All HTML from the Zulip API
// passes through `sanitizeHtml` before render via `dangerouslySetInnerHTML`.
// A bug here could execute arbitrary JS in the user's session.
import { describe, expect, it, vi } from "vitest";
import { resolveMessageMediaUrl, stripHtml, sanitizeHtml } from "./html";

vi.mock("~/shared/lib/env", () => ({
  env: {
    USER_UPLOADS_PATH_PREFIX: "/workspace/v1",
  },
}));

vi.mock("~/shared/lib/zulip-message-media-base.lib", () => ({
  getMessageImagesBaseUrl: vi.fn(() => "https://zulip.example.com/workspace/v1"),
  getMessageRealmBaseUrl: vi.fn(() => "https://zulip.example.com"),
}));

// `stripHtml` extracts plain text from messages, e.g. for notifications and previews.
describe("stripHtml", () => {
  // Basic tag removal — core behavior for message previews.
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  // Trimming removes extra whitespace in notification text.
  it("trims whitespace", () => {
    expect(stripHtml("  <p>text</p>  ")).toBe("text");
  });

  // Empty messages must return an empty string, not null/undefined.
  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  // Plain text without tags must pass through unchanged.
  it("handles string without tags", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });

  // Self-closing tags like `<br/>` must also be removed.
  it("handles self-closing tags", () => {
    expect(stripHtml("line<br/>break")).toBe("linebreak");
  });
});

describe("resolveMessageMediaUrl", () => {
  it("prefixes relative paths with base", () => {
    expect(
      resolveMessageMediaUrl("/user_uploads/1/a.png", "https://zulip.example.com/workspace/v1"),
    ).toBe("https://zulip.example.com/workspace/v1/user_uploads/1/a.png");
  });

  it("leaves blob URLs unchanged", () => {
    expect(
      resolveMessageMediaUrl("blob:https://app.example.com/uuid", "https://zulip.example.com"),
    ).toBe("blob:https://app.example.com/uuid");
  });

  it("leaves absolute and data URLs unchanged", () => {
    expect(
      resolveMessageMediaUrl("https://cdn.example.com/x.png", "https://zulip.example.com"),
    ).toBe("https://cdn.example.com/x.png");
    expect(resolveMessageMediaUrl("data:image/png;base64,AA", "https://zulip.example.com")).toBe(
      "data:image/png;base64,AA",
    );
  });

  it("returns src unchanged when base is empty", () => {
    expect(resolveMessageMediaUrl("/user_uploads/1/a.png", "")).toBe("/user_uploads/1/a.png");
  });
});

// `sanitizeHtml` — primary XSS protection layer for all HTML from Zulip.
describe("sanitizeHtml", () => {
  // Safe tags like `p`, `strong`, `em` must be kept for formatting.
  it("allows safe tags", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  // `<script>` tags are the most direct XSS vector — always strip them.
  it("removes script tags (XSS protection)", () => {
    const html = '<p>text</p><script>alert("xss")</script>';
    expect(sanitizeHtml(html)).toBe("<p>text</p>");
  });

  // Event handler attributes like `onerror` and `onclick` run JS without `<script>`.
  it("removes event handlers (XSS protection)", () => {
    const html = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onerror");
  });

  // `javascript:` in `href` — classic XSS via user click.
  it("removes javascript: URLs (XSS protection)", () => {
    const scriptProtocol = "javascript";
    const html = `<a href="${scriptProtocol}:alert(1)">click</a>`;
    const result = sanitizeHtml(html);
    expect(result).not.toContain(`${scriptProtocol}:`);
  });

  it("opens safe links in a new tab with noopener", () => {
    const html = '<a href="https://example.com/path">go</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('href="https://example.com/path"');
  });

  // `img src` must be kept — Zulip messages often include inline images.
  it("keeps img src attribute", () => {
    const html = '<img src="https://example.com/img.png" alt="test">';
    expect(sanitizeHtml(html)).toContain('src="https://example.com/img.png"');
  });

  it("keeps img width and height for layout stability", () => {
    const html = '<img src="https://example.com/img.png" alt="x" width="840" height="560">';
    const result = sanitizeHtml(html);
    expect(result).toContain('width="840"');
    expect(result).toContain('height="560"');
  });

  // Zulip serves user uploads as relative paths — rewrite to absolute URLs.
  it("rewrites relative img src when baseUrl provided", () => {
    const html = '<img src="/user_uploads/1/img.png">';
    const result = sanitizeHtml(html, "https://zulip.example.com/workspace/v1");
    expect(result).toContain('src="https://zulip.example.com/workspace/v1/user_uploads/1/img.png"');
  });

  // In Electron on `file://`, `sanitizeHtml` may run without `baseUrl`,
  // but `/user_uploads/` must still resolve via realm.
  it("rewrites relative user_uploads when baseUrl omitted (realm media base fallback)", () => {
    const html = '<img src="/user_uploads/1/img.png" alt="">';
    const result = sanitizeHtml(html);
    expect(result).toContain('src="https://zulip.example.com/workspace/v1/user_uploads/1/img.png"');
  });

  // Already-absolute external CDN URLs must not change.
  it("does not rewrite absolute img src", () => {
    const html = '<img src="https://cdn.example.com/img.png">';
    const result = sanitizeHtml(html, "https://zulip.example.com");
    expect(result).toContain('src="https://cdn.example.com/img.png"');
  });

  it("rewrites absolute user_uploads img src to canonical base", () => {
    const html = '<img src="https://sys.platform.genesis-core.team/user_uploads/1/x.png" alt="">';
    const result = sanitizeHtml(html, "https://zulip.example.com/workspace/v1");
    expect(result).toContain('src="https://zulip.example.com/workspace/v1/user_uploads/1/x.png"');
  });

  it("rewrites user_uploads link href to canonical base", () => {
    const html = '<a href="https://sys.platform.genesis-core.team/user_uploads/1/x.png">file</a>';
    const result = sanitizeHtml(html, "https://zulip.example.com/workspace/v1");
    expect(result).toContain('href="https://zulip.example.com/workspace/v1/user_uploads/1/x.png"');
  });

  it("rewrites relative external_content media when baseUrl omitted", () => {
    const html = '<img src="/external_content/preview.png" alt="preview">';
    const result = sanitizeHtml(html);
    expect(result).toContain('src="https://zulip.example.com/external_content/preview.png"');
  });

  it("rewrites absolute external_content URLs to the canonical realm origin", () => {
    const html =
      '<img src="https://sys.platform.genesis-core.team/external_content/preview.png" alt="">';
    const result = sanitizeHtml(html, "https://zulip.example.com/workspace/v1");
    expect(result).toContain('src="https://zulip.example.com/external_content/preview.png"');
  });

  it("preserves audio preview markup and Zulip preview metadata attrs", () => {
    const html =
      '<audio controls src="/external_content/audio.mp3" title="Preview" data-original-url="https://example.com/audio.mp3" data-original-dimensions="320x180" data-original-content-type="audio/mpeg"></audio>';
    const result = sanitizeHtml(html, "https://zulip.example.com/workspace/v1");
    expect(result).toContain("<audio");
    expect(result).toContain('src="https://zulip.example.com/external_content/audio.mp3"');
    expect(result).toContain('title="Preview"');
    expect(result).toContain('data-original-url="https://example.com/audio.mp3"');
    expect(result).toContain('data-original-dimensions="320x180"');
    expect(result).toContain('data-original-content-type="audio/mpeg"');
  });

  it("preserves picture/source markup for protected media preprocessing", () => {
    const html =
      '<picture><source srcset="/external_content/a.webp 1x, /external_content/b.webp 2x" sizes="100vw"><img alt="preview"></picture>';
    const result = sanitizeHtml(html, "https://zulip.example.com/workspace/v1");
    expect(result).toContain("<picture>");
    expect(result).toContain("<source");
    expect(result).toContain('srcset="/external_content/a.webp 1x, /external_content/b.webp 2x"');
  });

  // `iframe` can load arbitrary content and bypass CSP — always remove.
  it("removes disallowed tags like iframe", () => {
    const html = '<iframe src="https://evil.com"></iframe><p>safe</p>';
    expect(sanitizeHtml(html)).toBe("<p>safe</p>");
  });

  // `<style>` tags can hide content or draw phishing overlays — remove them.
  it("removes style tags", () => {
    const html = "<style>body{display:none}</style><p>safe</p>";
    expect(sanitizeHtml(html)).toBe("<p>safe</p>");
  });

  // Zulip @mention spans carry `data-user-id` for client mention UX.
  it("preserves user-mention data-user-id on span", () => {
    const html = '<p><span class="user-mention" data-user-id="31">@Alice</span></p>';
    const result = sanitizeHtml(html);
    expect(result).toContain('class="user-mention"');
    expect(result).toContain('data-user-id="31"');
  });

  it("preserves del tags for markdown strikethrough", () => {
    // Protect bubble markdown fallback: `<del>` must not be stripped by sanitizer.
    const html = "<p><del>obsolete</del> text</p>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<del>obsolete</del>");
  });

  it("preserves video inside user_upload anchor links", () => {
    const html =
      '<p><a href="https://zulip.example.com/user_uploads/1/clip.webm"><video controls=""><source src="https://zulip.example.com/user_uploads/1/clip.webm" type="video/webm"></source></video></a></p>';
    const result = sanitizeHtml(html, "https://zulip.example.com");
    expect(result).toContain("<video");
    expect(result).toContain('type="video/webm"');
  });

  it("allows GFM table structure from marked fallback", () => {
    const html =
      "<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<table>");
    expect(result).toContain("<th>");
    expect(result).toContain("<td>");
  });
});
