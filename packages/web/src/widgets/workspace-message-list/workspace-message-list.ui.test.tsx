// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function selectMessageBodyText(
  container: HTMLElement,
  messageUuid: string,
  selectedText: string,
): void {
  const article = container.querySelector(`[data-message-uuid='${messageUuid}']`);
  const body = article?.querySelector("[data-message-body='true']");
  const textNode = body?.firstChild?.firstChild;

  if (textNode?.textContent == null) {
    throw new Error(`Message body text node was not found for ${messageUuid}`);
  }

  const start = textNode.textContent.indexOf(selectedText);
  if (start < 0) {
    throw new Error(`Selected text was not found in message body: ${selectedText}`);
  }

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, start + selectedText.length);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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

  it("renders plain Workspace message body through the render core", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "plain-message",
            markdown: "Workspace text message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const body = container.querySelector("[data-message-body='true']");

    expect(body).toHaveAttribute("data-message-content-kind", "plain");
    expect(body?.querySelector("p")).toHaveTextContent("Workspace text message");
  });

  it("renders inline-rich Workspace markdown and keeps time inline", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "inline-rich-message",
            markdown: "Hello **bold** and [docs](https://example.com/docs)",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='inline-rich-message']");
    const body = article?.querySelector("[data-message-body='true']");
    const link = body?.querySelector("a");

    expect(body).toHaveAttribute("data-message-content-kind", "inline-rich");
    expect(body?.querySelector("strong")).toHaveTextContent("bold");
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(article?.querySelector("[data-message-time='true']")).toHaveAttribute(
      "data-message-meta-placement",
      "inline",
    );
    expect(article?.querySelector("[data-workspace-message-bubble='true']")).not.toHaveAttribute(
      "role",
      "button",
    );
  });

  it("opens safe external links without treating the bubble as a button", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "safe-link-message",
            markdown: "Open [docs](https://example.com/docs)",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='safe-link-message']");
    const bubble = article?.querySelector("[data-workspace-message-bubble='true']");
    const link = article?.querySelector<HTMLAnchorElement>("a[href='https://example.com/docs']");

    expect(bubble).not.toHaveAttribute("role", "button");
    expect(bubble).toHaveAttribute("data-workspace-message-interactive-body", "true");

    fireEvent.click(link!);

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockRestore();
  });

  it("downloads Workspace attachment references through UUID-based file action", () => {
    const onDownloadFile = vi.fn();
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-attachment-message",
            markdown: `[report.pdf](workspace-file://${fileUuid})`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onDownloadFile }}
      />,
    );

    const article = container.querySelector("[data-message-uuid='workspace-attachment-message']");
    const attachment = screen.getByRole("button", { name: "Файл: report.pdf" });

    expect(attachment).toHaveAttribute("data-workspace-file-uuid", fileUuid);
    expect(attachment).toHaveAttribute("data-workspace-file-kind", "attachment");
    expect(
      container.querySelector(`[${["data", "message", "id"].join("-")}]`),
    ).not.toBeInTheDocument();

    fireEvent.click(attachment);

    expect(onDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "attachment",
        fileUuid,
        name: "report.pdf",
      }),
    );
    expect(article).toHaveAttribute("data-message-uuid", "workspace-attachment-message");
  });

  it("downloads Workspace media placeholders without opening unsupported viewer", () => {
    const onDownloadFile = vi.fn();
    const onOpenUnsupportedFilePreview = vi.fn();
    const fileUuid = "44444444-4444-4444-8444-444444444444";
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-message",
            markdown: `![screen.png](workspace-file://${fileUuid}?content_type=image/png)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onDownloadFile, onOpenUnsupportedFilePreview }}
      />,
    );

    const article = container.querySelector("[data-message-uuid='workspace-media-message']");
    const media = screen.getByRole("button", { name: "Изображение" });

    expect(media).toHaveAttribute("data-workspace-file-uuid", fileUuid);
    expect(media).toHaveAttribute("data-workspace-file-kind", "media");
    expect(media).toHaveAttribute("data-workspace-media-kind", "image");
    expect(container.querySelector("img")).not.toBeInTheDocument();

    fireEvent.click(media);

    expect(onDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "media",
        fileUuid,
        name: "screen.png",
        mediaKind: "image",
        contentType: "image/png",
      }),
    );
    expect(onOpenUnsupportedFilePreview).not.toHaveBeenCalled();
    expect(article).toHaveAttribute("data-message-uuid", "workspace-media-message");
  });

  it("opens resolved Workspace mentions through UUID-only callback", () => {
    const onOpenMentionUser = vi.fn();
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "resolved-mention-message",
            markdown: "Привет @**Alice Reed**",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveMention={(displayText) =>
          displayText === "Alice Reed"
            ? {
                userUuid: "alice-workspace-uuid",
                displayText: "Alice Reed",
              }
            : null
        }
        actions={{ onOpenMentionUser }}
      />,
    );

    const mention = screen.getByRole("button", { name: "@Alice Reed" });

    expect(mention).toHaveAttribute("data-workspace-user-uuid", "alice-workspace-uuid");
    expect(mention).not.toHaveAttribute("data-user-id");

    fireEvent.click(mention);

    expect(onOpenMentionUser).toHaveBeenCalledWith("alice-workspace-uuid");
    expect(container.querySelector("[data-user-id]")).not.toBeInTheDocument();
  });

  it("keeps unresolved Workspace mentions as text without numeric identity", () => {
    const onOpenMentionUser = vi.fn();
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "unresolved-mention-message",
            markdown: "Привет @**Unknown User**",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveMention={() => null}
        actions={{ onOpenMentionUser }}
      />,
    );

    expect(screen.getByText("Привет @Unknown User")).toBeInTheDocument();
    expect(container.querySelector("[data-workspace-user-uuid]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-user-id]")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Привет @Unknown User"));

    expect(onOpenMentionUser).not.toHaveBeenCalled();
  });

  it("renders a copy button for fenced code blocks and copies code text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "code-copy-message",
            markdown: ["```ts", "const value = 1;", "```"].join("\n"),
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    await waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>("[data-code-copy-button='true']");
      expect(button).toBeInTheDocument();
    });
    const copyButton = container.querySelector<HTMLButtonElement>("[data-code-copy-button='true']");
    if (copyButton == null) {
      throw new Error("Code copy button was not rendered");
    }

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("const value = 1;");
    });
  });

  it("renders block-rich Workspace markdown and moves time to row placement", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "block-rich-message",
            markdown: ["- one", "- two"].join("\n"),
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='block-rich-message']");
    const body = article?.querySelector("[data-message-body='true']");

    expect(body).toHaveAttribute("data-message-content-kind", "block-rich");
    expect(body?.querySelectorAll("li")).toHaveLength(2);
    expect(article?.querySelector("[data-message-time='true']")).toHaveAttribute(
      "data-message-meta-placement",
      "row",
    );
  });

  it("keeps old bubble rich-text body classes for lists and paragraphs after lists", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "ordered-list-message",
            markdown: [
              "Intro paragraph",
              "",
              "1. First item",
              "   - Nested A",
              "2. Second item",
              "",
              "Outro paragraph",
            ].join("\n"),
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const body = container.querySelector("[data-message-body='true']");
    const orderedList = body?.querySelector("ol");
    const outroParagraph = orderedList?.nextElementSibling;

    expect(body).toHaveClass("message-body");
    expect(body).toHaveClass("[&_ol]:list-decimal");
    expect(body).toHaveClass("[&_ol]:list-outside");
    expect(body).toHaveClass("[&_ul]:list-disc");
    expect(body).toHaveClass("[&_li>p]:mb-0");
    expect(body).toHaveClass("[&_ol+p]:mt-1");
    expect(orderedList).toBeTruthy();
    expect(body?.querySelector("ol li ul")).toBeTruthy();
    expect(outroParagraph?.tagName.toLowerCase()).toBe("p");
    expect(outroParagraph).toHaveTextContent("Outro paragraph");
  });

  it("renders nested Workspace quote blocks without legacy message anchors", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "nested-quote-message",
            markdown: ["> Alice: outer", ">", "> > Bob: nested", "", "Own reply"].join("\n"),
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const article = container.querySelector("[data-message-uuid='nested-quote-message']");
    const body = article?.querySelector("[data-message-body='true']");

    expect(article).toHaveAttribute("data-message-uuid", "nested-quote-message");
    expect(body?.querySelectorAll("blockquote.workspace-message-quote")).toHaveLength(2);
    expect(body).toHaveClass("message-body");
    expect(article).not.toHaveAttribute(["data", "message", "id"].join("-"));
  });

  it("renders Workspace inline code and code blocks with old bubble code controls", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-code-message",
            markdown: ["Inline `value`", "", "```ts", "const value = 1;", "```"].join("\n"),
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const body = container.querySelector("[data-message-body='true']");
    const inlineCode = body?.querySelector("p code");
    const blockCode = body?.querySelector("pre > code");

    expect(inlineCode).toHaveTextContent("value");
    expect(blockCode).toHaveClass("hljs", "language-ts");

    await waitFor(() => {
      expect(body?.querySelector('[data-code-copy-button="true"]')).toBeInTheDocument();
    });
    const copyButton = body?.querySelector<HTMLButtonElement>('[data-code-copy-button="true"]');
    expect(copyButton).toHaveClass("message-code-copy-btn");

    fireEvent.click(copyButton as HTMLButtonElement);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("const value = 1;");
    });
  });

  it("renders Workspace mentions with old visual class shell and UUID data attr", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-mention-message",
            markdown: "Привет @**Alice Reed**",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveMention={(displayText) =>
          displayText === "Alice Reed" ? { displayText, userUuid } : null
        }
        actions={{ onOpenMentionUser: vi.fn() }}
      />,
    );

    const mention = container.querySelector("[data-workspace-mention='true']");

    expect(mention).toHaveClass("workspace-message-mention");
    expect(mention).toHaveAttribute("data-workspace-user-uuid", userUuid);
    expect(mention).not.toHaveAttribute("data-user-id");
  });

  it("toggles Workspace inline and block spoilers", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-spoiler-message",
            markdown: ["Before ||secret|| after", "", "```spoiler Hidden", "payload", "```"].join(
              "\n",
            ),
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const inlineSpoiler = container.querySelector(".inline-spoiler");
    const spoilerBlock = container.querySelector(".spoiler-block");
    const spoilerHeader = container.querySelector(".spoiler-header");

    expect(inlineSpoiler).toHaveAttribute("data-workspace-spoiler-inline", "true");
    expect(spoilerHeader).toHaveAttribute("data-workspace-spoiler-toggle", "true");
    expect(inlineSpoiler).not.toHaveClass("open");
    expect(spoilerBlock).not.toHaveClass("open");

    fireEvent.click(inlineSpoiler as HTMLElement);
    fireEvent.click(spoilerHeader as HTMLElement);

    expect(inlineSpoiler).toHaveClass("open");
    expect(spoilerBlock).toHaveClass("open");
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
    expect(container.querySelector("[data-message-body='true']")).toHaveTextContent(htmlText);
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
    const body = article?.querySelector("[data-message-body='true']");
    const time = article?.querySelector("[data-message-time='true']");

    expect(time).toHaveAttribute("data-message-meta-placement", "inline");
    expect(body).toHaveClass("workspace-message-bubble-inline-text");
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
    const body = article?.querySelector("[data-message-body='true']");
    const time = article?.querySelector("[data-message-time='true']");

    expect(time).toHaveAttribute("data-message-meta-placement", "row");
    expect(body).not.toHaveClass("workspace-message-bubble-inline-text");
    expect(body?.textContent).toBe("First lineSecond line");
  });

  it("uses render metadata for long plain message meta placement", () => {
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
      "inline",
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

  it("opens the Workspace bubble menu from keyboard context menu shortcut", async () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "keyboard-context-menu-message",
            markdown: "Keyboard context menu message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const bubble = container.querySelector("[data-workspace-message-bubble='true']");
    fireEvent.keyDown(bubble!, { key: "F10", shiftKey: true });

    expect(await screen.findByRole("menuitem", { name: "Copy text" })).toBeInTheDocument();
  });

  it("passes selected body text to Workspace reply and copy callbacks", async () => {
    const onReplyMessage = vi.fn();
    const onCopyMessageText = vi.fn();
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "selected-callback-message",
            markdown: "Keep this selected phrase inside the body",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{
          onReplyMessage,
          onCopyMessageText,
        }}
      />,
    );

    const bubble = container.querySelector("[data-workspace-message-bubble='true']");

    selectMessageBodyText(container, "selected-callback-message", "selected phrase");
    fireEvent.contextMenu(bubble!, { clientX: 120, clientY: 80 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reply" }));
    expect(onReplyMessage).toHaveBeenCalledWith("selected-callback-message", "selected phrase");

    selectMessageBodyText(container, "selected-callback-message", "selected phrase");
    fireEvent.contextMenu(bubble!, { clientX: 120, clientY: 80 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy text" }));
    expect(onCopyMessageText).toHaveBeenCalledWith("selected-callback-message", "selected phrase");
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
