import { describe, expect, it } from "vitest";
import {
  isUserUploadVideoPath,
  isVideoFileHref,
  userUploadVideoMimeType,
} from "./user-upload-media-path.lib";

describe("isUserUploadVideoPath", () => {
  it("matches video extensions under user_uploads", () => {
    expect(isUserUploadVideoPath("/user_uploads/1/private.mp4")).toBe(true);
    expect(isUserUploadVideoPath("/user_uploads/1/clip.webm?download=1")).toBe(true);
    expect(isUserUploadVideoPath("/user_uploads/1/a.pdf")).toBe(false);
    expect(isUserUploadVideoPath("https://cdn.example.com/video.mp4")).toBe(false);
  });
});

describe("userUploadVideoMimeType", () => {
  it("maps common extensions", () => {
    expect(userUploadVideoMimeType("/user_uploads/1/a.webm")).toBe("video/webm");
    expect(userUploadVideoMimeType("/user_uploads/1/a.mp4")).toBe("video/mp4");
    expect(userUploadVideoMimeType("/user_uploads/1/a.mov")).toBe("video/quicktime");
  });
});

describe("isVideoFileHref", () => {
  it("matches video extensions on any host", () => {
    expect(isVideoFileHref("https://cdn.example.com/a.mov")).toBe(true);
    expect(isVideoFileHref("/user_uploads/1/a.mkv")).toBe(true);
    expect(isVideoFileHref("/files/doc.pdf")).toBe(false);
  });
});
