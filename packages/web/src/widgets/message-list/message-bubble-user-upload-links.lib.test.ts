import { describe, expect, it } from "vitest";
import {
  expandUserUploadImageLinks,
  isUserUploadImageHref,
} from "./message-bubble-user-upload-links.lib";

describe("isUserUploadImageHref", () => {
  it("returns true for user_uploads path with image extension", () => {
    expect(isUserUploadImageHref("/user_uploads/2/ff/a/image.png")).toBe(true);
    expect(isUserUploadImageHref("/user_uploads/1/a.JPEG")).toBe(true);
    expect(isUserUploadImageHref("/user_uploads/1/x.webp?foo=1")).toBe(true);
  });

  it("returns false for non-upload paths and non-image uploads", () => {
    expect(isUserUploadImageHref("https://example.com/x.png")).toBe(false);
    expect(isUserUploadImageHref("/user_uploads/1/report.pdf")).toBe(false);
    expect(isUserUploadImageHref("/docs/readme.md")).toBe(false);
  });
});

describe("expandUserUploadImageLinks", () => {
  it("replaces user_upload image link with img and absolute URLs when base provided", () => {
    const html =
      '<p><a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">image.png</a></p>';
    const out = expandUserUploadImageLinks(html, "https://zulip.example.com");
    expect(out).toContain("<img");
    expect(out).toContain(
      'src="https://zulip.example.com/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png"',
    );
    expect(out).toContain('alt="image.png"');
    expect(out.match(/<img\b/g)?.length).toBe(1);
    expect(out.match(/<a\b/g) ?? []).toHaveLength(0);
  });

  it("keeps relative URLs when media base is omitted", () => {
    const html =
      '<p><a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">image.png</a></p>';
    const out = expandUserUploadImageLinks(html);
    expect(out).toContain('src="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png"');
    expect(out.match(/<a\b/g) ?? []).toHaveLength(0);
  });

  it("leaves pdf upload link as anchor", () => {
    const html = '<p><a href="/user_uploads/1/x/report.pdf">report.pdf</a></p>';
    expect(expandUserUploadImageLinks(html)).toBe(html);
  });

  it("does not alter anchor that already wraps img", () => {
    const html =
      '<p><a href="/user_uploads/1/x.png"><img src="/user_uploads/1/x.png" alt="x" /></a></p>';
    const out = expandUserUploadImageLinks(html);
    expect(out).toContain("<a ");
    expect(out.match(/<img\b/g)?.length).toBe(1);
  });

  it("returns unchanged html when no user_uploads", () => {
    const html = '<p><a href="https://example.com/a.png">a</a></p>';
    expect(expandUserUploadImageLinks(html)).toBe(html);
  });
});
