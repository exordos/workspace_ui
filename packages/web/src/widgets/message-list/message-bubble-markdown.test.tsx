import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCallParticipantsStore } from "~/entities/call/call.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createUser } from "~/test/factories";
import { MessageBubble } from "./message-bubble.ui";
import { buildMessageMediaGallery } from "./message-list-media.lib";

const buildAuthHeaderMock = vi.fn(() => ({}));
const writeTextMock = vi.fn<(value: string) => Promise<boolean>>(() => Promise.resolve(true));

vi.mock("~/shared/lib/auth-guard", () => ({
  buildAuthHeader: () => buildAuthHeaderMock(),
}));

vi.mock("~/shared/lib/clipboard", () => ({
  writeText: (value: string) => writeTextMock(value),
}));

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 201,
    sender_id: 77,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: "plain",
    timestamp: 1710000000,
    ...overrides,
  };
}

describe("MessageBubble markdown body", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    useUsersStore.getState().clear();
    useCallParticipantsStore.setState({ participantsByUrl: {} });
    useMediaViewerStore.getState().close();
    buildAuthHeaderMock.mockReset();
    writeTextMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders Markdown emphasis as HTML in the bubble body", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const { container } = render(
      <MessageBubble message={createMessage({ content: "**Hello**" })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body).toBeTruthy();
    expect(body?.innerHTML).toContain("<strong>Hello</strong>");
  });

  it("still renders pre-rendered HTML bodies", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const { container } = render(
      <MessageBubble message={createMessage({ content: "<p><em>Hi</em></p>" })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body?.innerHTML).toContain("<em>Hi</em>");
  });

  it("styles pre blocks to wrap long unbroken text inside the bubble", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const longToken = `https://example.com/${"segment".repeat(24)}`;
    const { container } = render(
      <MessageBubble
        message={createMessage({ content: `<pre>${longToken}</pre>` })}
        isOwn={false}
      />,
    );

    const body = container.querySelector(".message-body");
    expect(body?.className).toContain("[&_pre]:whitespace-pre-wrap");
    expect(body?.className).toContain("[&_pre]:[overflow-wrap:anywhere]");
    expect(body?.className).toContain("min-w-0");
    expect(body?.querySelector("pre")?.textContent).toBe(longToken);
  });

  it("adds syntax-highlight classes to fenced code blocks in bubble markdown", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const markdown = "```javascript\nconst value = 1;\n```";
    const { container } = render(
      <MessageBubble message={createMessage({ content: markdown })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    const highlightedCode = body?.querySelector("code.hljs");
    expect(highlightedCode).toBeTruthy();
    expect(highlightedCode?.querySelector(".hljs-keyword")).toBeTruthy();
  });

  it("renders copy-code button for fenced code blocks and copies source text", async () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const markdown = "```javascript\nconst value = 1;\n```";
    const { container } = render(
      <MessageBubble message={createMessage({ content: markdown })} isOwn={false} />,
    );

    const copyButton = container.querySelector<HTMLButtonElement>('[data-code-copy-button="true"]');
    expect(copyButton).toBeTruthy();

    fireEvent.click(copyButton as HTMLButtonElement);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("const value = 1;"));
  });

  it("renders ordered and nested unordered lists with surrounding paragraphs", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const markdown = [
      "Intro paragraph",
      "",
      "1. First item",
      "   - Nested A",
      "   - Nested B",
      "2. Second item",
      "",
      "Outro paragraph",
    ].join("\n");

    const { container } = render(
      <MessageBubble message={createMessage({ content: markdown })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body).toBeTruthy();
    expect(body?.querySelector("ol")).toBeTruthy();
    expect(body?.querySelector("ul")).toBeTruthy();
    expect(body?.querySelector("ol li ul")).toBeTruthy();
    expect(body?.textContent).toContain("Intro paragraph");
    expect(body?.textContent).toContain("Outro paragraph");

    const className = body?.className ?? "";
    expect(className).toContain("[&_ol]:list-decimal");
    expect(className).toContain("[&_ul]:list-disc");
    expect(className).toContain("[&_li>p]:mb-0");
    expect(className).toContain("[&_p+ol]:mt-1");
    expect(className).toContain("[&_ol+p]:mt-1");
  });

  it("renders custom shortcode emoji as inline image with alt/title", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const { container } = render(
      <MessageBubble
        message={createMessage({ content: "Hi :party_parrot:" })}
        isOwn={false}
        resolveCustomEmojiShortcodeImageUrl={(shortcode) =>
          shortcode === "party_parrot" ? "https://cdn.example.com/parrot.png" : undefined
        }
      />,
    );

    const emojiImage = container.querySelector("img.message-inline-emoji");
    expect(emojiImage).toBeTruthy();
    expect(emojiImage).toHaveAttribute("src", "https://cdn.example.com/parrot.png");
    expect(emojiImage).toHaveAttribute("alt", ":party_parrot:");
    expect(emojiImage).toHaveAttribute("title", ":party_parrot:");
  });

  it("opens media viewer when clicking inline video", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));
    const mediaViewerOpenSpy = vi.spyOn(useMediaViewerStore.getState(), "open");
    const content =
      '<video controls><source src="/user_uploads/1/private.mp4" type="video/mp4" /></video>';
    const gallery = buildMessageMediaGallery([createMessage({ content })]);

    const { container } = render(
      <MessageBubble message={createMessage({ content })} isOwn={false} mediaGallery={gallery} />,
    );

    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    fireEvent.click(video as HTMLVideoElement);

    expect(mediaViewerOpenSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: "video" })]),
      0,
    );
    mediaViewerOpenSpy.mockRestore();
  });

  it("does not open media viewer when clicking inline custom emoji", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));
    const mediaViewerOpenSpy = vi.spyOn(useMediaViewerStore.getState(), "open");

    const { container } = render(
      <MessageBubble
        message={createMessage({ content: "Hi :party_parrot:" })}
        isOwn={false}
        resolveCustomEmojiShortcodeImageUrl={(shortcode) =>
          shortcode === "party_parrot" ? "https://cdn.example.com/parrot.png" : undefined
        }
      />,
    );

    const emojiImage = container.querySelector("img.message-inline-emoji");
    expect(emojiImage).toBeTruthy();
    fireEvent.click(emojiImage as HTMLImageElement);
    expect(mediaViewerOpenSpy).not.toHaveBeenCalled();
  });

  it("renders markdown strikethrough as del tag in bubble body", () => {
    // Regression: sanitize path used to strip `<del>`, losing strikethrough in the bubble.
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const { container } = render(
      <MessageBubble message={createMessage({ content: "~~obsolete~~" })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body).toBeTruthy();
    expect(body?.innerHTML).toContain("<del>obsolete</del>");
  });

  it("toggles inline spoiler open class on click", () => {
    // User behavior: repeated click toggles the same inline spoiler.
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const { container } = render(
      <MessageBubble
        message={createMessage({ content: "Before ||secret|| after" })}
        isOwn={false}
      />,
    );

    const spoiler = container.querySelector(".inline-spoiler");
    expect(spoiler).toBeTruthy();
    expect(spoiler?.classList.contains("open")).toBe(false);

    fireEvent.click(spoiler as HTMLElement);
    expect(spoiler?.classList.contains("open")).toBe(true);

    fireEvent.click(spoiler as HTMLElement);
    expect(spoiler?.classList.contains("open")).toBe(false);
  });

  it("renders zulip spoiler block as accordion with visible header", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const zulipSpoilerHtml = [
      '<div class="spoiler-block">',
      '<div class="spoiler-header">Server Header</div>',
      '<div class="spoiler-content"><p>Server Hidden</p></div>',
      "</div>",
    ].join("");

    const { container } = render(
      <MessageBubble message={createMessage({ content: zulipSpoilerHtml })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body?.textContent).toContain("Server Hidden");
    expect(body?.textContent).toContain("Server Header");

    const spoilerBlock = container.querySelector(".spoiler-block");
    const spoilerHeader = container.querySelector(".spoiler-header");
    expect(spoilerBlock).toBeTruthy();
    expect(spoilerHeader).toBeTruthy();
    expect(spoilerBlock?.classList.contains("open")).toBe(false);

    fireEvent.click(spoilerHeader as HTMLElement);
    expect(spoilerBlock?.classList.contains("open")).toBe(true);

    fireEvent.click(spoilerHeader as HTMLElement);
    expect(spoilerBlock?.classList.contains("open")).toBe(false);
  });

  it("renders zulip markdown fenced spoiler with header and toggles by header click", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const markdown = "```spoiler Hidden Header\nосновной текст спойлера\n```";
    const { container } = render(
      <MessageBubble message={createMessage({ content: markdown })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body?.textContent).toContain("основной текст спойлера");
    expect(body?.textContent).toContain("Hidden Header");

    const spoilerBlock = container.querySelector(".spoiler-block");
    const spoilerHeader = container.querySelector(".spoiler-header");
    expect(spoilerBlock).toBeTruthy();
    expect(spoilerHeader?.textContent).toContain("Hidden Header");
    expect(spoilerBlock?.classList.contains("open")).toBe(false);

    fireEvent.click(spoilerHeader as HTMLElement);
    expect(spoilerBlock?.classList.contains("open")).toBe(true);
  });

  it("renders Zulip reply quote as nested quote block instead of code fence", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const markdown =
      "@_**Alice|77** [wrote](https://zulip.example.com/#narrow/dm/near/1):\n```quote\nQuoted text\n```\n\nMy reply";
    const { container } = render(
      <MessageBubble message={createMessage({ content: markdown })} isOwn={false} />,
    );

    const body = container.querySelector(".message-body");
    expect(body?.querySelector(".zulip-quote-block")).toBeTruthy();
    expect(body?.querySelector(".zulip-quote-header")).toBeTruthy();
    expect(body?.querySelector(".zulip-quote-body")).toBeTruthy();
    expect(body?.textContent).toContain("Quoted text");
    expect(body?.textContent).toContain("My reply");
    expect(body?.innerHTML).not.toContain("language-quote");
  });

  it("renders user_upload image inside server-rendered quote block instead of URL text", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const uploadPath = "/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png";
    const uploadUrl = `https://sys.example.com${uploadPath}`;
    const zulipHtml = [
      '<p><span class="user-mention" data-user-id="77">@Alice</span>',
      ' <a href="https://zulip.example.com/near/1">wrote</a>:</p>',
      `<blockquote><p><a href="${uploadPath}">${uploadUrl}</a></p></blockquote>`,
      '<div class="message_inline_image">',
      `<a href="${uploadPath}">`,
      `<img src="/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp" alt="image.png">`,
      "</a></div>",
      "<p>My reply</p>",
    ].join("");

    const { container } = render(
      <MessageBubble message={createMessage({ content: zulipHtml })} isOwn={false} />,
    );

    const quoteBody = container.querySelector(".zulip-quote-body");
    expect(quoteBody).toBeTruthy();
    expect(quoteBody?.querySelector("img.message-media-preview")).toBeTruthy();
    expect(quoteBody?.textContent).not.toContain(uploadUrl);
    expect(container.querySelectorAll(".message-body img")).toHaveLength(1);
  });

  it("uses default header for fenced spoiler without explicit heading", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));

    const markdown = "```spoiler\nосновной текст спойлера\n```";
    const { container } = render(
      <MessageBubble message={createMessage({ content: markdown })} isOwn={false} />,
    );

    const spoilerHeader = container.querySelector(".spoiler-header");
    expect(spoilerHeader).toBeTruthy();
    expect(spoilerHeader?.textContent).toContain("Spoiler");
  });
});
