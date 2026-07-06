import { describe, expect, it } from "vitest";
import { parseWorkspaceMessageBody } from "./workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "./workspace-message-render.lib";

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
    expect(result.metadata.preferredMetaPlacement).toBe("row");
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
    const document = parseWorkspaceMessageBody(`![screen.png](workspace-file://${fileUuid})`);
    const result = renderWorkspaceMessageBody(document);

    expect(document.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          {
            kind: "file",
            reference: {
              kind: "media",
              href: `workspace-file://${fileUuid}`,
              fileUuid,
              name: "screen.png",
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
      hasMedia: true,
      hasProtectedMedia: true,
      hasAttachments: false,
      preferredMetaPlacement: "row",
      textPreview: "Изображение",
    });
  });

  it("renders enabled Workspace protected media as explicit placeholders without browser src", () => {
    const fileUuid = "11111111-1111-4111-8111-111111111111";
    const document = parseWorkspaceMessageBody(
      `![screen.png](workspace-file://${fileUuid}?content_type=image/png)`,
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
    expect(result.html).toContain("Изображение");
    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("<video");
    expect(result.html).not.toContain("src=");
    expect(result.html).not.toContain("blob:");
    expect(result.html).not.toContain(["", "user_uploads"].join("/"));
  });

  it("renders Workspace video references as protected media placeholders", () => {
    const fileUuid = "22222222-2222-4222-8222-222222222222";
    const document = parseWorkspaceMessageBody(
      `[clip.mp4](workspace-file://${fileUuid}?content_type=video/mp4)`,
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
    expect(result.html).not.toContain("<video");
    expect(result.html).not.toContain("src=");
  });

  it("renders Workspace attachment references without enabling download links", () => {
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const document = parseWorkspaceMessageBody(`[report.pdf](workspace-file://${fileUuid})`);
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
    expect(enabled.html).toContain("Файл: report.pdf");
    expect(enabled.html).not.toContain("href=");
    expect(enabled.html).not.toContain("download");
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

    expect(result.html).toBe(
      "<ol><li><p>First</p></li><li><p>Second</p></li></ol><p>After list</p>",
    );
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
      preferredMetaPlacement: "row",
      textPreview: "Own reply",
    });
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
    expect(result.html).not.toContain('href="/message/123"');
    expect(result.html).not.toContain('href="/stream/10-general/topic/Bugs?msg=55"');
    expect(result.html).not.toContain('href="https://zulip.example/#narrow');
    expect(result.html).toContain("legacy");
    expect(result.html).toContain("old stream");
    expect(result.html).toContain("narrow");
  });
});
