import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchLinkPreviewsFromMessageMarkdown,
  parseAllMessageEmbedsFromRenderedHtml,
} from "./message-link-preview-fetch.lib";

const fetchMessageRenderedHtmlByIdMock = vi.hoisted(() => vi.fn());
const renderMessageContentMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-messages", () => ({
  fetchMessageRenderedHtmlById: (...args: unknown[]) => fetchMessageRenderedHtmlByIdMock(...args),
  renderMessageContent: (...args: unknown[]) => renderMessageContentMock(...args),
}));

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
  beforeEach(() => {
    fetchMessageRenderedHtmlByIdMock.mockReset();
    renderMessageContentMock.mockReset();
  });

  it("uses GET message HTML for persisted message ids", async () => {
    fetchMessageRenderedHtmlByIdMock.mockResolvedValue(`
      <p><a href="https://example.com">link</a></p>
      <div class="message_embed">
        <a class="message_embed_image" href="https://example.com"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://example.com">Example</a></div>
        </div>
      </div>`);

    const items = await fetchLinkPreviewsFromMessageMarkdown("https://example.com", 42);
    expect(fetchMessageRenderedHtmlByIdMock).toHaveBeenCalledWith(42, undefined);
    expect(renderMessageContentMock).not.toHaveBeenCalled();
    expect(items[0]?.data?.title).toBe("Example");
  });

  it("uses POST render when message id is not persisted", async () => {
    renderMessageContentMock.mockResolvedValue(`
      <div class="message_embed">
        <a class="message_embed_image" href="https://example.com"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://example.com">Rendered</a></div>
        </div>
      </div>`);

    const items = await fetchLinkPreviewsFromMessageMarkdown("https://example.com", 0);
    expect(renderMessageContentMock).toHaveBeenCalledWith("https://example.com");
    expect(fetchMessageRenderedHtmlByIdMock).not.toHaveBeenCalled();
    expect(items[0]?.data?.title).toBe("Rendered");
  });

  it("returns one item per URL in markdown", async () => {
    fetchMessageRenderedHtmlByIdMock.mockResolvedValue(`
      <div class="message_embed">
        <a class="message_embed_image" href="https://example.com"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://example.com">Example</a></div>
        </div>
      </div>
      <div class="message_embed">
        <a class="message_embed_image" href="https://other.test"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://other.test">Other</a></div>
        </div>
      </div>`);

    const items = await fetchLinkPreviewsFromMessageMarkdown(
      "https://example.com https://other.test",
      7,
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.targetUrl).toBe("https://example.com");
    expect(items[0]?.data?.title).toBe("Example");
    expect(items[1]?.targetUrl).toBe("https://other.test");
    expect(items[1]?.data?.title).toBe("Other");
  });

  it("matches embed when Zulip canonical URL differs from text URL", async () => {
    fetchMessageRenderedHtmlByIdMock.mockResolvedValue(`
      <div class="message_embed">
        <a class="message_embed_image" href="https://example.com/page/"></a>
        <div class="data-container">
          <div class="message_embed_title"><a href="https://example.com/page/">Canonical</a></div>
        </div>
      </div>`);

    const items = await fetchLinkPreviewsFromMessageMarkdown("https://www.example.com/page", 3);
    expect(items[0]?.data?.title).toBe("Canonical");
  });
});
