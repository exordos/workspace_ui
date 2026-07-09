import { describe, expect, it } from "vitest";
import {
  fetchLinkPreviewsFromMessageMarkdown,
  parseAllMessageEmbedsFromRenderedHtml,
} from "./message-link-preview-fetch.lib";

describe("parseAllMessageEmbedsFromRenderedHtml", () => {
  it("parses title, description, target URL, and external_content thumbnail", () => {
    const html = `
      <p><a href="https://example.com">https://example.com</a></p>
      <div class="message_embed">
        <a class="message_embed_image" href="https://example.com"
           style="background-image:url(&quot;/external_content/abc/preview.jpeg&quot;)"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://example.com">Example Site</a></div>
          <div class="message_embed_description">A short description.</div>
        </div>
      </div>`;

    expect(parseAllMessageEmbedsFromRenderedHtml(html)[0]).toEqual({
      targetUrl: "https://example.com",
      title: "Example Site",
      description: "A short description.",
      thumbnailPath: "/external_content/abc/preview.jpeg",
    });
  });

  it("returns empty array when embed block is missing", () => {
    expect(parseAllMessageEmbedsFromRenderedHtml("<p>https://example.com</p>")).toEqual([]);
  });

  it("returns empty array for empty html", () => {
    expect(parseAllMessageEmbedsFromRenderedHtml("")).toEqual([]);
  });

  it("parses multiple embed blocks", () => {
    const html = `
      <div class="message_embed">
        <a class="message_embed_image" href="https://one.test"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://one.test">One</a></div>
        </div>
      </div>
      <div class="message_embed">
        <a class="message_embed_image" href="https://two.test"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://two.test">Two</a></div>
        </div>
      </div>`;

    expect(parseAllMessageEmbedsFromRenderedHtml(html).map((p) => p.targetUrl)).toEqual([
      "https://one.test",
      "https://two.test",
    ]);
  });
});

describe("fetchLinkPreviewsFromMessageMarkdown", () => {
  it("returns empty local preview data for persisted message ids", async () => {
    const items = await fetchLinkPreviewsFromMessageMarkdown("https://example.com", 42);
    expect(items).toEqual([{ targetUrl: "https://example.com", data: null }]);
  });

  it("returns one item per URL in markdown", async () => {
    const items = await fetchLinkPreviewsFromMessageMarkdown(
      "https://example.com https://other.test",
      7,
    );
    expect(items).toEqual([
      { targetUrl: "https://example.com", data: null },
      { targetUrl: "https://other.test", data: null },
    ]);
  });

  it("returns empty array when markdown has no previewable URLs", async () => {
    await expect(fetchLinkPreviewsFromMessageMarkdown("plain text", 3)).resolves.toEqual([]);
  });

  it("returns null data when aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchLinkPreviewsFromMessageMarkdown("https://example.com", 3, controller.signal),
    ).resolves.toEqual([{ targetUrl: "https://example.com", data: null }]);
  });
});
