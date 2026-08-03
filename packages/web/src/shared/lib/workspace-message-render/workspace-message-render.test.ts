import { describe, expect, it, vi } from "vitest";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/media-display-url.lib";
import { parseWorkspaceMessageBody } from "./workspace-message-parse.lib";
import {
  renderWorkspaceMessageBody,
  renderWorkspaceMessageBodySegments,
} from "./workspace-message-render.lib";
import { sanitizeWorkspaceMessageHtml } from "./workspace-message-sanitize.lib";

function markdownWithEmptyLines(emptyLineCount: number): string {
  return ["Before", ...Array.from({ length: emptyLineCount }, () => ""), "After"].join("\n");
}

describe("workspace message render core", () => {
  it("parses and renders plain text as safe paragraph html", () => {
    const document = parseWorkspaceMessageBody("Hello workspace");
    const result = renderWorkspaceMessageBody(document);

    expect(document.sourceMarkdown).toBe("Hello workspace");
    expect(document.blocks).toEqual([
      { kind: "paragraph", children: [{ kind: "text", text: "Hello workspace" }] },
    ]);
    expect(result.html).toBe("<p>Hello workspace</p>");
    expect(result.metadata).toMatchObject({
      contentKind: "plain",
      hasRichBlocks: false,
      preferredMetaPlacement: "inline",
      textPreview: "Hello workspace",
    });
  });

  it("preserves line breaks in paragraph html and keeps compact text preview", () => {
    const document = parseWorkspaceMessageBody("Hello\r\nworkspace\nagain");
    const result = renderWorkspaceMessageBody(document);

    expect(document.sourceMarkdown).toBe("Hello\nworkspace\nagain");
    expect(result.html).toBe("<p>Hello<br>workspace<br>again</p>");
    // Soft breaks stay inside one paragraph, so the meta can still share the last line.
    expect(result.metadata.preferredMetaPlacement).toBe("inline");
    expect(document.safeTextPreview).toBe("Hello workspace again");
  });

  it("renders basic markdown blocks and inline rich nodes", () => {
    const document = parseWorkspaceMessageBody(
      [
        "Hello **bold** and _soft_ with `code` plus [docs](https://example.com/docs)",
        "",
        "- one",
        "- two",
        "",
        "> quoted **text**",
        "",
        "```ts",
        "const value = 1;",
        "```",
      ].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("<strong>bold</strong>");
    expect(result.html).toContain("<em>soft</em>");
    expect(result.html).toContain("<code>code</code>");
    expect(result.html).toContain(
      '<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">docs</a>',
    );
    expect(result.html).toContain("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    expect(result.html).toContain(
      '<blockquote class="workspace-message-quote"><p>quoted <strong>text</strong></p></blockquote>',
    );
    expect(result.html).toContain(
      '<pre><code class="hljs language-ts">const value = 1;</code></pre>',
    );
    expect(result.metadata).toMatchObject({
      contentKind: "block-rich",
      hasRichBlocks: true,
      hasLinks: true,
      hasCodeBlocks: true,
      preferredMetaPlacement: "row",
    });
  });

  it("delegates standard GFM blocks and inline nodes to the default Markdown renderer", () => {
    const document = parseWorkspaceMessageBody(
      [
        "## Delivery status",
        "",
        "| Topic | State |",
        "|:--|--:|",
        "| Renderer | Ready |",
        "",
        "- [x] parsed",
        "- [ ] rendered",
        "",
        "~~obsolete~~ and [documentation][guide]",
        "",
        "---",
        "",
        "[guide]: https://example.com/guide",
      ].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("<h2>Delivery status</h2>");
    expect(result.html).toContain('<div class="workspace-message-table-scroll">');
    expect(result.html).toContain("<table>");
    expect(result.html).toContain('<th align="left">Topic</th>');
    expect(result.html).toContain('<th align="right">State</th>');
    expect(result.html).toContain('<td align="left">Renderer</td>');
    expect(result.html).toContain('<td align="right">Ready</td>');
    expect(result.html).toContain('<ul class="contains-task-list">');
    expect(result.html.match(/class="task-list-item"/g)).toHaveLength(2);
    expect(result.html.match(/class="workspace-message-task-marker"/g)).toHaveLength(2);
    expect(result.html).not.toContain("<input");
    expect(result.html).toContain("<del>obsolete</del>");
    expect(result.html).toContain("<hr>");
    expect(result.html).toContain(
      '<a href="https://example.com/guide" target="_blank" rel="noopener noreferrer">documentation</a>',
    );
    expect(result.html).not.toContain("[guide]:");
  });

  it("applies Workspace overrides inside standard table, list, heading, and deletion nodes", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const streamUuid = "44444444-4444-4444-8444-444444444444";
    const imageUuid = "55555555-5555-4555-8555-555555555555";
    const document = parseWorkspaceMessageBody(
      [
        `## [Open message](urn:message:${messageUuid})`,
        "",
        "| User | Attachment |",
        "|---|---|",
        `| [Alice](urn:user:${userUuid}) | [report.pdf](urn:file:${fileUuid}?name=report.pdf) |`,
        "",
        `- [General](urn:stream:${streamUuid}) and ![screen.png](urn:image:${imageUuid}?name=screen.png)`,
        "",
        `~~[Archived message](urn:message:${messageUuid})~~`,
      ].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: true,
      enableEmojiShortcodes: true,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: true,
      enableAttachments: true,
      enableGallery: false,
    });

    expect(result.html).toContain("<table>");
    expect(result.html).toContain(`data-workspace-user-uuid="${userUuid}"`);
    expect(result.html).toContain(`data-workspace-message-uuid="${messageUuid}"`);
    expect(result.html).toContain(`data-workspace-file-uuid="${fileUuid}"`);
    expect(result.html).toContain(`data-workspace-file-uuid="${imageUuid}"`);
    expect(result.html).toContain('data-workspace-media-kind="image"');
    expect(result.html).toContain(`data-workspace-stream-uuid="${streamUuid}"`);
    expect(result.html).toContain("<del>");
    expect(result.html).not.toContain("urn:user:");
    expect(result.html).not.toContain("urn:message:");
    expect(result.html).not.toContain("urn:file:");
    expect(result.html).not.toContain("urn:image:");
    expect(result.html).not.toContain("urn:stream:");
  });

  it("keeps allowed-looking raw HTML inert while rendering neighboring Markdown", () => {
    const document = parseWorkspaceMessageBody(
      [
        "**before**",
        "",
        '<table><tbody><tr><td data-workspace-file="true">raw cell</td></tr></tbody></table>',
        "",
        "<details open><summary>raw summary</summary>raw body</details>",
        "",
        "_after_",
      ].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("<strong>before</strong>");
    expect(result.html).toContain("<em>after</em>");
    expect(result.html).toContain("&lt;table&gt;");
    expect(result.html).toContain("&lt;details open&gt;");
    expect(result.html).not.toContain("<details");
    expect(result.html).toContain('&lt;td data-workspace-file="true"&gt;raw cell&lt;/td&gt;');
  });

  it("renders malformed Workspace URNs and dangerous protocols as inert labels", () => {
    const unsafeProtocol = ["java", "script:alert(1)"].join("");
    const document = parseWorkspaceMessageBody(
      [
        "[bad user](urn:user:not-a-uuid)",
        "[bad file](urn:file:11111111-1111-1111-1111-111111111111)",
        `[script](${unsafeProtocol})`,
        "[relative](//evil.example/path)",
      ].join(" "),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("bad user");
    expect(result.html).toContain("bad file");
    expect(result.html).toContain("script");
    expect(result.html).toContain("relative");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("urn:");
    expect(result.html).not.toContain(unsafeProtocol.slice(0, 11));
    expect(result.html).not.toContain("//evil.example");
  });

  it("keeps ordinary https links separate from Workspace file placeholders", () => {
    const fileUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(
      [
        "[docs](https://example.com/docs)",
        `[report.pdf](urn:file:${fileUuid}?name=report.pdf&content_type=application%2Fpdf&size=348991)`,
      ].join(" "),
    );
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: false,
      enableQuotes: true,
      enableEmojiShortcodes: true,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: true,
      enableGallery: false,
    });

    expect(result.html).toContain(
      '<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">docs</a>',
    );
    expect(result.html).toContain('data-workspace-file="true"');
    expect(result.html).toContain(`data-workspace-file-uuid="${fileUuid}"`);
    expect(result.html).toContain('data-workspace-file-size="348991"');
    expect(result.html).not.toContain(`href="urn:file:${fileUuid}`);
    expect(result.html).not.toContain(`urn:file:${fileUuid}`);
    expect(document.metadata).toMatchObject({
      hasLinks: true,
      hasAttachments: true,
    });
  });

  it("sanitizes malicious html and javascript links", () => {
    const unsafeProtocol = ["java", "script:alert(1)"].join("");
    const document = parseWorkspaceMessageBody(
      `<img src=x onerror="alert(1)"> [bad](${unsafeProtocol}) <script>alert(2)</script>`,
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain('&lt;img src=x onerror="alert(1)"&gt;');
    expect(result.html).toContain("bad");
    expect(result.html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain(unsafeProtocol.slice(0, 11));
  });

  it("blocks dangerous and protocol-relative message link hrefs", () => {
    const document = parseWorkspaceMessageBody(
      [
        "[data](data:text/html;base64,PHNjcmlwdD4=)",
        "[file](file:///etc/passwd)",
        "[blob](blob:https://example.com/id)",
        "[protocol-relative](//evil.example/path)",
      ].join(" "),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("data");
    expect(result.html).toContain("file");
    expect(result.html).toContain("blob");
    expect(result.html).toContain("protocol-relative");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("data:text/html");
    expect(result.html).not.toContain("file://");
    expect(result.html).not.toContain("blob:");
    expect(result.html).not.toContain("//evil.example");
  });

  it("blocks authority-like relative links that use a backslash after the first slash", () => {
    const authorityLikePath = ["/", "\\", "evil.example/path"].join("");
    const document = parseWorkspaceMessageBody(`[bad](${authorityLikePath})`);
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toBe("<p>bad</p>");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("evil.example");
  });

  it("renders safe canonical external URL URNs as exact clickable links", () => {
    const document = parseWorkspaceMessageBody(
      [
        "[External docs](urn:url:https://example.com/docs?x=1#section)",
        "[HTTP fallback](urn:url:http://example.org/path?y=2#fragment)",
        "`[inline code](urn:url:https://example.net/inline)`",
        "```md",
        "[fenced code](urn:url:https://example.net/fenced)",
        "```",
      ].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain(
      '<a href="https://example.com/docs?x=1#section" target="_blank" rel="noopener noreferrer">External docs</a>',
    );
    expect(result.html).toContain(
      '<a href="http://example.org/path?y=2#fragment" target="_blank" rel="noopener noreferrer">HTTP fallback</a>',
    );
    expect(result.html).toContain("<code>[inline code](urn:url:https://example.net/inline)</code>");
    expect(result.html).toContain(
      '<pre><code class="hljs language-md">[fenced code](urn:url:https://example.net/fenced)</code></pre>',
    );
    expect(document.metadata.hasLinks).toBe(true);
  });

  it("renders unsafe canonical external URL URNs as labels without anchors", () => {
    const document = parseWorkspaceMessageBody(
      [
        "[script](urn:url:javascript:alert)",
        "[credentials](urn:url:https://user:secret@example.com/path)",
        "[nested](urn:url:urn:url:https://example.com/path)",
      ].join(" "),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toBe("<p>script credentials nested</p>");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("urn:url:");
  });

  it("renders non-Workspace markdown images as labels, not media tags", () => {
    const document = parseWorkspaceMessageBody("![screen.png](https://cdn.example/screen.png)");
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toBe("<p>screen.png</p>");
    expect(result.html).not.toContain("<img");
    expect(result.metadata).toMatchObject({
      hasMedia: false,
      hasProtectedMedia: false,
      hasAttachments: false,
    });
  });

  it("parses Workspace image references as protected media metadata", () => {
    const fileUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(
      `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng&w=1280&h=720&size=245901)`,
    );
    const result = renderWorkspaceMessageBody(document);

    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "file",
            reference: {
              kind: "media",
              href: `urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng&w=1280&h=720&size=245901`,
              fileUuid,
              name: "screen.png",
              contentType: "image/png",
              width: 1280,
              height: 720,
              sizeBytes: 245901,
              mediaKind: "image",
            },
          },
        ],
      },
    ]);
    expect(result.html).toBe("<p>Изображение</p>");
    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("src=");
    expect(result.metadata).toMatchObject({
      contentKind: "media",
      hasLinks: false,
      hasMedia: true,
      hasProtectedMedia: true,
      hasAttachments: false,
      preferredMetaPlacement: "row",
      textPreview: "Изображение",
    });
  });

  it("parses Workspace file URNs without metadata and ignores invalid numeric metadata", () => {
    const imageUuid = "11111111-1111-4111-8111-111111111111";
    const videoUuid = "22222222-2222-4222-8222-222222222222";
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const document = parseWorkspaceMessageBody(
      [
        `![screen.png](urn:image:${imageUuid})`,
        `[clip.mp4](urn:video:${videoUuid}?name=clip.mp4&w=1920px&h=1e3&size=abc&unknown=value)`,
        `[report.pdf](urn:file:${fileUuid})`,
      ].join(" "),
    );

    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "file",
            reference: {
              kind: "media",
              href: `urn:image:${imageUuid}`,
              fileUuid: imageUuid,
              name: "screen.png",
              mediaKind: "image",
            },
          },
          { kind: "text", text: " " },
          {
            kind: "file",
            reference: {
              kind: "media",
              href: `urn:video:${videoUuid}?name=clip.mp4&w=1920px&h=1e3&size=abc&unknown=value`,
              fileUuid: videoUuid,
              name: "clip.mp4",
              mediaKind: "video",
            },
          },
          { kind: "text", text: " " },
          {
            kind: "file",
            reference: {
              kind: "attachment",
              href: `urn:file:${fileUuid}`,
              fileUuid,
              name: "report.pdf",
            },
          },
        ],
      },
    ]);
    expect(document.metadata).toMatchObject({
      hasMedia: true,
      hasProtectedMedia: true,
      hasAttachments: true,
    });
  });

  it("does not parse old Workspace file URLs as file metadata", () => {
    const fileUuid = "8c5fffd3-226e-4016-a49f-71282f52edfb";
    const oldProtocol = `workspace-file://${fileUuid}`;
    const oldDownloadUrl = `/api/workspace/v1/messenger/files/${fileUuid}/actions/download`;

    const document = parseWorkspaceMessageBody(
      [`[old-protocol](${oldProtocol})`, `[old-download](${oldDownloadUrl})`].join(" "),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("old-protocol");
    expect(result.html).toContain("old-download");
    expect(result.html).toContain(`href="${oldDownloadUrl}"`);
    expect(result.html).not.toContain('data-workspace-file="true"');
    expect(document.metadata).toMatchObject({
      hasLinks: true,
      hasMedia: false,
      hasAttachments: false,
    });
  });

  it("keeps non-matching file paths as ordinary links", () => {
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const document = parseWorkspaceMessageBody(
      [
        `[broad](/files/${fileUuid}/actions/download)`,
        `[wrong-action](/api/workspace/v1/messenger/files/${fileUuid}/actions/preview)`,
        "[docs](/api/workspace/v1/messenger/docs)",
      ].join(" "),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain(`href="/files/${fileUuid}/actions/download"`);
    expect(result.html).toContain(
      `href="/api/workspace/v1/messenger/files/${fileUuid}/actions/preview"`,
    );
    expect(result.html).toContain('href="/api/workspace/v1/messenger/docs"');
    expect(result.html).not.toContain('data-workspace-file="true"');
    expect(result.metadata).toMatchObject({
      hasLinks: true,
      hasMedia: false,
      hasAttachments: false,
    });
  });

  it("renders enabled Workspace protected media with the default protected image placeholder", () => {
    const fileUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(
      `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng&w=1280&h=720&size=245901)`,
    );
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: false,
      enableQuotes: true,
      enableEmojiShortcodes: true,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: true,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(result.html).toContain('data-workspace-file="true"');
    expect(result.html).toContain(`data-workspace-file-uuid="${fileUuid}"`);
    expect(result.html).toContain('data-workspace-file-kind="media"');
    expect(result.html).toContain('data-workspace-media-kind="image"');
    expect(result.html).toContain('data-workspace-file-content-type="image/png"');
    expect(result.html).toContain('data-workspace-media-width="1280"');
    expect(result.html).toContain('data-workspace-media-height="720"');
    expect(result.html).toContain('data-workspace-file-size="245901"');
    expect(result.html).toContain('title="Изображение"');
    expect(result.html).toContain('class="workspace-message-file-placeholder__image"');
    expect(result.html).toContain(`src="${AUTH_IMAGE_PLACEHOLDER_SRC}"`);
    expect(result.html).toContain('class="workspace-message-file-placeholder__label sr-only"');
    expect(result.html).toContain("Изображение");
    expect(result.html).not.toContain("workspace-message-file-placeholder__video-visual");
    expect(result.html).not.toContain("<video");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("blob:");
    expect(result.html).not.toContain(`urn:image:${fileUuid}`);
    expect(result.html).not.toContain("/api/workspace/v1/messenger/files");
    expect(result.html).not.toContain(["", "user_uploads"].join("/"));
  });

  it("renders Workspace video references as protected media placeholders", () => {
    const fileUuid = "22222222-2222-4222-8222-222222222222";
    const document = parseWorkspaceMessageBody(
      `[clip.mp4](urn:video:${fileUuid}?name=clip.mp4&content_type=video%2Fmp4&w=1920&h=1080&size=8021102)`,
    );
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: false,
      enableQuotes: true,
      enableEmojiShortcodes: true,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: true,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(document.metadata).toMatchObject({
      contentKind: "media",
      hasMedia: true,
      hasProtectedMedia: true,
      hasAttachments: false,
    });
    expect(result.html).toContain("Видео");
    expect(result.html).toContain('data-workspace-media-kind="video"');
    expect(result.html).toContain('data-workspace-media-width="1920"');
    expect(result.html).toContain('data-workspace-media-height="1080"');
    expect(result.html).toContain('style="width:320px"');
    expect(result.html).toContain(`style="aspect-ratio:${16 / 9}"`);
    expect(result.html).toContain('class="workspace-message-file-placeholder__video-visual"');
    expect(result.html).toContain(
      'class="workspace-message-file-placeholder__video-icon" aria-hidden="true"',
    );
    expect(result.html).toContain(
      'class="workspace-message-file-placeholder__label sr-only">Видео</span>',
    );
    expect(result.html).not.toContain("<video");
    expect(result.html).not.toContain("src=");
    expect(result.html).not.toContain(`urn:video:${fileUuid}`);
    expect(result.html).not.toContain("/api/workspace/v1/messenger/files");
    expect(result.html).not.toContain("<svg");
  });

  it.each([
    {
      query: "w=1080&h=1920",
      placeholderStyle: "width:135px",
      visualStyle: `aspect-ratio:${9 / 16}`,
    },
    {
      query: "",
      placeholderStyle: "width:320px",
      visualStyle: `aspect-ratio:${16 / 9}`,
    },
    {
      query: "w=100000&h=100",
      placeholderStyle: "width:320px",
      visualStyle: "aspect-ratio:2",
    },
    {
      query: "w=100&h=100000",
      placeholderStyle: "width:120px",
      visualStyle: "aspect-ratio:0.5",
    },
  ])(
    "renders bounded video placeholder layout before preview effects for $query",
    ({ query, placeholderStyle, visualStyle }) => {
      const fileUuid = "77777777-7777-4777-8777-777777777777";
      const suffix = query.length > 0 ? `&${query}` : "";
      const document = parseWorkspaceMessageBody(
        `[clip.mp4](urn:video:${fileUuid}?content_type=video%2Fmp4${suffix})`,
      );
      const result = renderWorkspaceMessageBody(document, {
        enableMarkdown: true,
        enableMentions: false,
        enableQuotes: true,
        enableEmojiShortcodes: true,
        enableCodeHighlight: false,
        enableCodeCopy: false,
        enableProtectedMedia: true,
        enableAttachments: false,
        enableGallery: false,
      });

      expect(result.html).toContain(`style="${placeholderStyle}"`);
      expect(result.html).toContain(`style="${visualStyle}"`);
      expect(result.html).toContain(
        'class="workspace-message-file-placeholder__video-icon" aria-hidden="true"',
      );
      expect(result.html).not.toContain("/api/workspace/v1/messenger/files");
    },
  );

  it("renders Workspace attachment references without enabling download links", () => {
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const document = parseWorkspaceMessageBody(
      `[report.pdf](urn:file:${fileUuid}?name=report.pdf&content_type=application%2Fpdf&size=348991)`,
    );
    const disabled = renderWorkspaceMessageBody(document);
    const enabled = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: false,
      enableQuotes: true,
      enableEmojiShortcodes: true,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: true,
      enableGallery: false,
    });

    expect(document.metadata).toMatchObject({
      contentKind: "attachment",
      hasMedia: false,
      hasProtectedMedia: false,
      hasAttachments: true,
      preferredMetaPlacement: "row",
      textPreview: "Файл: report.pdf",
    });
    expect(disabled.html).toBe("<p>Файл: report.pdf</p>");
    expect(enabled.html).toContain(`data-workspace-file-uuid="${fileUuid}"`);
    expect(enabled.html).toContain('data-workspace-file-kind="attachment"');
    expect(enabled.html).toContain('data-workspace-file-size="348991"');
    expect(enabled.html).toContain('title="Файл: report.pdf"');
    expect(enabled.html).toContain('class="workspace-message-file-placeholder__label"');
    expect(enabled.html).toContain("Файл: report.pdf");
    expect(enabled.html).not.toContain("workspace-message-file-placeholder__video-visual");
    expect(enabled.html).not.toContain("href=");
    expect(enabled.html).not.toContain("download");
    expect(enabled.html).not.toContain(`urn:file:${fileUuid}`);
    expect(enabled.html).not.toContain("/api/workspace/v1/messenger/files");
  });

  it("renders resolved Workspace mentions with UUID data attributes only", () => {
    const document = parseWorkspaceMessageBody("Привет @**Alice Reed**", {
      resolveMention: (displayText) =>
        displayText === "Alice Reed"
          ? {
              userUuid: "11111111-1111-4111-8111-111111111111",
              displayText: "Alice Reed",
            }
          : null,
    });
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: false,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(document.metadata.hasMentions).toBe(true);
    expect(result.html).toContain('data-workspace-mention="true"');
    expect(result.html).toContain(
      'data-workspace-user-uuid="11111111-1111-4111-8111-111111111111"',
    );
    expect(result.html).toContain("@Alice Reed");
    expect(result.html).not.toContain("data-user-id");
  });

  it("resolves one mention once and keeps legacy blocks aligned with the rich render", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const resolveMention = vi.fn(() => ({
      userUuid,
      displayText: "Alice Reed",
    }));
    const document = parseWorkspaceMessageBody("Привет @**Alice Reed**", {
      resolveMention,
    });
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: false,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(resolveMention).toHaveBeenCalledTimes(1);
    expect(resolveMention).toHaveBeenCalledWith("Alice Reed");
    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", text: "Привет " },
          { kind: "mention", displayText: "Alice Reed", userUuid },
        ],
      },
    ]);
    expect(result.html).toContain(`data-workspace-user-uuid="${userUuid}"`);
    expect(result.html).toContain("@Alice Reed");
    expect(result.html).not.toContain("@**Alice Reed**");
  });

  it("keeps only the two validated internal media style formats", () => {
    const sanitized = sanitizeWorkspaceMessageHtml(
      [
        '<span class="arbitrary" style="color:red;width:9999px">unsafe</span>',
        '<span class="workspace-message-file-placeholder" style="width:320px">video</span>',
        '<span class="workspace-message-file-placeholder__video-visual" style="aspect-ratio:1.7777777777777777">visual</span>',
        '<span class="workspace-message-file-placeholder" style="aspect-ratio:2">wrong class</span>',
        '<span class="workspace-message-file-placeholder__video-visual" style="width:320px">wrong format</span>',
      ].join(""),
    );

    expect(sanitized).toContain('<span class="arbitrary">unsafe</span>');
    expect(sanitized).toContain(
      '<span class="workspace-message-file-placeholder" style="width:320px">video</span>',
    );
    expect(sanitized).toContain(
      '<span class="workspace-message-file-placeholder__video-visual" style="aspect-ratio:1.7777777777777777">visual</span>',
    );
    expect(sanitized).toContain(
      '<span class="workspace-message-file-placeholder">wrong class</span>',
    );
    expect(sanitized).toContain(
      '<span class="workspace-message-file-placeholder__video-visual">wrong format</span>',
    );
    expect(sanitized).not.toContain("color:red");
    expect(sanitized).not.toContain("width:9999px");
  });

  it("parses canonical Workspace UUID mentions and renders resolved display names", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(`Привет <@${userUuid}>`, {
      resolveMention: (displayText) =>
        displayText === userUuid
          ? {
              userUuid,
              displayText: "Alice Reed",
            }
          : null,
    });
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: false,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", text: "Привет " },
          {
            kind: "mention",
            displayText: "Alice Reed",
            userUuid,
          },
        ],
      },
    ]);
    expect(document.metadata.hasMentions).toBe(true);
    expect(result.html).toContain('data-workspace-mention="true"');
    expect(result.html).toContain(`data-workspace-user-uuid="${userUuid}"`);
    expect(result.html).toContain("@Alice Reed");
    expect(result.html).not.toContain("<@");
    expect(result.html).not.toContain("data-user-id");
  });

  it("parses canonical Workspace user and message URNs inside reply quotes", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const document = parseWorkspaceMessageBody(
      [
        `> [Alice Reed](urn:user:${userUuid}) [said](urn:message:${messageUuid}):`,
        "> quoted text",
      ].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: true,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(document.metadata).toMatchObject({
      hasMentions: true,
      hasLinks: true,
      hasRichBlocks: true,
    });
    expect(result.html).toContain('class="workspace-message-quote"');
    expect(result.html).toContain('data-workspace-mention="true"');
    expect(result.html).toContain(`data-workspace-user-uuid="${userUuid}"`);
    expect(result.html).toContain('data-workspace-message-link="true"');
    expect(result.html).toContain(`data-workspace-message-uuid="${messageUuid}"`);
    expect(result.html).toContain(`href="#workspace-message-${messageUuid}"`);
    expect(result.html).not.toContain(`urn:user:${userUuid}`);
    expect(result.html).not.toContain(`urn:message:${messageUuid}`);
  });

  it("parses a standalone quote URN as a dedicated render segment", () => {
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const selectedText = "точный фрагмент & следующая строка";
    const document = parseWorkspaceMessageBody(
      `[Sleep](urn:quote:${messageUuid}?text=${encodeURIComponent(selectedText)})`,
      {
        resolveMention: () => ({
          userUuid: "11111111-1111-4111-8111-111111111111",
          displayText: "Wrong mention",
        }),
      },
    );
    const result = renderWorkspaceMessageBodySegments(document);

    expect(document.blocks).toEqual([
      {
        kind: "quote-reference",
        reference: {
          messageUuid,
          selectedText,
          fallbackAuthorLabel: "Sleep",
        },
      },
    ]);
    expect(document.metadata).toMatchObject({
      hasMentions: false,
      hasLinks: true,
      hasRichBlocks: true,
      textPreview: "Цитата",
    });
    expect(result.segments).toEqual([
      {
        kind: "quote",
        reference: {
          messageUuid,
          selectedText,
          fallbackAuthorLabel: "Sleep",
        },
      },
    ]);
  });

  it("keeps an inline quote URN as a safe UUID message link", () => {
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const document = parseWorkspaceMessageBody(`Смотри [Sleep](urn:quote:${messageUuid}) выше`);
    const segmented = renderWorkspaceMessageBodySegments(document);
    const compatible = renderWorkspaceMessageBody(document);

    expect(document.blocks[0]?.kind).toBe("paragraph");
    expect(segmented.segments).toHaveLength(1);
    expect(segmented.segments[0]?.kind).toBe("html");
    expect(compatible.html).toContain('data-workspace-message-link="true"');
    expect(compatible.html).toContain(`data-workspace-message-uuid="${messageUuid}"`);
    expect(compatible.html).not.toContain("urn:quote:");
    expect(compatible.html).not.toContain('data-workspace-mention="true"');
  });

  it("preserves message order across quote and html segments", () => {
    const firstMessageUuid = "22222222-2222-4222-8222-222222222222";
    const secondMessageUuid = "33333333-3333-4333-8333-333333333333";
    const document = parseWorkspaceMessageBody(
      [
        "Вступление",
        "",
        `[Alice](urn:quote:${firstMessageUuid})`,
        "",
        "Ответ",
        "",
        `[Bob](urn:quote:${secondMessageUuid})`,
      ].join("\n"),
    );

    const segments = renderWorkspaceMessageBodySegments(document).segments;

    expect(segments).toMatchObject([
      { kind: "html" },
      {
        kind: "quote",
        reference: {
          messageUuid: firstMessageUuid,
          fallbackAuthorLabel: "Alice",
        },
      },
      { kind: "html" },
      {
        kind: "quote",
        reference: {
          messageUuid: secondMessageUuid,
          fallbackAuthorLabel: "Bob",
        },
      },
    ]);
    if (segments[0]?.kind === "html" && segments[2]?.kind === "html") {
      expect(segments[0].html).toContain("Вступление");
      expect(segments[2].html).toContain("Ответ");
      expect(segments[0].html).not.toContain("workspace-message-gap");
      expect(segments[2].html).not.toContain("workspace-message-gap");
    }
  });

  it("keeps the string renderer as a sanitized quote compatibility adapter", () => {
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const document = parseWorkspaceMessageBody(
      `[<img src=x onerror=alert(1)>](urn:quote:${messageUuid})`,
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain('data-workspace-quote-reference="true"');
    expect(result.html).toContain(`data-workspace-message-uuid="${messageUuid}"`);
    expect(result.html).not.toContain("<img");
    expect(result.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(result.html).not.toContain("urn:quote:");
  });

  it("parses stream and topic URNs as typed internal links", () => {
    const streamUuid = "33333333-3333-4333-8333-333333333333";
    const topicUuid = "44444444-4444-4444-8444-444444444444";
    const document = parseWorkspaceMessageBody(
      [
        `[general](urn:stream:${streamUuid})`,
        `[#general > Bugs](urn:topic:${streamUuid}:${topicUuid})`,
        "[docs](https://example.com/docs)",
      ].join(" "),
    );

    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "link",
            href: `urn:stream:${streamUuid}`,
            workspaceReference: { kind: "stream", streamUuid },
            children: [{ kind: "text", text: "general" }],
          },
          { kind: "text", text: " " },
          {
            kind: "link",
            href: `urn:topic:${streamUuid}:${topicUuid}`,
            workspaceReference: { kind: "topic", streamUuid, topicUuid },
            children: [{ kind: "text", text: "#general > Bugs" }],
          },
          { kind: "text", text: " " },
          {
            kind: "link",
            href: "https://example.com/docs",
            children: [{ kind: "text", text: "docs" }],
          },
        ],
      },
    ]);
    expect(document.metadata).toMatchObject({ hasLinks: true });

    const result = renderWorkspaceMessageBody(document);
    expect(result.html).toContain(
      `data-workspace-reference="true" data-workspace-reference-kind="stream" data-workspace-stream-uuid="${streamUuid}"`,
    );
    expect(result.html).toContain(
      `href="#workspace-reference-topic-${streamUuid}-${topicUuid}" data-workspace-reference="true" data-workspace-reference-kind="topic"`,
    );
    expect(result.html).toContain('href="https://example.com/docs"');
    expect(result.html).not.toContain("urn:stream:");
    expect(result.html).not.toContain("urn:topic:");
  });

  it("renders a canonical topic URN without a stream UUID as a Workspace reference", () => {
    const topicUuid = "44444444-4444-4444-8444-444444444444";
    const document = parseWorkspaceMessageBody(`[Bugs](urn:topic:${topicUuid})`);

    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "link",
            href: `urn:topic:${topicUuid}`,
            workspaceReference: { kind: "topic", topicUuid },
            children: [{ kind: "text", text: "Bugs" }],
          },
        ],
      },
    ]);

    const result = renderWorkspaceMessageBody(document);
    expect(result.html).toContain("Bugs");
    expect(result.html).toContain(
      `href="#workspace-reference-topic-${topicUuid}" data-workspace-reference="true" data-workspace-reference-kind="topic"`,
    );
    expect(result.html).toContain(`data-workspace-topic-uuid="${topicUuid}"`);
    expect(result.html).not.toContain("data-workspace-stream-uuid");
  });

  it("keeps invalid Workspace entity URNs as non-navigable labels", () => {
    const document = parseWorkspaceMessageBody(
      "[bad user](urn:user:not-a-uuid) [bad message](urn:message:not-a-uuid)",
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toBe("<p>bad user bad message</p>");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("data-workspace-user-uuid");
    expect(result.html).not.toContain("data-workspace-message-uuid");
  });

  it("renders known unicode emoji shortcodes and keeps unknown/custom shortcodes as text", () => {
    const document = parseWorkspaceMessageBody(
      "Привет :smile: :party_parrot: :definitely_unknown_shortcode:",
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toBe("<p>Привет 😄 :party_parrot: :definitely_unknown_shortcode:</p>");
    expect(result.html).not.toContain("<img");
    expect(result.metadata).toMatchObject({
      contentKind: "inline-rich",
      textPreview: "Привет 😄 :party_parrot: :definitely_unknown_shortcode:",
    });
  });

  it("keeps emoji shortcodes as source text when emoji rendering is disabled", () => {
    const document = parseWorkspaceMessageBody("Привет :smile:");
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: false,
      enableQuotes: true,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(result.html).toBe("<p>Привет :smile:</p>");
  });

  it("does not replace emoji shortcode text inside inline code or fenced code", () => {
    const document = parseWorkspaceMessageBody(
      ["Inline `:smile:`", "", "```", ":smile:", "```"].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("<p>Inline <code>:smile:</code></p>");
    expect(result.html).toContain('<pre><code class="hljs">:smile:</code></pre>');
    expect(result.html).not.toContain("<code>😄</code>");
  });

  it("renders ordered lists and following paragraphs as separate sibling blocks", () => {
    const document = parseWorkspaceMessageBody(
      ["1. First", "2. Second", "", "After list"].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    const listEnd = result.html.indexOf("</ol>");
    const gap = result.html.indexOf("workspace-message-gap--1");
    const trailingParagraph = result.html.indexOf("<p>After list</p>");

    expect(result.html).toContain("<ol>");
    expect(listEnd).toBeGreaterThanOrEqual(0);
    expect(gap).toBeGreaterThan(listEnd);
    expect(trailingParagraph).toBeGreaterThan(gap);
  });

  it("renders inline code and code blocks with bubble-compatible code classes", () => {
    const document = parseWorkspaceMessageBody(
      ["Inline `value`", "", "```ts", "const value = 1;", "```"].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain("<p>Inline <code>value</code></p>");
    expect(result.html).toContain(
      '<pre><code class="hljs language-ts">const value = 1;</code></pre>',
    );
  });

  it("keeps unresolved Workspace mentions as readable text", () => {
    const document = parseWorkspaceMessageBody("Привет @**Unknown User**", {
      resolveMention: () => null,
    });
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: false,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(document.metadata.hasMentions).toBe(true);
    expect(result.html).toBe("<p>Привет @Unknown User</p>");
    expect(result.html).not.toContain("data-workspace-user-uuid");
    expect(result.html).not.toContain("data-user-id");
  });

  it("keeps unresolved canonical Workspace UUID mentions readable without callbacks", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(`Привет <@${userUuid}>`);
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: false,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", text: "Привет " },
          {
            kind: "mention",
            displayText: userUuid,
            userUuid,
            unresolved: true,
          },
        ],
      },
    ]);
    expect(document.metadata.hasMentions).toBe(true);
    expect(result.html).toContain(`data-workspace-user-uuid="${userUuid}"`);
    expect(result.html).toContain(`@${userUuid}`);
    expect(result.html).not.toContain("data-user-id");
  });

  it("can render source markdown as escaped plain text when markdown is disabled", () => {
    const document = parseWorkspaceMessageBody("Hello **bold**\n<script>alert(1)</script>");
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: false,
      enableMentions: false,
      enableQuotes: false,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(result.html).toBe("Hello **bold**<br>&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders the markdown blockquote syntax that Workspace composer sends for replies", () => {
    const document = parseWorkspaceMessageBody(
      ["> Alice: quoted line", "> second quoted line", "", "Own reply"].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain(
      '<blockquote class="workspace-message-quote"><p>Alice: quoted line<br>second quoted line</p></blockquote>',
    );
    expect(result.html).toContain("<p>Own reply</p>");
    expect(document.metadata).toMatchObject({
      contentKind: "block-rich",
      hasRichBlocks: true,
      // The reply text is the last block, so the meta stays on its line.
      preferredMetaPlacement: "inline",
      textPreview: "Own reply",
    });
  });

  it("renders historical quote fences as read-only Workspace quote blocks", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(
      ["```quote", `[Alice](urn:user:${userUuid})`, "", "Quoted body", "```"].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: true,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(result.html).toContain('<blockquote class="workspace-message-quote">');
    expect(result.html).toContain('data-workspace-mention="true"');
    expect(result.html).not.toContain("<pre>");
    expect(result.html).not.toContain("```quote");
  });

  it("renders nested historical quote fences inside a markdown quote", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const document = parseWorkspaceMessageBody(
      [
        "> **corle corle**:",
        `> [Alice](urn:user:${userUuid}) [said](urn:message:${messageUuid}):`,
        "> `````quote",
        "> ````quote",
        "> ```",
        "> curl --compressed https://workspace.example/files/download",
        "> ```",
        "> ````",
        "> должно заработать",
        "> `````",
        "",
        "4444",
      ].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document, {
      enableMarkdown: true,
      enableMentions: true,
      enableQuotes: true,
      enableEmojiShortcodes: false,
      enableCodeHighlight: false,
      enableCodeCopy: false,
      enableProtectedMedia: false,
      enableAttachments: false,
      enableGallery: false,
    });

    expect(result.html.match(/class="workspace-message-quote"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(result.html).toContain(`data-workspace-user-uuid="${userUuid}"`);
    expect(result.html).toContain(`data-workspace-message-uuid="${messageUuid}"`);
    expect(result.html).not.toContain("language-quote");
    expect(result.html).toContain("4444");
  });

  it("keeps nested markdown blockquotes as compact quote blocks", () => {
    const document = parseWorkspaceMessageBody(
      ["> Alice: outer", ">", "> > Bob: nested", ">", "> outer tail"].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html.match(/class="workspace-message-quote"/g)).toHaveLength(2);
    expect(result.html).toContain(
      '<blockquote class="workspace-message-quote"><p>Bob: nested</p></blockquote>',
    );
    expect(result.html).not.toContain("<p></p>");
  });

  it("renders Workspace inline and fenced spoilers without legacy runtime helpers", () => {
    const document = parseWorkspaceMessageBody(
      ["Before ||secret|| after", "", "```spoiler Hidden", "payload", "```"].join("\n"),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain(
      '<span class="inline-spoiler" data-inline-spoiler="true" data-workspace-spoiler-inline="true">secret</span>',
    );
    expect(result.html).toContain('<div class="spoiler-block">');
    expect(result.html).toContain('class="spoiler-header"');
    expect(result.html).toContain('data-workspace-spoiler-toggle="true"');
    expect(result.html).toContain('<div class="spoiler-content"><p>payload</p></div>');
    expect(result.html).not.toContain("zulip");
  });

  it("allows only Workspace UUID message routes as message links", () => {
    const workspaceMessageUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(
      [
        `[workspace](/org/org-a/project/project-a/message/${workspaceMessageUuid})`,
        "[legacy](/message/123)",
        "[old stream](/stream/10-general/topic/Bugs?msg=55)",
        "[narrow](https://zulip.example/#narrow/channel/10-general/topic/Bugs/near/55)",
      ].join(" "),
    );
    const result = renderWorkspaceMessageBody(document);

    expect(result.html).toContain('data-workspace-message-link="true"');
    expect(result.html).toContain(`data-workspace-message-uuid="${workspaceMessageUuid}"`);
    expect(result.html).toContain(
      `href="/org/org-a/project/project-a/message/${workspaceMessageUuid}"`,
    );
    expect(result.html).not.toContain(
      `href="/org/org-a/project/project-a/message/${workspaceMessageUuid}" target="_blank"`,
    );
    expect(result.html).not.toContain('href="/message/123"');
    expect(result.html).not.toContain('href="/stream/10-general/topic/Bugs?msg=55"');
    expect(result.html).not.toContain('href="https://zulip.example/#narrow');
    expect(result.html).toContain("legacy");
    expect(result.html).toContain("old stream");
    expect(result.html).toContain("narrow");
  });
});

describe("workspace message intentional vertical gaps", () => {
  it.each([1, 2, 3, 4, 5])(
    "renders %i internal empty line(s) as the matching bounded gap",
    (emptyLineCount) => {
      const result = renderWorkspaceMessageBody(
        parseWorkspaceMessageBody(markdownWithEmptyLines(emptyLineCount)),
      );

      expect(result.html).toContain("workspace-message-gap");
      expect(result.html).toContain(`workspace-message-gap--${emptyLineCount}`);
      expect(result.html.match(/workspace-message-gap--\d/g)).toHaveLength(1);
      expect(result.html).toContain('aria-hidden="true"');
    },
  );

  it.each([6, 9, 20])("limits %i internal empty lines to gap--5", (emptyLineCount) => {
    const result = renderWorkspaceMessageBody(
      parseWorkspaceMessageBody(markdownWithEmptyLines(emptyLineCount)),
    );

    expect(result.html).toContain("workspace-message-gap--5");
    expect(result.html).not.toContain("workspace-message-gap--6");
    expect(result.html.match(/workspace-message-gap--\d/g)).toHaveLength(1);
  });

  it("does not create gaps from leading or trailing empty lines", () => {
    const result = renderWorkspaceMessageBody(
      parseWorkspaceMessageBody(["", "", "Message", "", "", ""].join("\n")),
    );

    expect(result.html).not.toContain("workspace-message-gap");
    expect(result.html).toContain("Message");
  });

  it("keeps a single line break on the ordinary Markdown breaks path", () => {
    const result = renderWorkspaceMessageBody(parseWorkspaceMessageBody("Before\nAfter"));

    expect(result.html).toContain("Before<br>After");
    expect(result.html).not.toContain("workspace-message-gap");
  });

  it("preserves empty lines inside fenced code without creating layout gaps", () => {
    const result = renderWorkspaceMessageBody(
      parseWorkspaceMessageBody(["```text", "line one", "", "", "", "line two", "```"].join("\n")),
    );

    expect(result.html).not.toContain("workspace-message-gap");
    expect(result.html).toContain("line one\n\n\n\nline two");
  });

  it("preserves separate gaps next to standard GFM and a Workspace URN", () => {
    const messageUuid = "11111111-1111-4111-8111-111111111111";
    const result = renderWorkspaceMessageBody(
      parseWorkspaceMessageBody(
        [
          "Before",
          "",
          "",
          `## [Open message](urn:message:${messageUuid})`,
          "",
          "",
          "",
          "",
          "| Item | State |",
          "|---|---|",
          "| Renderer | Ready |",
        ].join("\n"),
      ),
    );

    expect(result.html).toContain("workspace-message-gap--2");
    expect(result.html).toContain("workspace-message-gap--4");
    expect(result.html.match(/workspace-message-gap--\d/g)).toHaveLength(2);
    expect(result.html).toContain(`data-workspace-message-uuid="${messageUuid}"`);
    expect(result.html).toContain("workspace-message-table-scroll");
  });

  it("preserves an intentional gap inside nested Markdown block tokens", () => {
    const result = renderWorkspaceMessageBody(
      parseWorkspaceMessageBody(["> Before", ">", ">", "> After"].join("\n")),
    );

    expect(result.html).toContain("workspace-message-quote");
    expect(result.html).toContain("workspace-message-gap--2");
    expect(result.html.match(/workspace-message-gap--\d/g)).toHaveLength(1);
  });

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    "does not render a gap directly around a standalone quote separated by %i empty line(s)",
    (emptyLineCount) => {
      const messageUuid = "33333333-3333-4333-8333-333333333333";
      const emptyLines = Array.from({ length: emptyLineCount }, () => "");
      const result = renderWorkspaceMessageBodySegments(
        parseWorkspaceMessageBody(
          [
            "Intro",
            ...emptyLines,
            `[Alice](urn:quote:${messageUuid})`,
            ...emptyLines,
            "Outro",
          ].join("\n"),
        ),
      );

      expect(result.segments).toHaveLength(3);
      expect(result.segments[0]).toMatchObject({ kind: "html" });
      expect(result.segments[1]).toMatchObject({ kind: "quote", reference: { messageUuid } });
      expect(result.segments[2]).toMatchObject({ kind: "html" });
      if (result.segments[0]?.kind === "html" && result.segments[2]?.kind === "html") {
        expect(result.segments[0].html).toContain("Intro");
        expect(result.segments[2].html).toContain("Outro");
        expect(result.segments[0].html).not.toContain("workspace-message-gap");
        expect(result.segments[2].html).not.toContain("workspace-message-gap");
      }
    },
  );

  it("drops spacing tokens between several consecutive standalone quote references", () => {
    const firstMessageUuid = "44444444-4444-4444-8444-444444444444";
    const secondMessageUuid = "55555555-5555-4555-8555-555555555555";
    const result = renderWorkspaceMessageBodySegments(
      parseWorkspaceMessageBody(
        [
          "Intro",
          "",
          "",
          `[Alice](urn:quote:${firstMessageUuid})`,
          "",
          "[first-definition]: https://example.com/first",
          "",
          "[second-definition]: https://example.com/second",
          "",
          `[Bob](urn:quote:${secondMessageUuid})`,
          "",
          "",
          "Outro",
        ].join("\n"),
      ),
    );

    expect(result.segments.map((segment) => segment.kind)).toEqual([
      "html",
      "quote",
      "quote",
      "html",
    ]);
    expect(result.segments).toMatchObject([
      { kind: "html" },
      { kind: "quote", reference: { messageUuid: firstMessageUuid } },
      { kind: "quote", reference: { messageUuid: secondMessageUuid } },
      { kind: "html" },
    ]);
    for (const segment of result.segments) {
      if (segment.kind === "html") {
        expect(segment.html).not.toContain("workspace-message-gap");
      }
    }
  });

  it("does not leave a visually adjacent quote gap across non-rendered GFM definitions", () => {
    const messageUuid = "66666666-6666-4666-8666-666666666666";
    const result = renderWorkspaceMessageBodySegments(
      parseWorkspaceMessageBody(
        [
          "Intro",
          "",
          "[guide]: https://example.com/guide",
          "",
          `[Alice](urn:quote:${messageUuid})`,
          "",
          "[after]: https://example.com/after",
          "",
          "Outro [guide]",
        ].join("\n"),
      ),
    );

    expect(result.segments.map((segment) => segment.kind)).toEqual(["html", "quote", "html"]);
    for (const segment of result.segments) {
      if (segment.kind === "html") {
        expect(segment.html).not.toContain("workspace-message-gap");
      }
    }
  });

  it("does not emit edge gaps around a standalone quote-only message", () => {
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const result = renderWorkspaceMessageBodySegments(
      parseWorkspaceMessageBody(
        ["", "", `[Alice](urn:quote:${messageUuid})`, "", "", ""].join("\n"),
      ),
    );

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      kind: "quote",
      reference: { messageUuid },
    });
    expect(result.segments.some((segment) => segment.kind === "html")).toBe(false);
  });
});
