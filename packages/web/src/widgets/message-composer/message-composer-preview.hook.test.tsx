import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMessageComposerPreview } from "./message-composer-preview.hook";

describe("useMessageComposerPreview", () => {
  it("renders Workspace markdown, spoilers, quotes, code, and UUID mentions locally", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const resolveMention = vi.fn((displayText: string) =>
      displayText === userUuid
        ? {
            userUuid,
            displayText: "Alice Reed",
          }
        : null,
    );

    const { result } = renderHook(() =>
      useMessageComposerPreview({
        mode: "preview",
        outgoingBody: [
          "**bold**",
          "",
          "- first",
          "- second",
          "",
          "> quoted line",
          "",
          "Inline `value` and ||secret||",
          "",
          "```ts",
          "const preview = 1;",
          "```",
          "",
          `Hello <@${userUuid}>`,
          "",
          "```spoiler Hidden",
          "payload",
          "```",
        ].join("\n"),
        resolveMention,
      }),
    );

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.metadata).not.toBeNull();
    expect(result.current.metadata).toMatchObject({
      contentKind: "block-rich",
      hasRichBlocks: true,
      hasMentions: true,
      hasCodeBlocks: true,
    });
    expect(resolveMention).toHaveBeenCalledWith(userUuid);
    expect(result.current.html).toContain("<strong>bold</strong>");
    expect(result.current.html).toContain("<ul><li><p>first</p></li><li><p>second</p></li></ul>");
    expect(result.current.html).toContain(
      '<blockquote class="workspace-message-quote"><p>quoted line</p></blockquote>',
    );
    expect(result.current.html).toContain("<code>value</code>");
    expect(result.current.html).toContain('data-inline-spoiler="true"');
    expect(result.current.html).toContain('<div class="spoiler-block">');
    expect(result.current.html).toContain(
      '<pre><code class="hljs language-ts">const preview = 1;</code></pre>',
    );
    expect(result.current.html).toContain(`data-workspace-user-uuid="${userUuid}"`);
    expect(result.current.html).toContain("@Alice Reed");
  });

  it("returns Workspace file references for local image URN preview", () => {
    const fileUuid = "22222222-2222-4222-8222-222222222222";

    const { result } = renderHook(() =>
      useMessageComposerPreview({
        mode: "preview",
        outgoingBody: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
      }),
    );

    expect(result.current.error).toBeNull();
    expect(result.current.fileReferences).toHaveLength(1);
    expect(result.current.fileReferences[0]).toMatchObject({
      kind: "media",
      href: `urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng`,
      fileUuid,
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image",
    });
  });
});
