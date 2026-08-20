import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedMessengerQuoteMessage } from "~/entities/messenger/messenger-quote-resolver.hook";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import { WorkspaceMessageQuote } from "./workspace-message-quote.ui";

const mocked = vi.hoisted(() => ({
  resolve: vi.fn<(messageUuid: string) => ResolvedMessengerQuoteMessage>(),
}));

vi.mock("~/entities/messenger/messenger-quote-resolver.hook", () => ({
  useResolvedMessengerQuoteMessage: (messageUuid: string) => mocked.resolve(messageUuid),
}));

const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const MESSAGE_B = "78105b9e-f1ac-41f1-baf5-2975486cc7dc";
const AUTHOR_A = "11111111-1111-4111-8111-111111111111";
const AUTHOR_B = "44444444-4444-4444-8444-444444444444";

function message(uuid: string, authorUuid: string, content: string): MessengerMessage {
  return {
    uuid,
    conversationId: "stream:75309057-419c-4b12-a7c1-3932429ec4a6",
    projectId: "22222222-2222-4222-8222-222222222222",
    streamUuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
    topicUuid: "4ec0b996-b778-45f8-8ef4-ef863be0c047",
    authorUuid,
    userUuid: authorUuid,
    payload: { kind: "markdown", content },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-28T10:00:00Z",
    updatedAt: "2026-07-28T10:00:00Z",
  };
}

const messageA = message(MESSAGE_A, AUTHOR_A, "First message");
const messageB = message(MESSAGE_B, AUTHOR_B, `[Alice](urn:quote:${MESSAGE_A})\n\nSecond message`);

