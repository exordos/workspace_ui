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

  it("reaction tooltip lists author names without custom status", () => {
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
    const title = reactionButton?.getAttribute("title") ?? "";
    expect(title).toContain("Alice");
    expect(title).toContain("Bob");
    expect(title).not.toContain("Deep work");
    expect(title).not.toContain("WFH");
    expect(title).not.toContain("💬");
    expect(title).not.toContain("🏠");
  });

  it("hides reaction nicknames and count on chip in 1:1 DM", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 77, full_name: "Alice" }));
    useUsersStore.getState().mergeUser(createUser({ user_id: 88, full_name: "Bob" }));

    render(
      <MessageBubble
        message={createMessage({
          stream_id: null,
          subject: "",
          display_recipient: [
            { id: 77, full_name: "Alice" },
            { id: 88, full_name: "Bob" },
          ],
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

    const btn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-label")?.startsWith("👍 "));
    expect(btn?.textContent).toBe("👍");
    expect(btn?.getAttribute("title")).toBeNull();
    expect(btn?.getAttribute("aria-label")).toContain("Alice");
    expect(btn?.getAttribute("aria-label")).toContain("Bob");
  });

  it("shows author nicknames on chip for up to 3 reactors, count digit for 4+", () => {
    useUsersStore.getState().mergeUser(createUser({ user_id: 1, full_name: "Ann" }));
    useUsersStore.getState().mergeUser(createUser({ user_id: 2, full_name: "Bob" }));
    useUsersStore.getState().mergeUser(createUser({ user_id: 3, full_name: "Cara" }));
    useUsersStore.getState().mergeUser(createUser({ user_id: 4, full_name: "Dan" }));

    const { rerender } = render(
      <MessageBubble
        message={createMessage({
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 1,
            },
          ],
        })}
      />,
    );

    let btn = screen.getAllByRole("button").find((b) => b.getAttribute("title")?.startsWith("👍 "));
    expect(btn?.textContent).toContain("Ann");
    expect(btn?.textContent).not.toMatch(/^👍\s*1$/);

    rerender(
      <MessageBubble
        message={createMessage({
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 1,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 2,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 3,
            },
          ],
        })}
      />,
    );
    btn = screen.getAllByRole("button").find((b) => b.getAttribute("title")?.startsWith("👍 "));
    expect(btn?.textContent).toContain("Ann");
    expect(btn?.textContent).toContain("Bob");
    expect(btn?.textContent).toContain("Cara");
    expect(btn?.textContent?.endsWith("3")).toBe(false);

    rerender(
      <MessageBubble
        message={createMessage({
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 1,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 2,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 3,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 4,
            },
          ],
        })}
      />,
    );
    btn = screen.getAllByRole("button").find((b) => b.getAttribute("title")?.startsWith("👍 "));
    expect(btn?.textContent).toBe("👍4");
    expect(btn?.getAttribute("title")).toContain("Ann");
    expect(btn?.getAttribute("title")).toContain("Dan");
  });

  it("renders reactions on the same bottom row as message time in bordered chips", () => {
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

    expect(reactionButton).toHaveClass("border", "border-border-subtle", "rounded-lg");

    const bubbleSurface = reactionRow?.parentElement;
    expect(bubbleSurface?.querySelector(".absolute.bottom-2.right-2")).not.toBeNull();
  });
});
