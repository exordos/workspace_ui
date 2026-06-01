import { describe, expect, it } from "vitest";
import { upgradeUserUploadVideoLinksInContainer } from "./message-inline-user-upload-video.lib";

describe("upgradeUserUploadVideoLinksInContainer", () => {
  it("replaces user_upload video anchors with inline video elements", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<p><a href="https://sys.example.com/user_uploads/2/52/id/Screencast.webm">Screencast.webm</a></p>';

    const count = upgradeUserUploadVideoLinksInContainer(root);

    expect(count).toBe(1);
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("video source")?.getAttribute("src")).toContain(".webm");
    expect(root.querySelector("video source")?.getAttribute("type")).toBe("video/webm");
  });

  it("skips links that already contain video", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<a href="/user_uploads/1/a.webm"><video controls><source src="/user_uploads/1/a.webm"></video></a>';

    expect(upgradeUserUploadVideoLinksInContainer(root)).toBe(0);
  });
});
