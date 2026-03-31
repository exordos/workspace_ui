import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createUser } from "~/test/factories";
import { MessageBubble } from "./message-bubble.ui";

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 1,
    sender_id: 77,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: "<p>Hello</p>",
    timestamp: 1710000000,
    ...overrides,
  };
}

describe("MessageBubble quick reactions", () => {
  afterEach(() => {
    useUsersStore.getState().clear();
  });

  it("renders Flutter-parity quick reaction buttons in context menu", async () => {
    render(<MessageBubble message={createMessage()} />);

    fireEvent.contextMenu(screen.getByTestId("message-1"));

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

    fireEvent.contextMenu(screen.getByTestId("message-1"));
    fireEvent.click(await screen.findByRole("button", { name: /clap/i }));

    await waitFor(() => {
      expect(onAddReaction).toHaveBeenCalledWith(1, "clap");
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

    fireEvent.contextMenu(screen.getByTestId("message-1"));
    fireEvent.click(await screen.findByText("Open in chat"));

    await waitFor(() => {
      expect(onOpenInChat).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });
  });

  it("shows reaction author names in reaction tooltip", () => {
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 77,
        full_name: "Alice",
      }),
    );
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 88,
        full_name: "Bob",
      }),
    );

    render(
      <MessageBubble
        message={createMessage({
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 77,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 88,
            },
          ],
        })}
      />,
    );

    const reactionButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("title")?.startsWith("👍 "));
    expect(reactionButton).toBeDefined();
    expect(reactionButton).toHaveAttribute("title", expect.stringContaining("Alice"));
    expect(reactionButton).toHaveAttribute("title", expect.stringContaining("Bob"));
  });

  it("includes reaction author custom statuses in reaction tooltip", () => {
    useUsersStore.getState().mergeUser({
      user_id: 77,
      full_name: "Alice",
      status: { text: "Deep work", emojiName: "speech_balloon", away: false },
    });
    useUsersStore.getState().mergeUser({
      user_id: 88,
      full_name: "Bob",
      status: { text: "WFH", emojiName: "house", away: false },
    });

    render(
      <MessageBubble
        message={createMessage({
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 77,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 88,
            },
          ],
        })}
      />,
    );

    const reactionButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("title")?.startsWith("👍 "));
    expect(reactionButton).toBeDefined();
    expect(reactionButton).toHaveAttribute("title", expect.stringContaining("Deep work"));
    expect(reactionButton).toHaveAttribute("title", expect.stringContaining("WFH"));
  });

  it("renders reactions on the same bottom row as message time without border outline", () => {
    render(
      <MessageBubble
        message={createMessage({
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 77,
            },
          ],
        })}
      />,
    );

    const reactionButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("title")?.startsWith("👍 "));
    expect(reactionButton).toBeDefined();
    if (!reactionButton) {
      throw new Error("Reaction button was not found");
    }

    const reactionRow = reactionButton.parentElement;
    expect(reactionRow).toHaveClass("absolute", "bottom-2", "left-2", "right-14", "items-end");
    expect(reactionRow).not.toHaveClass("mt-1.5");

    expect(reactionButton).toHaveClass("border-0");
    expect(reactionButton).not.toHaveClass("border");

    const bubbleSurface = reactionRow?.parentElement;
    expect(bubbleSurface?.querySelector(".absolute.bottom-2.right-2")).not.toBeNull();
  });
});
