import { describe, expect, it } from "vitest";
import {
  findLinkPreviewDataForUrl,
  linkPreviewUrlKey,
  linkPreviewUrlsMatch,
} from "./message-link-preview-url-match.lib";

describe("linkPreviewUrlKey", () => {
  it("treats trailing slash and www as equivalent", () => {
    expect(linkPreviewUrlKey("https://www.example.com/page/")).toBe(
      linkPreviewUrlKey("https://example.com/page"),
    );
  });

  it("keeps query string in key", () => {
    expect(linkPreviewUrlKey("https://example.com/a?x=1")).not.toBe(
      linkPreviewUrlKey("https://example.com/a"),
    );
  });
});

describe("findLinkPreviewDataForUrl", () => {
  it("matches embed when target differs only by trailing slash", () => {
    const embed = {
      targetUrl: "https://example.com/article/",
      title: "Article",
    };
    expect(findLinkPreviewDataForUrl("https://www.example.com/article", [embed])?.title).toBe(
      "Article",
    );
  });
});

describe("linkPreviewUrlsMatch", () => {
  it("returns true for canonical equivalents", () => {
    expect(linkPreviewUrlsMatch("https://a.test/x/", "https://www.a.test/x")).toBe(true);
  });
});
