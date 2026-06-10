import { describe, expect, it } from "vitest";
import {
  canonicalizeUserUploadImagePath,
  collectMessageInlineImageIdentities,
  collectUserUploadImageIdentitiesFromMarkdown,
  normalizeUserUploadImageIdentity,
  shouldSkipInliningUserUploadImageLink,
  userUploadImageIdentitiesMatchBetweenBodies,
} from "./message-inline-user-upload-image.lib";

describe("canonicalizeUserUploadImagePath", () => {
  it("strips thumbnail prefix and generic size suffix", () => {
    expect(
      canonicalizeUserUploadImagePath(
        "/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/1024x768.jpg",
      ),
    ).toBe("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png");
  });

  it("keeps original paths unchanged", () => {
    expect(
      canonicalizeUserUploadImagePath("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png"),
    ).toBe("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png");
  });
});

describe("normalizeUserUploadImageIdentity", () => {
  it("maps full and thumbnail paths to the same identity", () => {
    expect(
      normalizeUserUploadImageIdentity("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png"),
    ).toBe("2/ff/ap3ohins40xdmpunvol7z5ga/image.png");
    expect(
      normalizeUserUploadImageIdentity(
        "/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp",
      ),
    ).toBe("2/ff/ap3ohins40xdmpunvol7z5ga/image.png");
    expect(
      normalizeUserUploadImageIdentity(
        "/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/1024x768.jpg",
      ),
    ).toBe("2/ff/ap3ohins40xdmpunvol7z5ga/image.png");
  });

  it("returns null for non-image uploads", () => {
    expect(normalizeUserUploadImageIdentity("/user_uploads/2/ff/report.pdf")).toBeNull();
  });
});

describe("collectMessageInlineImageIdentities", () => {
  it("collects href from message_inline_image block", () => {
    const html = [
      '<p><a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">image.png</a></p>',
      '<div class="message_inline_image">',
      '<a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">',
      '<img src="/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp">',
      "</a></div>",
    ].join("");
    const identities = collectMessageInlineImageIdentities(html);
    expect(identities.has("2/ff/ap3ohins40xdmpunvol7z5ga/image.png")).toBe(true);
    expect(
      shouldSkipInliningUserUploadImageLink(
        "/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png",
        identities,
      ),
    ).toBe(true);
  });
});

describe("userUploadImageIdentitiesMatchBetweenBodies", () => {
  it("matches optimistic markdown link to server inline image HTML", () => {
    const markdown = "[image.png](/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png)";
    const html = [
      '<div class="message_inline_image">',
      '<a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">',
      '<img src="/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp">',
      "</a></div>",
    ].join("");
    expect(userUploadImageIdentitiesMatchBetweenBodies(markdown, html)).toBe(true);
  });

  it("returns false when upload paths differ", () => {
    expect(
      userUploadImageIdentitiesMatchBetweenBodies(
        "[a.png](/user_uploads/1/a.png)",
        '<div class="message_inline_image"><a href="/user_uploads/2/b.png"></a></div>',
      ),
    ).toBe(false);
  });
});

describe("collectUserUploadImageIdentitiesFromMarkdown", () => {
  it("extracts image link targets from markdown", () => {
    const ids = collectUserUploadImageIdentitiesFromMarkdown(
      "Hi [photo.png](/user_uploads/1/aa/photo.png)",
    );
    expect(ids.has("1/aa/photo.png")).toBe(true);
  });
});