describe("WorkspaceMessageQuote", () => {
  beforeEach(() => {
    mocked.resolve.mockImplementation((messageUuid) => ({
      status: "ready",
      message: messageUuid === MESSAGE_A ? messageA : messageB,
    }));
    useUsersStore.setState({
      ownerKey: "owner",
      usersById: {
        [AUTHOR_A]: {
          uuid: AUTHOR_A,
          username: "alice",
          firstName: "Alice",
          lastName: null,
          displayName: "Alice",
          email: null,
          avatarUrl: null,
          status: "offline",
          statusEmoji: null,
          statusText: null,
          lastPingAt: "2026-07-28T10:00:00Z",
          createdAt: "2026-07-28T10:00:00Z",
          updatedAt: "2026-07-28T10:00:00Z",
        },
        [AUTHOR_B]: {
          uuid: AUTHOR_B,
          username: "bob",
          firstName: "Bob",
          lastName: null,
          displayName: "Bob",
          email: null,
          avatarUrl: null,
          status: "offline",
          statusEmoji: null,
          statusText: null,
          lastPingAt: "2026-07-28T10:00:00Z",
          createdAt: "2026-07-28T10:00:00Z",
          updatedAt: "2026-07-28T10:00:00Z",
        },
      },
      userIds: [AUTHOR_A, AUTHOR_B],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nested references only in full-history mode", () => {
    const { rerender } = render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
        mode="full-history"
      />,
    );

    expect(document.querySelectorAll("[data-workspace-quote='true']")).toHaveLength(2);
    expect(screen.getByText("First message")).toBeInTheDocument();
    expect(document.querySelector(".workspace-message-gap")).toBeNull();

    rerender(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
        mode="single-message"
      />,
    );

    expect(document.querySelectorAll("[data-workspace-quote='true']")).toHaveLength(1);
    expect(screen.queryByText("First message")).not.toBeInTheDocument();
    expect(screen.getByText("Second message")).toBeInTheDocument();
    expect(document.querySelector(".workspace-message-gap")).toBeNull();
  });

  it("uses selected text as a fixed plain-text snapshot and current author name", () => {
    render(
      <WorkspaceMessageQuote
        reference={{
          messageUuid: MESSAGE_B,
          selectedText: "<b>saved fragment</b>",
          fallbackAuthorLabel: "Old Bob",
        }}
      />,
    );

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("<b>saved fragment</b>")).toBeInTheDocument();
    expect(screen.queryByText("Old Bob")).not.toBeInTheDocument();
  });

  it("shows the preferred media thumbnail without changing quote navigation", async () => {
    const imageUuid = "55555555-5555-4555-8555-555555555555";
    const videoUuid = "66666666-6666-4666-8666-666666666666";
    mocked.resolve.mockReturnValue({
      status: "ready",
      message: message(
        MESSAGE_B,
        AUTHOR_B,
        [
          `[clip.mp4](urn:video:${videoUuid}?content_type=video%2Fmp4)`,
          `![screen.png](urn:image:${imageUuid}?content_type=image%2Fpng)`,
          "Caption",
        ].join("\n\n"),
      ),
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:bubble-quote-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(new Blob(["image"]));
    const onOpenMessage = vi.fn();

    const { container } = render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
        onOpenMessage={onOpenMessage}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img[src='blob:bubble-quote-image']")).not.toBeNull();
    });
    const thumbnailImage = container.querySelector("img[src='blob:bubble-quote-image']");
    expect(screen.getByText("Изображение")).toBeInTheDocument();
    fireEvent.load(thumbnailImage!);
    expect(onLoadWorkspaceFilePreview.mock.calls[0]?.[0]).toMatchObject({
      fileUuid: imageUuid,
      mediaKind: "image",
    });
    await waitFor(() => {
      expect(screen.queryByText("Изображение")).not.toBeInTheDocument();
      expect(screen.queryByText("Видео")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Caption")).toBeInTheDocument();
    const thumbnail = container.querySelector("[data-workspace-quote-media-thumbnail='true']");
    expect(thumbnail?.nextElementSibling).toContainElement(screen.getByText("Bob"));
    expect(thumbnail?.nextElementSibling).toContainElement(screen.getByText("Caption"));

    fireEvent.click(thumbnailImage!);
    expect(onOpenMessage).toHaveBeenCalledWith(MESSAGE_B);

    fireEvent.error(thumbnailImage!);
    await waitFor(() => {
      expect(screen.getByText("Изображение")).toBeInTheDocument();
      expect(container.querySelector("[data-workspace-quote-media-thumbnail='true']")).toBeNull();
    });
  });

  it("keeps the media label when a thumbnail cannot be loaded", () => {
    const imageUuid = "55555555-5555-4555-8555-555555555555";
    mocked.resolve.mockReturnValue({
      status: "ready",
      message: message(
        MESSAGE_B,
        AUTHOR_B,
        `![screen.png](urn:image:${imageUuid}?content_type=image%2Fpng)`,
      ),
    });

    render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
      />,
    );

    expect(screen.getByText("Изображение")).toBeInTheDocument();
  });

  it("keeps the media label when the thumbnail loader fails", async () => {
    const imageUuid = "55555555-5555-4555-8555-555555555555";
    mocked.resolve.mockReturnValue({
      status: "ready",
      message: message(
        MESSAGE_B,
        AUTHOR_B,
        `![screen.png](urn:image:${imageUuid}?content_type=image%2Fpng)`,
      ),
    });

    const { container } = render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
        onLoadWorkspaceFilePreview={vi.fn().mockRejectedValue(new Error("preview failed"))}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-workspace-quote-media-thumbnail='true']")).toBeNull();
    });
    expect(screen.getByText("Изображение")).toBeInTheDocument();
  });

  it("does not load media when selected text is the quote source", () => {
    const imageUuid = "55555555-5555-4555-8555-555555555555";
    mocked.resolve.mockReturnValue({
      status: "ready",
      message: message(
        MESSAGE_B,
        AUTHOR_B,
        `![screen.png](urn:image:${imageUuid}?content_type=image%2Fpng)`,
      ),
    });
    const onLoadWorkspaceFilePreview = vi.fn();

    render(
      <WorkspaceMessageQuote
        reference={{
          messageUuid: MESSAGE_B,
          fallbackAuthorLabel: "Old Bob",
          selectedText: "saved fragment",
        }}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
      />,
    );

    expect(screen.getByText("saved fragment")).toBeInTheDocument();
    expect(onLoadWorkspaceFilePreview).not.toHaveBeenCalled();
  });

  it("opens the quote by click or keyboard and shows one unavailable state", () => {
    const onOpenMessage = vi.fn();
    mocked.resolve.mockReturnValue({ status: "unavailable", message: null });
    render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
        onOpenMessage={onOpenMessage}
      />,
    );

    const quoteLink = screen.getByRole("link", { name: "Open in chat" });
    fireEvent.click(quoteLink);
    fireEvent.keyDown(quoteLink, { key: "Enter" });
    expect(onOpenMessage).toHaveBeenNthCalledWith(1, MESSAGE_B);
    expect(onOpenMessage).toHaveBeenNthCalledWith(2, MESSAGE_B);
    expect(screen.getByText("Message unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Old Bob")).not.toBeInTheDocument();
  });

  it("opens the deepest quote whose non-interactive body was clicked", () => {
    const onOpenMessage = vi.fn();
    render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Bob" }}
        mode="full-history"
        onOpenMessage={onOpenMessage}
      />,
    );

    fireEvent.click(screen.getByText("Second message"));
    fireEvent.click(screen.getByText("First message"));

    expect(onOpenMessage).toHaveBeenNthCalledWith(1, MESSAGE_B);
    expect(onOpenMessage).toHaveBeenNthCalledWith(2, MESSAGE_A);
  });

  it("does not turn an inner rich-content link into an outer quote navigation", () => {
    const onOpenMessage = vi.fn();
    mocked.resolve.mockReturnValue({
      status: "ready",
      message: message(MESSAGE_B, AUTHOR_B, "[Docs](https://docs.example.com)"),
    });
    render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
        onOpenMessage={onOpenMessage}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Docs" }));
    expect(onOpenMessage).not.toHaveBeenCalled();
  });

  it("uses the URN label when a ready message author is missing from the user store", () => {
    useUsersStore.setState({ usersById: {}, userIds: [] });
    render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Saved Bob" }}
      />,
    );

    expect(screen.getByText("Saved Bob")).toBeInTheDocument();
  });

  it("renders resolved quote content through the shared GFM renderer", () => {
    mocked.resolve.mockReturnValue({
      status: "ready",
      message: message(
        MESSAGE_B,
        AUTHOR_B,
        [
          "## Quote status",
          "",
          "| Item | Result |",
          "|---|---|",
          "| Parser | Ready |",
          "",
          "~~old~~",
        ].join("\n"),
      ),
    });

    const { container } = render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
      />,
    );

    const quote = container.querySelector("[data-workspace-quote='true']");
    expect(quote?.querySelector("h2")).toHaveTextContent("Quote status");
    expect(quote?.querySelector(".workspace-message-table-scroll > table")).not.toBeNull();
    expect(quote?.querySelector("del")).toHaveTextContent("old");
  });

  it("keeps intentional spacing inside resolved quote content", () => {
    mocked.resolve.mockReturnValue({
      status: "ready",
      message: message(
        MESSAGE_B,
        AUTHOR_B,
        ["Quote start", "", "", "", "", "", "", "", "Quote end"].join("\n"),
      ),
    });

    const { container } = render(
      <WorkspaceMessageQuote
        reference={{ messageUuid: MESSAGE_B, fallbackAuthorLabel: "Old Bob" }}
      />,
    );

    const quote = container.querySelector("[data-workspace-quote='true']");
    const gap = quote?.querySelector(".workspace-message-gap--5");
    expect(gap).not.toBeNull();
    expect(gap).toHaveClass("workspace-message-gap");
    expect(quote?.querySelectorAll(".workspace-message-gap")).toHaveLength(1);
    expect(quote).toHaveTextContent("Quote start");
    expect(quote).toHaveTextContent("Quote end");
  });
});
