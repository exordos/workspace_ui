import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageComposerPreviewBody } from "./message-composer-preview-body.ui";

vi.mock("~/shared/api/zulip-client.internal", () => ({
  getRealmBaseUrl: () => "https://zulip.example.com",
}));

vi.mock("~/shared/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      USER_UPLOADS_PATH_PREFIX: "",
    },
  };
});

vi.mock("~/shared/lib/auth-guard", () => ({
  buildAuthHeader: () => ({ Authorization: "Basic test" }),
}));

describe("MessageComposerPreviewBody", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps protected preview media on placeholder/data-auth attrs only", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const { container } = render(
      <MessageComposerPreviewBody
        outgoingBodyTrim="preview"
        previewLoading={false}
        previewError={null}
        previewHtml={
          '<picture><source srcset="/external_content/a.webp 1x, /external_content/b.webp 2x" sizes="100vw"><img style="background-image:url(/external_content/bg.png)" alt="preview"></picture>'
        }
      />,
    );

    const image = container.querySelector("img");
    const source = container.querySelector("source");

    expect(image).not.toBeNull();
    expect(source).not.toBeNull();
    expect(image?.getAttribute("src")).toBeTruthy();
    expect(image?.getAttribute("src")).not.toContain("/external_content/");
    expect(image?.getAttribute("data-auth-src")).toContain("/external_content/b.webp");
    expect(image?.hasAttribute("srcset")).toBe(false);
    expect(image?.hasAttribute("sizes")).toBe(false);
    expect(image?.hasAttribute("style")).toBe(false);
    expect(source?.hasAttribute("srcset")).toBe(false);
    expect(source?.hasAttribute("sizes")).toBe(false);
  });

  it("loads Zulip embed background previews through authenticated fetch without keeping the raw style", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const value = String(input);
      if (
        value === "/external_content/hash/preview.jpeg" ||
        value === "https://zulip.example.com/external_content/hash/preview.jpeg"
      ) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["ok"])),
        });
      }
      return Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-composer-embed");

    const { container } = render(
      <MessageComposerPreviewBody
        outgoingBodyTrim="preview"
        previewLoading={false}
        previewError={null}
        previewHtml={
          '<div class="message_embed"><a class="message_embed_image" href="https://habr.com/ru/articles/1024154/" style="background-image:url(&quot;/external_content/hash/preview.jpeg&quot;)"></a></div>'
        }
      />,
    );

    const embedImage = container.querySelector<HTMLElement>(".message_embed_image");
    expect(embedImage).not.toBeNull();
    expect(embedImage?.getAttribute("style")).toBeNull();
    expect(embedImage?.getAttribute("data-auth-background-image")).toBe(
      "/external_content/hash/preview.jpeg",
    );

    await waitFor(() => {
      expect(embedImage?.style.backgroundImage).toContain("blob:test-composer-embed");
    });
    expect(embedImage?.style.backgroundImage).not.toContain("/external_content/");
  });
});
