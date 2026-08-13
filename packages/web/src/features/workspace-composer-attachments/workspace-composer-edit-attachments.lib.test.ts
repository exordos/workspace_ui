import { describe, expect, it } from "vitest";
import {
  appendWorkspaceComposerExistingAttachmentMarkdown,
  extractWorkspaceComposerEditContent,
} from "./workspace-composer-edit-attachments.lib";

const IMAGE_UUID = "11111111-1111-4111-8111-111111111111";
const FILE_UUID = "22222222-2222-4222-8222-222222222222";

describe("Workspace composer edit attachments", () => {
  it("moves Workspace file references out of editable text and preserves their Markdown", () => {
    const image = `![screen.png](urn:image:${IMAGE_UUID}?name=screen.png&content_type=image%2Fpng&size=8)`;
    const file = `[report.pdf](urn:file:${FILE_UUID}?name=report.pdf&size=12)`;

    const result = extractWorkspaceComposerEditContent(`Before\n\n${image}\n${file}`);

    expect(result.markdown).toBe("Before");
    expect(result.attachments).toEqual([
      expect.objectContaining({
        markdown: image,
        reference: expect.objectContaining({
          kind: "media",
          mediaKind: "image",
          fileUuid: IMAGE_UUID,
          name: "screen.png",
          sizeBytes: 8,
        }),
      }),
      expect.objectContaining({
        markdown: file,
        reference: expect.objectContaining({
          kind: "attachment",
          fileUuid: FILE_UUID,
          name: "report.pdf",
          sizeBytes: 12,
        }),
      }),
    ]);
    expect(
      appendWorkspaceComposerExistingAttachmentMarkdown(result.markdown, result.attachments),
    ).toBe(`Before\n${image}\n${file}`);
  });

  it("preserves the exact Markdown before the canonical attachment tail", () => {
    const image = `![screen.png](urn:image:${IMAGE_UUID}?name=screen.png)`;
    const body = [`Use \`${image}\`  `, "", "", "```md", "line  ", "", "", image, "```"].join("\n");
    const markdown = `${body}\n${image}`;

    const result = extractWorkspaceComposerEditContent(markdown);

    expect(result.attachments).toHaveLength(1);
    expect(result.markdown).toBe(body);
  });

  it("keeps ordinary external images in editable text", () => {
    const markdown = "![public](https://example.com/public.png)";
    expect(extractWorkspaceComposerEditContent(markdown)).toEqual({
      markdown,
      attachments: [],
    });
  });

  it("does not change messages without a canonical attachment tail", () => {
    const file = `[report](urn:file:${FILE_UUID})`;
    const inline = `Text ${file} remains inline.  \n\n\nEnd`;
    expect(extractWorkspaceComposerEditContent(inline)).toEqual({
      markdown: inline,
      attachments: [],
    });
  });

  it("leaves structurally embedded Workspace files in place", () => {
    const file = `[report](urn:file:${FILE_UUID})`;
    const markdown = [`- ${file}`, "", `> ${file}`, "", `| file |`, `| --- |`, `| ${file} |`].join(
      "\n",
    );

    expect(extractWorkspaceComposerEditContent(markdown)).toEqual({
      markdown,
      attachments: [],
    });
  });

  it("extracts standalone file links accepted by the shared Markdown lexer", () => {
    const angleLink = `[angle](<urn:file:${FILE_UUID}>)`;
    const titledImage = `![image](urn:image:${IMAGE_UUID} "preview")`;

    const result = extractWorkspaceComposerEditContent(`Body\n${angleLink}\n${titledImage}`);

    expect(result.markdown).toBe("Body");
    expect(result.attachments.map((attachment) => attachment.markdown)).toEqual([
      angleLink,
      titledImage,
    ]);
  });
});
