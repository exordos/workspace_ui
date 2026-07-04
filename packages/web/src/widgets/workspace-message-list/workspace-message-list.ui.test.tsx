// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { setLocale } from "~/i18n/i18n";
import { WorkspaceMessageList } from "./workspace-message-list.ui";

function createWorkspaceMessage(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    uuid: "message-uuid-1",
    conversationId: "topic:stream-uuid-1:topic-uuid-1",
    projectId: "project-uuid-1",
    streamUuid: "stream-uuid-1",
    topicUuid: "topic-uuid-1",
    authorUuid: "author-uuid-1",
    userUuid: "author-uuid-1",
    markdown: "Workspace text message",
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    ...overrides,
  };
}

function openWorkspaceMessageMenu(): void {
  fireEvent.pointerDown(screen.getByLabelText("Message menu"), {
    button: 0,
    ctrlKey: false,
  });
}

describe("WorkspaceMessageList", () => {
  beforeEach(() => {
    setLocale("en");
    vi.useRealTimers();
  });

  afterEach(() => {
    setLocale("en");
    vi.useRealTimers();
  });

  it("renders Workspace messages with uuid based DOM identity", () => {
    const message = createWorkspaceMessage({
      uuid: "workspace-message-uuid",
      markdown: "Message without numeric id",
    });

    render(
      <WorkspaceMessageList
        messages={[message]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const renderedMessage = screen.getByText("Message without numeric id").closest("article");

    expect(renderedMessage).toHaveAttribute("data-message-uuid", "workspace-message-uuid");
    expect(renderedMessage).not.toHaveAttribute(["data", "message", "id"].join("-"));
  });

  it("connects the Workspace scroll controller to the feed container", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "message-with-scroll-controller",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const feed = container.querySelector("[role='feed']");

    expect(feed).toHaveAttribute("data-workspace-scroll-controller", "true");
    expect(feed).toHaveAttribute("data-scroll-at-bottom");
  });

  it("resets the scroll state when the conversation scroll key changes", () => {
    const { container, rerender } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "first-conversation-message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        scrollToBottomKey="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const feed = container.querySelector("[role='feed']");

    expect(feed).toHaveAttribute("data-scroll-at-bottom", "true");

    fireEvent.wheel(feed!, { deltaY: -100 });

    expect(feed).toHaveAttribute("data-scroll-at-bottom", "false");

    rerender(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "second-conversation-message",
            conversationId: "topic:stream-uuid-2:topic-uuid-2",
            streamUuid: "stream-uuid-2",
            topicUuid: "topic-uuid-2",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-2:topic-uuid-2"
        scrollToBottomKey="topic:stream-uuid-2:topic-uuid-2"
      />,
    );

    expect(container.querySelector("[role='feed']")).toHaveAttribute(
      "data-scroll-at-bottom",
      "true",
    );
  });

  it("renders an empty state for a Workspace conversation", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(container.querySelector("[data-empty-state='true']")).toBeInTheDocument();
  });

  it("renders messages in stable createdAt and uuid order", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "message-c",
            markdown: "Third rendered message",
            createdAt: "2026-07-03T09:02:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "message-b",
            markdown: "Second rendered message",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "message-a",
            markdown: "First rendered message",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(
      Array.from(container.querySelectorAll("article")).map((message) =>
        message.getAttribute("data-message-uuid"),
      ),
    ).toEqual(["message-a", "message-b", "message-c"]);
  });

  it("renders translated today and yesterday day dividers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 3, 12, 0, 0, 0));

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "day-one-message",
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "day-two-message",
            createdAt: "2026-07-02T09:00:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(container.querySelector("[data-day-divider='2026-07-03']")).toHaveTextContent("Today");
    expect(container.querySelector("[data-day-divider='2026-07-02']")).toHaveTextContent(
      "Yesterday",
    );
  });

  it("renders a localized month label for older Russian day dividers", () => {
    setLocale("ru");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 3, 12, 0, 0, 0));

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "older-day-message",
            createdAt: "2026-06-01T09:00:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const divider = container.querySelector("[data-day-divider='2026-06-01']");

    expect(divider).toHaveTextContent("1 июня");
    expect(divider).not.toHaveTextContent("2026-06-01");
  });

  it("does not render the local day key as the visible divider label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 3, 12, 0, 0, 0));

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "today-message",
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const divider = container.querySelector("[data-day-divider='2026-07-03']");

    expect(divider).toHaveTextContent("Today");
    expect(divider).not.toHaveTextContent("2026-07-03");
  });

  it("renders neighboring author groups separately", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "author-a-first",
            authorUuid: "author-a",
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "author-a-second",
            authorUuid: "author-a",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "author-b-message",
            authorUuid: "author-b",
            createdAt: "2026-07-03T09:02:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "author-a-third",
            authorUuid: "author-a",
            createdAt: "2026-07-03T09:03:00.000Z",
          }),
        ]}
        currentUserUuid="author-a"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const authorGroups = Array.from(container.querySelectorAll("[data-author-group='true']"));

    expect(authorGroups.map((group) => group.getAttribute("data-author-uuid"))).toEqual([
      "author-a",
      "author-b",
      "author-a",
    ]);
    expect(authorGroups.map((group) => group.getAttribute("data-message-owner"))).toEqual([
      "own",
      "peer",
      "own",
    ]);
    expect(authorGroups[0]?.querySelectorAll("article")).toHaveLength(2);
    expect(authorGroups[1]?.querySelectorAll("article")).toHaveLength(1);
    expect(authorGroups[2]?.querySelectorAll("article")).toHaveLength(1);
  });

  it("renders own and peer bubbles with resolved author label only for peer group start", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "own-message",
            authorUuid: "current-user-uuid",
            userUuid: "current-user-uuid",
            isOwn: true,
            markdown: "Own message",
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "peer-message",
            authorUuid: "peer-user-uuid-1",
            userUuid: "peer-user-uuid-1",
            markdown: "Peer message",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveAuthorLabel={(authorUuid) => (authorUuid === "peer-user-uuid-1" ? "Bob Reed" : null)}
      />,
    );

    const ownArticle = container.querySelector("[data-message-uuid='own-message']");
    const peerArticle = container.querySelector("[data-message-uuid='peer-message']");

    expect(ownArticle).toHaveAttribute("data-message-owner", "own");
    expect(peerArticle).toHaveAttribute("data-message-owner", "peer");
    expect(ownArticle?.querySelector("[data-peer-author-label='true']")).not.toBeInTheDocument();
    expect(peerArticle?.querySelector("[data-peer-author-label='true']")).toHaveTextContent(
      "Bob Reed",
    );
  });

  it("falls back to a short uuid label when a peer author is unresolved", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "peer-message",
            authorUuid: "peer-user-uuid-1",
            userUuid: "peer-user-uuid-1",
            markdown: "Peer message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveAuthorLabel={() => null}
      />,
    );

    const peerArticle = container.querySelector("[data-message-uuid='peer-message']");

    expect(peerArticle?.querySelector("[data-peer-author-label='true']")).toHaveTextContent(
      "#peer-us",
    );
  });

  it("renders message markdown as plain text with preserved line breaks", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "multiline-message",
            markdown: "First line\nSecond line",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const plainText = container.querySelector("[data-message-plain-text='true']");

    expect(plainText).toHaveClass("whitespace-pre-wrap");
    expect(plainText?.textContent).toBe("First line\nSecond line");
  });

  it("does not execute or inject html from Workspace message text", () => {
    const htmlText = '<img src=x onerror="alert(1)">safe text';
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "html-like-message",
            markdown: htmlText,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector("[data-message-plain-text='true']")).toHaveTextContent(htmlText);
  });

  it("renders a simple message time inside the Workspace bubble", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "message-with-time",
            createdAt: "2026-07-03T09:05:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const time = container.querySelector("[data-message-time='true']");

    expect(time).toHaveAttribute("dateTime", "2026-07-03T09:05:00.000Z");
    expect(time?.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it("renders simple text message time inline inside the Workspace bubble", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "simple-inline-message",
            markdown: "Short text",
            createdAt: "2026-07-03T09:06:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='simple-inline-message']");
    const text = article?.querySelector("[data-message-plain-text='true']");
    const time = article?.querySelector("[data-message-time='true']");

    expect(time).toHaveAttribute("data-message-meta-placement", "inline");
    expect(text).toHaveClass("workspace-message-bubble-inline-text");
  });

  it("renders multiline message time as a row fallback", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "multiline-row-message",
            markdown: "First line\nSecond line",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='multiline-row-message']");
    const text = article?.querySelector("[data-message-plain-text='true']");
    const time = article?.querySelector("[data-message-time='true']");

    expect(time).toHaveAttribute("data-message-meta-placement", "row");
    expect(text).not.toHaveClass("workspace-message-bubble-inline-text");
    expect(text?.textContent).toBe("First line\nSecond line");
  });

  it("renders long word message time as a row fallback", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "long-word-row-message",
            markdown: "word-without-breaks-abcdefghijklmnopqrstuvwxyz",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='long-word-row-message']");

    expect(article?.querySelector("[data-message-time='true']")).toHaveAttribute(
      "data-message-meta-placement",
      "row",
    );
  });

  it("renders reaction message time as a row fallback", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "reaction-row-message",
            markdown: "Reacted text",
            reactions: { thumbs_up: 1 },
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='reaction-row-message']");

    expect(article?.querySelector("[data-message-time='true']")).toHaveAttribute(
      "data-message-meta-placement",
      "row",
    );
  });

  it("opens the Workspace bubble menu from the trigger button", async () => {
    const onReplyMessage = vi.fn();
    const onEditMessage = vi.fn();
    const onRequestDeleteMessage = vi.fn();
    const onToggleMessageReaction = vi.fn();

    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "own-menu-message",
            authorUuid: "current-user-uuid",
            userUuid: "current-user-uuid",
            isOwn: true,
            markdown: "Own menu message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{
          onReplyMessage,
          onEditMessage,
          onRequestDeleteMessage,
          onToggleMessageReaction,
        }}
      />,
    );

    openWorkspaceMessageMenu();

    expect(await screen.findByRole("menuitem", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy text" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit message" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Thumbs up"));
    expect(onToggleMessageReaction).toHaveBeenCalledWith("own-menu-message", "thumbs_up");
  });

  it("opens the Workspace bubble menu from right click", async () => {
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "context-menu-message",
            markdown: "Context menu message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const bubble = screen
      .getByText("Context menu message")
      .closest("[data-workspace-message-bubble='true']");

    fireEvent.contextMenu(bubble!, { clientX: 120, clientY: 80 });

    expect(await screen.findByRole("menuitem", { name: "Copy text" })).toBeInTheDocument();
  });

  it("calls Workspace menu callbacks with message uuid", async () => {
    const onReplyMessage = vi.fn();
    const onEditMessage = vi.fn();
    const onRequestDeleteMessage = vi.fn();
    const onCopyMessageText = vi.fn();

    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "uuid-callback-message",
            authorUuid: "current-user-uuid",
            userUuid: "current-user-uuid",
            isOwn: true,
            markdown: "Callback body",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{
          onReplyMessage,
          onEditMessage,
          onRequestDeleteMessage,
          onCopyMessageText,
        }}
      />,
    );

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reply" }));
    expect(onReplyMessage).toHaveBeenCalledWith("uuid-callback-message", undefined);

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy text" }));
    expect(onCopyMessageText).toHaveBeenCalledWith("uuid-callback-message", "Callback body");

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit message" }));
    expect(onEditMessage).toHaveBeenCalledWith("uuid-callback-message");

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(onRequestDeleteMessage).toHaveBeenCalledWith("uuid-callback-message");
  });

  it("does not show own-only actions for peer messages", async () => {
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "peer-menu-message",
            authorUuid: "peer-user-uuid",
            userUuid: "peer-user-uuid",
            isOwn: false,
            markdown: "Peer menu message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{
          onEditMessage: vi.fn(),
          onRequestDeleteMessage: vi.fn(),
        }}
      />,
    );

    openWorkspaceMessageMenu();

    expect(await screen.findByRole("menuitem", { name: "Copy text" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Edit message" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });
});
