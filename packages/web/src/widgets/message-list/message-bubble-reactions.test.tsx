import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMessageReactions } from "~/shared/api/messenger-messages";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import { MessageBubble } from "./message-bubble.ui";

vi.mock("~/shared/api/messenger-messages", () => ({
  fetchMessageReactions: vi.fn().mockResolvedValue([]),
}));

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    sender_id: 77,
    sender_full_name: "Alice",
    stream_uuid: "00000000-0000-4000-8000-000000000010",
    subject: "general",
    content: "<p>Hello</p>",
    timestamp: 1710000000,
    ...overrides,
  };
}

function findReactionButton(prefix: string): HTMLButtonElement {
  const reactionButton = screen
    .getAllByRole("button")
    .find((button) => button.getAttribute("aria-label")?.startsWith(prefix));
  if (reactionButton == null) {
    throw new Error("Reaction button was not found");
  }
  return reactionButton as HTMLButtonElement;
}

const CURRENT_USER_UUID = "44444444-4444-4444-8444-444444444444";

describe("MessageBubble quick reactions", () => {
  beforeEach(() => {
    vi.mocked(fetchMessageReactions).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders Flutter-parity quick reaction buttons in context menu", async () => {
    render(<MessageBubble message={createMessage()} />);

    fireEvent.contextMenu(screen.getByTestId(`message-${testMessageId(1)}`));

    expect(await screen.findByRole("button", { name: /like/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thumbs up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /joy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /surprised/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crying/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clap/i })).toBeInTheDocument();
  });

  it("sends selected quick reaction from extended row", async () => {
    const onAddReaction = vi.fn();
    render(
      <MessageBubble
        message={createMessage()}
        callbacks={{
          onAddReaction,
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId(`message-${testMessageId(1)}`));
    fireEvent.click(await screen.findByRole("button", { name: /clap/i }));

    await waitFor(() => {
      expect(onAddReaction).toHaveBeenCalledWith(testMessageId(1), {
        emojiName: "clap",
      });
    });
  });

  it("renders custom emoji image and removes with own reaction uuid resolved by API", async () => {
    vi.mocked(fetchMessageReactions).mockResolvedValueOnce([
      {
        uuid: "33333333-3333-4333-8333-333333333333",
        user_uuid: CURRENT_USER_UUID,
        message_uuid: testMessageId(1),
        emoji_name: "party_node",
      },
    ]);
    const onRemoveReaction = vi.fn();
    render(
      <MessageBubble
        currentUserId={CURRENT_USER_UUID}
        message={createMessage({
          reactions: { party_node: 1 },
        })}
        resolveCustomEmojiImageUrl={(emojiName) =>
          emojiName === "party_node" ? "https://cdn.example.com/party_node.png" : undefined
        }
        callbacks={{
          onRemoveReaction,
        }}
      />,
    );

    const customEmojiImage = await screen.findByAltText(":party_node:");
    expect(fetchMessageReactions).toHaveBeenCalledWith(testMessageId(1), {
      userUuid: CURRENT_USER_UUID,
      signal: expect.any(AbortSignal),
    });
    const reactionButton = customEmojiImage.closest("button");
    expect(reactionButton).not.toBeNull();
    if (reactionButton == null) {
      throw new Error("Expected reaction button for custom emoji");
    }
    await waitFor(() => {
      expect(reactionButton).toHaveClass("border-accent/40");
    });

    fireEvent.click(reactionButton);
    await waitFor(() => {
      expect(onRemoveReaction).toHaveBeenCalledWith(testMessageId(1), {
        emojiName: "party_node",
        imageUrl: "https://cdn.example.com/party_node.png",
      });
    });
  });

  it("shows open-in-chat action only when callback is provided", async () => {
    const onOpenInChat = vi.fn();
    render(
      <MessageBubble
        message={createMessage()}
        callbacks={{
          onOpenInChat,
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId(`message-${testMessageId(1)}`));
    fireEvent.click(await screen.findByText("Open in chat"));

    await waitFor(() => {
      expect(onOpenInChat).toHaveBeenCalledWith(expect.objectContaining({ id: testMessageId(1) }));
    });
  });

  it("does not load reaction details when the message has no reaction counters", () => {
    render(<MessageBubble currentUserId={CURRENT_USER_UUID} message={createMessage()} />);

    expect(fetchMessageReactions).not.toHaveBeenCalled();
  });

  it("shows aggregate reaction count in chip and tooltip", () => {
    render(
      <MessageBubble
        message={createMessage({
          reactions: { thumbs_up: 2 },
        })}
      />,
    );

    const reactionButton = findReactionButton("👍 ");
    expect(reactionButton).toHaveAttribute("title", "👍 2");
    expect(reactionButton.textContent).toBe("👍2");
  });

  it("hides reaction count on chip and title in 1:1 DM", () => {
    render(
      <MessageBubble
        message={createMessage({
          stream_uuid: null,
          subject: "",
          display_recipient: [
            { id: 77, full_name: "Alice" },
            { id: 88, full_name: "Bob" },
          ],
          reactions: { thumbs_up: 2 },
        })}
      />,
    );

    const btn = findReactionButton("👍 ");
    expect(btn.textContent).toBe("👍");
    expect(btn.getAttribute("title")).toBeNull();
    expect(btn.getAttribute("aria-label")).toBe("👍 2");
  });

  it("shows no chip count for one reaction and a count digit for multiple reactions", () => {
    const { rerender } = render(
      <MessageBubble
        message={createMessage({
          reactions: { thumbs_up: 1 },
        })}
      />,
    );

    let btn = findReactionButton("👍 ");
    expect(btn.textContent).toBe("👍");
    expect(btn.getAttribute("title")).toBe("👍 1");

    rerender(
      <MessageBubble
        message={createMessage({
          reactions: { thumbs_up: 3 },
        })}
      />,
    );
    btn = findReactionButton("👍 ");
    expect(btn.textContent).toBe("👍3");
    expect(btn.getAttribute("title")).toBe("👍 3");
  });

  it("keeps message metadata pinned to the bottom-right corner when reactions appear", () => {
    render(
      <MessageBubble
        message={createMessage({
          reactions: { thumbs_up: 1 },
        })}
      />,
    );

    const reactionButton = findReactionButton("👍 ");
    const reactionRow = reactionButton.parentElement;
    expect(reactionRow).toHaveClass("flex", "flex-1", "flex-wrap", "items-end", "justify-start");
    expect(reactionButton).toHaveClass("border", "border-border-subtle", "rounded-lg");

    const bubbleSurface = reactionRow?.parentElement?.parentElement?.parentElement;
    expect(bubbleSurface).toHaveClass("overflow-hidden", "rounded-[18px]");
    const metadata = Array.from(bubbleSurface?.querySelectorAll("div") ?? []).find(
      (node) =>
        node.classList.contains("flex") &&
        node.classList.contains("flex-shrink-0") &&
        node.classList.contains("items-center") &&
        node.classList.contains("gap-1") &&
        node.classList.contains("text-[11px]"),
    );
    expect(metadata).not.toBeNull();
  });

  it("keeps the delivery indicator in the same pinned metadata block for own messages", () => {
    render(
      <MessageBubble
        isOwn
        message={createMessage({
          id: "00000000-0000-4000-8000-000000000101",
          delivery_status: "sent",
          reactions: { thumbs_up: 1, party_popper: 1, tada: 1, clap: 1 },
        })}
      />,
    );

    const bubbleRoot = screen.getByTestId(`message-${testMessageId(101)}`);
    const bubbleSurface = Array.from(bubbleRoot.querySelectorAll("div")).find(
      (node) =>
        node.classList.contains("overflow-hidden") && node.classList.contains("rounded-[18px]"),
    );
    expect(bubbleSurface).toBeTruthy();

    const metadata = Array.from(bubbleSurface?.querySelectorAll("div") ?? []).find(
      (node) =>
        node.classList.contains("flex") &&
        node.classList.contains("flex-shrink-0") &&
        node.classList.contains("items-center") &&
        node.classList.contains("gap-1"),
    );
    expect(metadata).not.toBeNull();
    expect(
      metadata?.querySelector(`[data-testid="message-delivery-${testMessageId(101)}"]`),
    ).not.toBeNull();
  });
});
