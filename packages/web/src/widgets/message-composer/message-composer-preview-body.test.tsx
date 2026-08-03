import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectWorkspaceMessageFileReferences } from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { MessageComposerPreviewBody } from "./message-composer-preview-body.ui";

function renderWorkspacePreview(markdown: string) {
  const document = parseWorkspaceMessageBody(markdown);
  const rendered = renderWorkspaceMessageBody(document, {
    enableMarkdown: true,
    enableMentions: true,
    enableQuotes: true,
    enableEmojiShortcodes: true,
    enableCodeHighlight: true,
    enableCodeCopy: false,
    enableProtectedMedia: true,
    enableAttachments: true,
    enableGallery: false,
  });

  return {
    ...rendered,
    fileReferences: collectWorkspaceMessageFileReferences(document),
  };
}

describe("MessageComposerPreviewBody", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the shared Workspace body classes without composer-only preview classes", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const preview = renderWorkspacePreview(
      "Hello **workspace**\n\n<script>alert(1)</script>\n\n1. one\n2. two",
    );

    const { container } = render(
      <MessageComposerPreviewBody
        outgoingBodyTrim="preview"
        previewLoading={false}
        previewError={null}
        previewHtml={preview.html}
        previewMetadata={preview.metadata}
        fileReferences={preview.fileReferences}
      />,
    );

    const body = container.querySelector(".message-body");
    const strong = container.querySelector("strong");

    expect(body).not.toBeNull();
    expect(body).toHaveClass("workspace-message-body");
    expect(body?.className).not.toContain("bg-msg-own-bg");
    expect(body?.className).toContain("[&_ol]:list-decimal");
    expect(strong).toHaveTextContent("workspace");
    expect(container.querySelector("script")).toBeNull();
    expect(body?.textContent).toContain('"<script>alert(1)</script>"'.replace(/"/g, ""));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps rendered Workspace list and quote structure inside the shared body", () => {
    const preview = renderWorkspacePreview(
      [
        "Intro paragraph",
        "",
        "1. First item",
        "   - Nested A",
        "   - Nested B",
        "2. Second item",
        "",
        "> Outro quote",
      ].join("\n"),
    );

    const { container } = render(
      <MessageComposerPreviewBody
        outgoingBodyTrim="preview"
        previewLoading={false}
        previewError={null}
        previewHtml={preview.html}
        previewMetadata={preview.metadata}
        fileReferences={preview.fileReferences}
      />,
    );

    const body = container.querySelector(".message-body");
    expect(body).not.toBeNull();
    expect(body?.querySelector("ol")).not.toBeNull();
    expect(body?.querySelector("ul")).not.toBeNull();
    expect(body?.querySelector("ol li ul")).not.toBeNull();
    expect(body?.querySelector("blockquote.workspace-message-quote")).not.toBeNull();
    expect(body?.textContent).toContain("Intro paragraph");
    expect(body?.textContent).toContain("Outro quote");

    const className = body?.className ?? "";
    expect(className).toContain("[&_ol]:list-decimal");
    expect(className).toContain("[&_ul]:list-disc");
    expect(className).toContain("[&_li>p]:mb-0");
    expect(className).toContain("[&_p+ol]:mt-1");
    expect(className).toContain("[&_ol+p]:mt-1");
  });

  it("keeps shared GFM table and task markup after mounting the preview body", () => {
    const preview = renderWorkspacePreview(
      [
        "## Preview",
        "",
        "| Item | Result |",
        "|---|---|",
        "| Parser | Ready |",
        "",
        "- [x] checked",
        "",
        "~~old~~",
        "",
        "---",
      ].join("\n"),
    );

    const { container } = render(
      <MessageComposerPreviewBody
        outgoingBodyTrim="preview"
        previewLoading={false}
        previewError={null}
        previewHtml={preview.html}
        previewMetadata={preview.metadata}
        fileReferences={preview.fileReferences}
      />,
    );

    const body = container.querySelector(".workspace-message-body");
    expect(body?.querySelector("h2")).toHaveTextContent("Preview");
    expect(body?.querySelector(".workspace-message-table-scroll > table")).not.toBeNull();
    expect(body?.querySelector("del")).toHaveTextContent("old");
    expect(body?.querySelector("hr")).not.toBeNull();
    expect(body?.querySelector("ul.contains-task-list")).not.toBeNull();
    expect(body?.querySelector("li.task-list-item")).toHaveTextContent("checked");
    expect(body?.querySelector(".workspace-message-task-marker")).not.toBeNull();
    expect(body?.querySelector("input[type='checkbox']")).toBeNull();
  });

  it("keeps intentional multi-line spacing in the shared preview body", () => {
    const preview = renderWorkspacePreview(["Before", "", "", "", "", "After"].join("\n"));

    const { container } = render(
      <MessageComposerPreviewBody
        outgoingBodyTrim="preview"
        previewLoading={false}
        previewError={null}
        previewHtml={preview.html}
        previewMetadata={preview.metadata}
        fileReferences={preview.fileReferences}
      />,
    );

    const body = container.querySelector(".workspace-message-body");
    const gap = body?.querySelector(".workspace-message-gap--4");
    expect(gap).not.toBeNull();
    expect(gap).toHaveClass("workspace-message-gap");
    expect(gap).toHaveAttribute("aria-hidden", "true");
    expect(body?.querySelectorAll(".workspace-message-gap")).toHaveLength(1);
  });

  it("loads Workspace image URNs through the preview loader", async () => {
    const fileUuid = "11111111-1111-4111-8111-111111111111";
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:composer-workspace-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );
    const preview = renderWorkspacePreview(
      `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
    );

    try {
      const { container, unmount } = render(
        <MessageComposerPreviewBody
          outgoingBodyTrim="preview"
          previewLoading={false}
          previewError={null}
          previewHtml={preview.html}
          previewMetadata={preview.metadata}
          fileReferences={preview.fileReferences}
          onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
        />,
      );

      expect(onLoadWorkspaceFilePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "media",
          fileUuid,
          name: "screen.png",
          contentType: "image/png",
          mediaKind: "image",
        }),
        expect.any(AbortSignal),
      );
      await waitFor(() => {
        expect(createObjectURL).toHaveBeenCalledTimes(1);
      });
      const image = container.querySelector<HTMLImageElement>(
        "img[data-workspace-file-preview='true']",
      );
      expect(image).not.toBeNull();
      expect(image).toHaveAttribute("src", "blob:composer-workspace-preview");
      expect(container.innerHTML).not.toContain(`urn:image:${fileUuid}`);

      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:composer-workspace-preview");
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });
});
