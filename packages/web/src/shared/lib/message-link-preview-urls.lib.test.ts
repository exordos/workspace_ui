import { describe, expect, it } from "vitest";
import { MAX_LINK_PREVIEWS_PER_MESSAGE } from "~/shared/lib/message-link-preview-url-match.lib";
import {
  extractFirstLinkPreviewUrl,
  extractLinkPreviewUrls,
} from "./message-link-preview-urls.lib";

describe("extractLinkPreviewUrls", () => {
  it("returns all previewable https URLs in order", () => {
    expect(extractLinkPreviewUrls("see https://example.com and https://other.test")).toEqual([
      "https://example.com",
      "https://other.test",
    ]);
  });

  it("caps the number of URLs per message", () => {
    const urls = Array.from(
      { length: MAX_LINK_PREVIEWS_PER_MESSAGE + 5 },
      (_, i) => `https://site${i}.test`,
    ).join(" ");
    expect(extractLinkPreviewUrls(urls)).toHaveLength(MAX_LINK_PREVIEWS_PER_MESSAGE);
  });
});

describe("extractFirstLinkPreviewUrl", () => {
  it("returns first https URL from plain text", () => {
    expect(extractFirstLinkPreviewUrl("see https://example.com and https://other.test")).toBe(
      "https://example.com",
    );
  });

  it("returns URL from angle-bracket markdown", () => {
    expect(extractFirstLinkPreviewUrl("check <https://example.com/path>")).toBe(
      "https://example.com/path",
    );
  });

  it("returns URL from markdown link syntax", () => {
    expect(extractFirstLinkPreviewUrl("[Example](https://example.com/page)")).toBe(
      "https://example.com/page",
    );
  });

  it("returns null for empty input", () => {
    expect(extractFirstLinkPreviewUrl("")).toBeNull();
    expect(extractFirstLinkPreviewUrl("   ")).toBeNull();
  });

  it("skips mailto links", () => {
    expect(extractFirstLinkPreviewUrl("mailto:user@example.com")).toBeNull();
  });

  it("skips user_upload paths", () => {
    expect(extractFirstLinkPreviewUrl("https://zulip.test/user_uploads/1/file.pdf")).toBeNull();
  });

  it("skips Zulip REST API URLs in message text", () => {
    expect(
      extractFirstLinkPreviewUrl("https://zulip.tokens.team/api/v1/users?client_gravatar=false"),
    ).toBeNull();
  });

  it("skips zulip narrow permalinks", () => {
    expect(
      extractFirstLinkPreviewUrl("https://chat.example.com/#narrow/channel/1-general"),
    ).toBeNull();
  });

  it("skips direct image file URLs", () => {
    expect(extractFirstLinkPreviewUrl("https://cdn.test/photo.PNG?size=1")).toBeNull();
  });

  it("skips jitsi meeting URLs", () => {
    expect(extractFirstLinkPreviewUrl("join https://meet.jit.si/MyRoom123")).toBeNull();
  });

  it("skips URLs inside Zulip quote fences", () => {
    const markdown = `@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/42/near/1):
\`\`\`quote
https://quoted.example.com/page
\`\`\`

`;
    expect(extractFirstLinkPreviewUrl(markdown)).toBeNull();
  });

  it("returns URL outside quote but not URL inside quote", () => {
    const markdown = `@_**Alice|42** [wrote](https://zulip.example.com/#narrow/dm/42/near/1):
\`\`\`quote
https://quoted.example.com
\`\`\`

see https://main.example.com`;
    expect(extractFirstLinkPreviewUrl(markdown)).toBe("https://main.example.com");
  });

  it("keeps Wikipedia-style paths with balanced parentheses", () => {
    const url = "https://en.wikipedia.org/wiki/Example_(disambiguation)";
    expect(extractFirstLinkPreviewUrl(`read ${url} for context`)).toBe(url);
    expect(extractFirstLinkPreviewUrl(`[wiki](${url})`)).toBe(url);
  });

  it("strips sentence punctuation wrapped around a plain URL", () => {
    expect(extractFirstLinkPreviewUrl("(see https://example.com/page).")).toBe(
      "https://example.com/page",
    );
  });

  it("strips trailing comma after a URL", () => {
    expect(extractFirstLinkPreviewUrl("see https://example.com/a,")).toBe("https://example.com/a");
  });
});
