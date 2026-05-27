import { describe, expect, it } from "vitest";
import {
  isUserUploadThumbnailUrl,
  isUserUploadImagePath,
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

describe("isUserUploadImagePath", () => {
  it("matches image extensions under user_uploads", () => {
    expect(isUserUploadImagePath("/user_uploads/1/a.png")).toBe(true);
    expect(isUserUploadImagePath("/user_uploads/1/a.pdf")).toBe(false);
  });
});
