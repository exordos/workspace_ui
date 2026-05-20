import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageLinkPreview } from "./message-link-preview.ui";

const useProtectedMessageHtmlMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/protected-message-media.hook", () => ({
  useProtectedMessageHtml: (...args: unknown[]) => useProtectedMessageHtmlMock(...args),
}));

describe("MessageLinkPreview", () => {
  it("renders loading skeleton", () => {
    render(
      <MessageLinkPreview
        previewUrl="https://example.com"
        previewData={undefined}
        status="loading"
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders preview card when ready", () => {
    render(
      <MessageLinkPreview
        previewUrl="https://example.com"
        previewData={{
          targetUrl: "https://example.com",
          title: "Example",
          description: "Desc",
        }}
        status="ready"
      />,
    );
    expect(screen.getByRole("link", { name: "Example" })).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
  });

  it("uses sized thumbnail host and full-bleed embed anchor markup", () => {
    useProtectedMessageHtmlMock.mockClear();

    const { container } = render(
      <MessageLinkPreview
        previewUrl="https://example.com"
        previewData={{
          targetUrl: "https://example.com",
          title: "Example",
          thumbnailPath: "/external_content/abc/preview.jpeg",
        }}
        status="ready"
      />,
    );

    const host = container.querySelector(".message-link-preview-thumbnail");
    expect(host).not.toBeNull();
    expect(host?.classList.contains("message_embed_image")).toBe(false);

    const injectedHtml = useProtectedMessageHtmlMock.mock.calls[0]?.[1] as string;
    expect(injectedHtml).toContain("message_embed_image");
    expect(injectedHtml).toContain("size-full");
    expect(injectedHtml).toContain("/external_content/abc/preview.jpeg");
  });

  it("renders nothing when unavailable", () => {
    const { container } = render(
      <MessageLinkPreview
        previewUrl="https://example.com"
        previewData={null}
        status="unavailable"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
