/**
 * Tests for the HTML processing module (stripHtml, sanitizeHtml).
 *
 * These tests are critical for XSS prevention. All HTML content from
 * the Zulip API passes through sanitizeHtml before rendering via
 * dangerouslySetInnerHTML. A failure here means arbitrary JS execution
 * in the user's browser session.
 */

import { describe, expect, it } from "vitest";
import { resolveMessageMediaUrl, stripHtml, sanitizeHtml } from "./html";

// stripHtml is used to extract plain text from messages (e.g. for notifications, previews)
describe("stripHtml", () => {
  // Basic tag removal — core functionality for message previews
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  // Whitespace trimming prevents awkward spacing in notification text
  it("trims whitespace", () => {
    expect(stripHtml("  <p>text</p>  ")).toBe("text");
  });

  // Empty messages should return empty strings, not null/undefined
  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  // Plain text without tags should pass through unchanged
  it("handles string without tags", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });

  // Self-closing tags like <br/> must also be removed
  it("handles self-closing tags", () => {
    expect(stripHtml("line<br/>break")).toBe("linebreak");
  });
});

describe("resolveMessageMediaUrl", () => {
  it("prefixes relative paths with base", () => {
    expect(resolveMessageMediaUrl("/user_uploads/1/a.png", "https://zulip.example.com")).toBe(
      "https://zulip.example.com/user_uploads/1/a.png",
    );
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

// sanitizeHtml is the primary XSS defense — it processes all Zulip message HTML
describe("sanitizeHtml", () => {
  // Safe tags (p, strong, em, etc.) must pass through for message formatting
  it("allows safe tags", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  // <script> tags are the most direct XSS vector — must always be stripped
  it("removes script tags (XSS protection)", () => {
    const html = '<p>text</p><script>alert("xss")</script>';
    expect(sanitizeHtml(html)).toBe("<p>text</p>");
  });

  // Event handlers (onerror, onclick, etc.) execute JS without <script> tags
  it("removes event handlers (XSS protection)", () => {
    const html = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onerror");
  });

  // javascript: in href is a classic XSS bypass via user clicks
  it("removes javascript: URLs (XSS protection)", () => {
    const scriptProtocol = "javascript";
    const html = `<a href="${scriptProtocol}:alert(1)">click</a>`;
    const result = sanitizeHtml(html);
    expect(result).not.toContain(`${scriptProtocol}:`);
  });

  // img src must be preserved — Zulip messages frequently contain inline images
  it("keeps img src attribute", () => {
    const html = '<img src="https://example.com/img.png" alt="test">';
    expect(sanitizeHtml(html)).toContain('src="https://example.com/img.png"');
  });

  // Zulip serves user uploads at relative paths — they must be rewritten to absolute
  it("rewrites relative img src when baseUrl provided", () => {
    const html = '<img src="/user_uploads/1/img.png">';
    const result = sanitizeHtml(html, "https://zulip.example.com");
    expect(result).toContain('src="https://zulip.example.com/user_uploads/1/img.png"');
  });

  // Already-absolute URLs from external CDNs should not be modified
  it("does not rewrite absolute img src", () => {
    const html = '<img src="https://cdn.example.com/img.png">';
    const result = sanitizeHtml(html, "https://zulip.example.com");
    expect(result).toContain('src="https://cdn.example.com/img.png"');
  });

  // iframes can load arbitrary content and bypass CSP — always remove
  it("removes disallowed tags like iframe", () => {
    const html = '<iframe src="https://evil.com"></iframe><p>safe</p>';
    expect(sanitizeHtml(html)).toBe("<p>safe</p>");
  });

  // <style> tags can hide page content or create phishing overlays
  it("removes style tags", () => {
    const html = "<style>body{display:none}</style><p>safe</p>";
    expect(sanitizeHtml(html)).toBe("<p>safe</p>");
  });

  // Zulip @mention spans carry data-user-id for client-side mention UX
  it("preserves user-mention data-user-id on span", () => {
    const html = '<p><span class="user-mention" data-user-id="31">@Alice</span></p>';
    const result = sanitizeHtml(html);
    expect(result).toContain('class="user-mention"');
    expect(result).toContain('data-user-id="31"');
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
