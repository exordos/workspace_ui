import { describe, expect, it } from "vitest";
import { parseWorkspaceMessageBody } from "./workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "./workspace-message-render.lib";
import {
  summarizeWorkspaceMessageBody,
  summarizeWorkspaceMessageMarkdown,
} from "./workspace-message-summary.lib";

describe("workspace message summary core", () => {
  it("returns text preview separately from render html", () => {
    const document = parseWorkspaceMessageBody("Hello\nworkspace");
    const rendered = renderWorkspaceMessageBody(document);
    const summary = summarizeWorkspaceMessageBody(document);

    expect(rendered.html).toBe("<p>Hello<br>workspace</p>");
    expect(summary).toEqual({
      text: "Hello workspace",
      leadingKind: "text",
    });
  });

  it("keeps the legacy block projection stable when the rich renderer is invoked", () => {
    const document = parseWorkspaceMessageBody(
      ["Intro **bold**", "", "- first", "- second", "", "> quoted"].join("\n"),
    );
    const blocksBeforeRender = structuredClone(document.blocks);

    renderWorkspaceMessageBody(document);

    expect(document.blocks).toEqual(blocksBeforeRender);
    expect(summarizeWorkspaceMessageBody(document)).toEqual({
      text: "Intro bold • first • second",
      leadingKind: "text",
    });
    expect(document.safeTextPreview).toBe("Intro bold • first • second");
  });

  it("summarizes markdown through the shared compact helper", () => {
    const imageUuid = "11111111-1111-4111-8111-111111111111";
    const summary = summarizeWorkspaceMessageMarkdown(
      `![screen.png](urn:image:${imageUuid}?name=screen.png) Привет @**Alice**`,
    );

    expect(summary).toEqual({
      text: "Изображение: Привет @Alice",
      leadingKind: "image",
    });
    expect(summary.text).not.toContain("urn:image:");
  });

  it("keeps html-like input as text preview", () => {
    const document = parseWorkspaceMessageBody("<script>alert(1)</script>");
    const summary = summarizeWorkspaceMessageBody(document);

    expect(summary.text).toBe("<script>alert(1)</script>");
    expect(summary.text).not.toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("truncates preview by summary maxLength", () => {
    const document = parseWorkspaceMessageBody("one two three four");
    const summary = summarizeWorkspaceMessageBody(document, {
      maxLength: 11,
      includeMediaLabel: true,
      includeAttachmentLabel: true,
      includeQuotePrefix: true,
    });

    expect(summary.text).toBe("one two...");
    expect(summary.leadingKind).toBe("text");
  });

  it("compacts unordered and ordered lists into readable text", () => {
    const unordered = summarizeWorkspaceMessageBody(parseWorkspaceMessageBody("- one\n- two"));
    const ordered = summarizeWorkspaceMessageBody(parseWorkspaceMessageBody("3. alpha\n4. beta"));

    expect(unordered).toEqual({
      text: "• one • two",
      leadingKind: "text",
    });
    expect(ordered).toEqual({
      text: "3. alpha 4. beta",
      leadingKind: "text",
    });
  });

  it("summarizes blockquotes and fenced code blocks", () => {
    const quote = summarizeWorkspaceMessageBody(parseWorkspaceMessageBody("> quoted **text**"));
    const code = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody(["```ts", "const value = 1;", "```"].join("\n")),
    );

    expect(quote).toEqual({
      text: "Цитата: quoted text",
      leadingKind: "quote",
    });
    expect(code).toEqual({
      text: "Код: const value = 1;",
      leadingKind: "code",
    });
  });

  it("skips quoted payload when a reply has its own text", () => {
    const document = parseWorkspaceMessageBody(
      [
        "> Alice: very long quoted text that should not own the compact preview",
        "> another quoted line",
        "",
        "Отвечаю коротко",
      ].join("\n"),
    );
    const summary = summarizeWorkspaceMessageBody(document);

    expect(summary).toEqual({
      text: "Отвечаю коротко",
      leadingKind: "text",
    });
    expect(document.safeTextPreview).toBe("Отвечаю коротко");
    expect(document.metadata.textPreview).toBe("Отвечаю коротко");
  });

  it("keeps a quote prefix for quote-only messages without duplicating nested quote labels", () => {
    const summary = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody(["> Alice: outer", ">", "> > Bob: nested"].join("\n")),
    );

    expect(summary).toEqual({
      text: "Цитата: Alice: outer Bob: nested",
      leadingKind: "quote",
    });
    expect(summary.text).not.toContain("Цитата: Цитата:");
  });

  it("summarizes quote references without leaking their payload", () => {
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const selectedText = "чужой длинный текст";
    const quoteOnly = parseWorkspaceMessageBody(
      `[Sleep](urn:quote:${messageUuid}?text=${encodeURIComponent(selectedText)})`,
    );
    const withReply = parseWorkspaceMessageBody(
      [
        `[Sleep](urn:quote:${messageUuid}?text=${encodeURIComponent(selectedText)})`,
        "",
        "Собственный ответ",
      ].join("\n"),
    );

    expect(summarizeWorkspaceMessageBody(quoteOnly)).toEqual({
      text: "Цитата",
      leadingKind: "quote",
    });
    expect(quoteOnly.safeTextPreview).toBe("Цитата");
    expect(summarizeWorkspaceMessageBody(withReply)).toEqual({
      text: "Собственный ответ",
      leadingKind: "text",
    });
    expect(withReply.safeTextPreview).toBe("Собственный ответ");
  });

  it("uses readable link labels instead of cluttering preview with urls", () => {
    const summary = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody(
        "Read [release notes](https://example.com/releases/2026/very/long/url)",
      ),
    );

    expect(summary).toEqual({
      text: "Read release notes",
      leadingKind: "text",
    });
  });

  it("summarizes resolved and unresolved mentions as readable names", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const resolved = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody("Привет @**Alice Reed**", {
        resolveMention: (displayText) =>
          displayText === "Alice Reed"
            ? {
                userUuid,
                displayText: "Alice Reed",
              }
            : null,
      }),
    );
    const resolvedByUuid = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody(`Привет <@${userUuid}>`, {
        resolveMention: (displayText) =>
          displayText === userUuid
            ? {
                userUuid,
                displayText: "Alice Reed",
              }
            : null,
      }),
    );
    const unresolved = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody("Привет @**Unknown User**", {
        resolveMention: () => null,
      }),
    );

    expect(resolved).toEqual({
      text: "Привет @Alice Reed",
      leadingKind: "text",
    });
    expect(resolvedByUuid).toEqual({
      text: "Привет @Alice Reed",
      leadingKind: "text",
    });
    expect(unresolved).toEqual({
      text: "Привет @Unknown User",
      leadingKind: "text",
    });
  });

  it("converts known unicode emoji shortcodes and keeps unknown/custom shortcodes readable", () => {
    const summary = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody("Привет :smile: :party_parrot: :definitely_unknown_shortcode:"),
    );

    expect(summary).toEqual({
      text: "Привет 😄 :party_parrot: :definitely_unknown_shortcode:",
      leadingKind: "text",
    });
  });

  it("does not expose raw URN image or file urls in preview", () => {
    const imageUuid = "11111111-1111-4111-8111-111111111111";
    const fileUuid = "22222222-2222-4222-8222-222222222222";
    const image = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody(`![screen.png](urn:image:${imageUuid}?name=screen.png) Вот скрин`),
    );
    const file = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody(`[report.pdf](urn:file:${fileUuid}?name=report.pdf)`),
    );

    expect(image).toEqual({
      text: "Изображение: Вот скрин",
      leadingKind: "image",
    });
    expect(file).toEqual({
      text: "Файл: report.pdf",
      leadingKind: "file",
    });
    expect(image.text).not.toContain("urn:image:");
    expect(file.text).not.toContain("urn:file:");
  });

  it("does not treat old Workspace download urls as file references", () => {
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const oldDownloadUrl = `/api/workspace/v1/messenger/files/${fileUuid}/actions/download`;
    const summary = summarizeWorkspaceMessageBody(
      parseWorkspaceMessageBody(`[legacy.png](${oldDownloadUrl})`),
    );

    expect(summary).toEqual({
      text: "legacy.png",
      leadingKind: "link",
    });
  });

  it("summarizes single Workspace image, image caption, video, and attachment labels", () => {
    const imageUuid = "11111111-1111-4111-8111-111111111111";
    const videoUuid = "22222222-2222-4222-8222-222222222222";
    const fileUuid = "33333333-3333-4333-8333-333333333333";

    expect(
      summarizeWorkspaceMessageBody(
        parseWorkspaceMessageBody(`![screen.png](urn:image:${imageUuid}?name=screen.png)`),
      ),
    ).toEqual({
      text: "Изображение",
      leadingKind: "image",
    });
    expect(
      summarizeWorkspaceMessageBody(
        parseWorkspaceMessageBody(`![screen.png](urn:image:${imageUuid}?name=screen.png) подпись`),
      ),
    ).toEqual({
      text: "Изображение: подпись",
      leadingKind: "image",
    });
    expect(
      summarizeWorkspaceMessageBody(
        parseWorkspaceMessageBody(
          `[clip.mp4](urn:video:${videoUuid}?name=clip.mp4&content_type=video%2Fmp4)`,
        ),
      ),
    ).toEqual({
      text: "Видео",
      leadingKind: "video",
    });
    expect(
      summarizeWorkspaceMessageBody(
        parseWorkspaceMessageBody(`[report.pdf](urn:file:${fileUuid}?name=report.pdf)`),
      ),
    ).toEqual({
      text: "Файл: report.pdf",
      leadingKind: "file",
    });
  });

  it("keeps legacy blocks and compact summaries independent from intentional gap size", () => {
    const oneEmptyLine = parseWorkspaceMessageBody(["Before", "", "After"].join("\n"));
    const manyEmptyLines = parseWorkspaceMessageBody(
      ["Before", "", "", "", "", "", "", "", "After"].join("\n"),
    );

    expect(manyEmptyLines.blocks).toEqual(oneEmptyLine.blocks);
    expect(manyEmptyLines.safeTextPreview).toBe(oneEmptyLine.safeTextPreview);
    expect(summarizeWorkspaceMessageBody(manyEmptyLines)).toEqual(
      summarizeWorkspaceMessageBody(oneEmptyLine),
    );
  });
});
