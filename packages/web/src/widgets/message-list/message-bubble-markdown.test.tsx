import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCallParticipantsStore } from "~/entities/call/call.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createUser } from "~/test/factories";
import { MessageBubble } from "./message-bubble.ui";

const buildAuthHeaderMock = vi.fn(() => ({}));

vi.mock("~/shared/lib/auth-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/auth-guard")>();
  return {
    ...actual,
    buildAuthHeader: () => buildAuthHeaderMock(),
  };
});

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
    buildAuthHeaderMock.mockReset();
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
});
