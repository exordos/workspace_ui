import { describe, expect, it } from "vitest";
import {
  isUserUploadThumbnailUrl,
  isUserUploadImagePath,
  toUserUploadOriginalUrl,
  toUserUploadThumbnailUrl,
  USER_UPLOAD_THUMBNAIL_SIZE,
} from "./protected-message-media-thumbnail";

describe("toUserUploadThumbnailUrl", () => {
  it("inserts /user_uploads/thumbnail/… and size suffix", () => {
    expect(toUserUploadThumbnailUrl("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png")).toBe(
      `/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/${USER_UPLOAD_THUMBNAIL_SIZE}`,
    );
  });

  it("returns unchanged when already a thumbnail URL", () => {
    const thumb = "/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp";
    expect(toUserUploadThumbnailUrl(thumb)).toBe(thumb);
  });

  it("resolves absolute URLs", () => {
    expect(toUserUploadThumbnailUrl("http://localhost:5173/user_uploads/1/a/private.png")).toBe(
      `http://localhost:5173/user_uploads/thumbnail/1/a/private.png/${USER_UPLOAD_THUMBNAIL_SIZE}`,
    );
  });
});

describe("isUserUploadThumbnailUrl", () => {
  it("detects thumbnail path", () => {
    expect(isUserUploadThumbnailUrl("/user_uploads/thumbnail/1/x.png/840x560.webp")).toBe(true);
    expect(isUserUploadThumbnailUrl("/user_uploads/1/x.png")).toBe(false);
  });
});

describe("toUserUploadOriginalUrl", () => {
  it("restores the original user_upload path from thumbnail URL", () => {
    expect(
      toUserUploadOriginalUrl(
        "/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp",
      ),
    ).toBe("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png");
  });

  it("restores the original absolute URL from thumbnail URL", () => {
    expect(
      toUserUploadOriginalUrl(
        "http://localhost:5173/user_uploads/thumbnail/1/a/private.png/840x560.webp",
      ),
    ).toBe("http://localhost:5173/user_uploads/1/a/private.png");
  });

  it("restores the original path for other thumbnail sizes and extensions", () => {
    expect(
      toUserUploadOriginalUrl(
        "/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/1024x768.jpg",
      ),
    ).toBe("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png");
  });

  it("preserves query and hash for relative URLs", () => {
    expect(
      toUserUploadOriginalUrl(
        "/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp?download=1#focus",
      ),
    ).toBe("/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png?download=1#focus");
  });

  it("preserves query and hash for absolute URLs", () => {
    expect(
      toUserUploadOriginalUrl(
        "http://localhost:5173/user_uploads/thumbnail/1/a/private.png/840x560.webp?sig=1#img",
      ),
    ).toBe("http://localhost:5173/user_uploads/1/a/private.png?sig=1#img");
  });
});

describe("isUserUploadImagePath", () => {
  it("matches image extensions under user_uploads", () => {
    expect(isUserUploadImagePath("/user_uploads/1/a.png")).toBe(true);
    expect(isUserUploadImagePath("/user_uploads/1/a.pdf")).toBe(false);
  });
});
