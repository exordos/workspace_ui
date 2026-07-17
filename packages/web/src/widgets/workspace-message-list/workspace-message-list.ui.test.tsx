// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerOutgoingMessage } from "~/entities/messenger/messenger-outbox.types";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { setLocale } from "~/i18n/i18n";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/media-display-url.lib";
import { WorkspaceMessageList } from "./workspace-message-list.ui";

vi.mock("emoji-picker-react", () => ({
  default: (props: {
    onEmojiClick?: (data: {
      emoji: string;
      isCustom?: boolean;
      names?: string[];
      unified?: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onEmojiClick?.({
          emoji: "😀",
          isCustom: false,
          names: ["grinning"],
          unified: "1f600",
        })
      }
    >
      Pick emoji
    </button>
  ),
  EmojiStyle: { NATIVE: "native" },
  Theme: { DARK: "dark", LIGHT: "light" },
}));

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function createWorkspaceMessage(overrides: MessageOverrides = {}): MessengerMessage {
  const { markdown, payload, ...rest } = overrides;
  return {
    uuid: "message-uuid-1",
    conversationId: "topic:stream-uuid-1:topic-uuid-1",
    projectId: "project-uuid-1",
    streamUuid: "stream-uuid-1",
    topicUuid: "topic-uuid-1",
    authorUuid: "author-uuid-1",
    userUuid: "author-uuid-1",
    payload: payload ?? { kind: "markdown", content: markdown ?? "Workspace text message" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    ...rest,
  };
}

function createWorkspaceUser(overrides: Partial<User> = {}): User {
  return {
    uuid: "peer-user-uuid",
    username: "bob",
    firstName: "Bob",
    lastName: "Reed",
    displayName: "Bob Reed",
    email: "bob@example.com",
    avatarUrl: null,
    status: "offline",
    statusEmoji: null,
    statusText: null,
    lastPingAt: "2026-07-03T09:00:00.000Z",
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    ...overrides,
  };
}

function createOutgoingMessage(
  overrides: Partial<MessengerOutgoingMessage> = {},
): MessengerOutgoingMessage {
  return {
    localId: "outgoing-local-id-1",
    ownerKey: "owner-key-1",
    conversationId: "topic:stream-uuid-1:topic-uuid-1",
    projectId: "project-uuid-1",
    streamUuid: "stream-uuid-1",
    topicUuid: "topic-uuid-1",
    authorUuid: "current-user-uuid",
    markdown: "Local outgoing text",
    sourceMarkdown: "Local outgoing text",
    status: "sending",
    createdAt: "2026-07-03T09:01:00.000Z",
    updatedAt: "2026-07-03T09:01:00.000Z",
    attempt: 1,
    error: null,
    includeStreamConversation: false,
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
    useUsersStore.getState().clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    setLocale("en");
    useUsersStore.getState().clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("renders one Workspace peer avatar with presence for an author group", () => {
    const onOpenAuthorProfile = vi.fn();
    useUsersStore.getState().replaceUsers([
      createWorkspaceUser({
        avatarUrl: "urn:url:https://cdn.example/avatar.png",
        status: "active",
      }),
    ]);

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "peer-message-1",
            authorUuid: "peer-user-uuid",
            userUuid: "peer-user-uuid",
            markdown: "First peer message",
          }),
          createWorkspaceMessage({
            uuid: "peer-message-2",
            authorUuid: "peer-user-uuid",
            userUuid: "peer-user-uuid",
            markdown: "Second peer message",
            createdAt: "2026-07-03T09:01:00.000Z",
            updatedAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onOpenAuthorProfile }}
      />,
    );

    expect(container.querySelectorAll("[data-workspace-peer-avatar='true']")).toHaveLength(1);
    expect(container.querySelector("[data-workspace-peer-avatar='true'] img")).toHaveAttribute(
      "src",
      "https://cdn.example/avatar.png",
    );
    expect(container.querySelector("[data-presence='active']")).toBeInTheDocument();
    expect(screen.getByText("Bob Reed")).toBeInTheDocument();

    fireEvent.click(container.querySelector("[data-workspace-peer-avatar='true']")!);
    expect(onOpenAuthorProfile).toHaveBeenCalledWith("peer-user-uuid");
  });

  it("keeps a fallback avatar for an unknown UUID", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            authorUuid: "unknown-author-uuid",
            userUuid: "unknown-author-uuid",
            markdown: "Unknown author message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveAuthorLabel={() => null}
      />,
    );

    expect(screen.getByText("#unknown-")).toBeInTheDocument();
    expect(container.querySelector("[data-workspace-peer-avatar='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-workspace-peer-avatar='true'] img")).toBeNull();
    expect(container.querySelector("[data-presence]")).toBeNull();
  });

  it("does not render a peer avatar for own messages", () => {
    useUsersStore.getState().replaceUsers([
      createWorkspaceUser({
        uuid: "current-user-uuid",
        displayName: "Current User",
        status: "active",
        avatarUrl: "urn:image:own-avatar-uuid",
      }),
    ]);

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            authorUuid: "current-user-uuid",
            userUuid: "current-user-uuid",
            isOwn: true,
            markdown: "Own message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(container.querySelector("[data-message-owner='own']")).toBeInTheDocument();
    expect(container.querySelector("[data-workspace-peer-avatar='true']")).toBeNull();
    expect(container.querySelector("[data-presence]")).toBeNull();
  });

  it("renders local outgoing messages in the same Workspace feed", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "server-message",
            markdown: "Server text",
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
        ]}
        outgoingMessages={[
          createOutgoingMessage({
            localId: "local-outgoing-message",
            markdown: "Pending local text",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(screen.getByText("Pending local text")).toBeInTheDocument();
    const articles = Array.from(container.querySelectorAll("article"));
    expect(articles.map((article) => article.getAttribute("data-message-kind"))).toEqual([
      "server",
      "outgoing",
    ]);
    expect(articles[1]).toHaveAttribute("data-message-uuid", "local-outgoing-message");
    expect(articles[1]).toHaveAttribute("data-outgoing-message-id", "local-outgoing-message");
    expect(
      container.querySelector("[data-outgoing-delivery-status='sending']"),
    ).toBeInTheDocument();
  });

  it("keeps an identical server message and local row separate until their exact mapping arrives", () => {
    const serverMessageUuid = "server-message-uuid";
    const localId = "local-outgoing-message";
    const serverMessage = createWorkspaceMessage({
      uuid: serverMessageUuid,
      authorUuid: "current-user-uuid",
      userUuid: "current-user-uuid",
      isOwn: true,
      markdown: "Local outgoing text",
      createdAt: "2026-07-03T09:01:00.000Z",
    });
    const outgoingMessage = createOutgoingMessage({
      localId,
      markdown: "Local outgoing text",
      status: "sending",
    });

    const { container, rerender } = render(
      <WorkspaceMessageList
        messages={[serverMessage]}
        outgoingMessages={[outgoingMessage]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(container.querySelectorAll("article")).toHaveLength(2);
    const articleBeforeResolve = container.querySelector(`[data-outgoing-message-id='${localId}']`);
    expect(articleBeforeResolve).toHaveAttribute("data-message-uuid", localId);

    rerender(
      <WorkspaceMessageList
        messages={[serverMessage]}
        outgoingMessages={[outgoingMessage]}
        resolveServerMessageRenderKey={(messageUuid) =>
          messageUuid === serverMessageUuid ? localId : undefined
        }
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const articles = Array.from(container.querySelectorAll("article"));
    expect(articles).toHaveLength(1);
    expect(articles[0]).toBe(articleBeforeResolve);
    expect(articles[0]).toHaveAttribute("data-message-uuid", serverMessageUuid);
    expect(articles[0]).toHaveAttribute("data-message-render-key", localId);
    expect(articles[0]).not.toHaveAttribute("data-outgoing-message-id");
    expect(articles[0]).toHaveAttribute("data-server-message-uuid", serverMessageUuid);

    rerender(
      <WorkspaceMessageList
        messages={[serverMessage]}
        outgoingMessages={[]}
        resolveServerMessageRenderKey={(messageUuid) =>
          messageUuid === serverMessageUuid ? localId : undefined
        }
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article")).toBe(articleBeforeResolve);
  });

  it("renders edited content from the server snapshot", () => {
    const serverMessageUuid = "edited-server-message-uuid";
    const { container, rerender } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: serverMessageUuid,
            isOwn: true,
            authorUuid: "current-user-uuid",
            markdown: "Original server text",
          }),
        ]}
        outgoingMessages={[]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(screen.getByText("Original server text")).toBeInTheDocument();

    rerender(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: serverMessageUuid,
            isOwn: true,
            authorUuid: "current-user-uuid",
            markdown: "Edited server text",
            updatedAt: "2026-07-03T09:02:00.000Z",
          }),
        ]}
        outgoingMessages={[]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    expect(screen.getByText("Edited server text")).toBeInTheDocument();
    expect(
      container.querySelector("[data-message-uuid='edited-server-message-uuid']"),
    ).toBeInTheDocument();
  });

  it("exposes retry and remove actions for failed local outgoing messages", () => {
    const onRetryOutgoingMessage = vi.fn();
    const onRemoveOutgoingMessage = vi.fn();
    render(
      <WorkspaceMessageList
        messages={[]}
        outgoingMessages={[
          createOutgoingMessage({
            localId: "failed-local-message",
            status: "failed",
            error: "network failed",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onRetryOutgoingMessage, onRemoveOutgoingMessage }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Retry send"));
    fireEvent.click(screen.getByLabelText("Remove message"));

    expect(onRetryOutgoingMessage).toHaveBeenCalledWith("failed-local-message");
    expect(onRemoveOutgoingMessage).toHaveBeenCalledWith("failed-local-message");
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

  it("resets the scroll state when the conversation scroll key changes", async () => {
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

    await waitFor(() => expect(feed).toHaveAttribute("data-scroll-at-bottom", "false"));

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

  it("renders one unread divider before the author group containing the anchor", () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "first-author-message",
            authorUuid: "author-a",
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "second-author-message",
            authorUuid: "author-b",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "unread-anchor",
            authorUuid: "author-b",
            createdAt: "2026-07-03T09:02:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        firstUnreadUuid="unread-anchor"
        unreadCount={2}
      />,
    );

    const unreadDivider = container.querySelector("[data-unread-divider='true']");
    const authorGroups = Array.from(container.querySelectorAll("[data-author-group='true']"));

    expect(unreadDivider).toHaveTextContent("Unread messages • 2");
    expect(container.querySelectorAll("[data-unread-divider='true']")).toHaveLength(1);
    expect(unreadDivider?.nextElementSibling).toBe(authorGroups[1]);
    expect(authorGroups[1]).toContainElement(
      container.querySelector("[data-message-uuid='unread-anchor']"),
    );
  });

  it("does not render an unread divider without an anchor in the current messages", () => {
    const { container, rerender } = render(
      <WorkspaceMessageList
        messages={[createWorkspaceMessage({ uuid: "loaded-message" })]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        unreadCount={2}
      />,
    );

    expect(container.querySelector("[data-unread-divider='true']")).not.toBeInTheDocument();

    rerender(
      <WorkspaceMessageList
        messages={[createWorkspaceMessage({ uuid: "loaded-message" })]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        firstUnreadUuid="not-loaded-message"
        unreadCount={2}
      />,
    );

    expect(container.querySelector("[data-unread-divider='true']")).not.toBeInTheDocument();
  });

  it("keeps the unread divider at the initial anchor while read state advances", () => {
    const messages = [
      createWorkspaceMessage({
        uuid: "initial-unread-anchor",
        authorUuid: "author-a",
        createdAt: "2026-07-03T09:00:00.000Z",
      }),
      createWorkspaceMessage({
        uuid: "later-unread-anchor",
        authorUuid: "author-b",
        createdAt: "2026-07-03T09:01:00.000Z",
      }),
    ];
    const { container, rerender } = render(
      <WorkspaceMessageList
        messages={messages}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        firstUnreadUuid="initial-unread-anchor"
        unreadCount={2}
      />,
    );

    rerender(
      <WorkspaceMessageList
        messages={messages}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        firstUnreadUuid="later-unread-anchor"
        unreadCount={1}
      />,
    );

    const unreadDivider = container.querySelector<HTMLElement>("[data-unread-divider='true']");
    const initialAnchor = container.querySelector<HTMLElement>(
      "[data-message-uuid='initial-unread-anchor']",
    );

    expect(unreadDivider).toBeInTheDocument();
    expect(unreadDivider?.nextElementSibling as HTMLElement | null).toContainElement(initialAnchor);
  });

  it("waits for the initial snapshot before fixing a late unread anchor", () => {
    const messages = [
      createWorkspaceMessage({
        uuid: "late-unread-anchor",
        createdAt: "2026-07-03T09:00:00.000Z",
      }),
    ];
    const { container, rerender } = render(
      <WorkspaceMessageList
        messages={messages}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        initialSnapshotReady={false}
        unreadCount={0}
      />,
    );

    expect(container.querySelector("[data-unread-divider='true']")).not.toBeInTheDocument();

    rerender(
      <WorkspaceMessageList
        messages={messages}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        initialSnapshotReady
        firstUnreadUuid="late-unread-anchor"
        unreadCount={1}
      />,
    );

    expect(container.querySelector("[data-unread-divider='true']")).toBeInTheDocument();
  });

  it("resets the unread divider anchor when entering another conversation", () => {
    const { container, rerender } = render(
      <WorkspaceMessageList
        key="topic:stream-uuid-1:topic-uuid-1"
        messages={[createWorkspaceMessage({ uuid: "first-conversation-anchor" })]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        firstUnreadUuid="first-conversation-anchor"
        unreadCount={1}
      />,
    );

    rerender(
      <WorkspaceMessageList
        key="topic:stream-uuid-2:topic-uuid-2"
        messages={[
          createWorkspaceMessage({
            uuid: "second-conversation-anchor",
            conversationId: "topic:stream-uuid-2:topic-uuid-2",
            streamUuid: "stream-uuid-2",
            topicUuid: "topic-uuid-2",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-2:topic-uuid-2"
        firstUnreadUuid="second-conversation-anchor"
        unreadCount={1}
      />,
    );

    const unreadDivider = container.querySelector<HTMLElement>("[data-unread-divider='true']");
    const secondAnchor = container.querySelector<HTMLElement>(
      "[data-message-uuid='second-conversation-anchor']",
    );

    expect(unreadDivider?.nextElementSibling as HTMLElement | null).toContainElement(secondAnchor);
  });

  it("captures a new first unread message after the conversation is re-entered", () => {
    const conversationId = "topic:stream-uuid-1:topic-uuid-1";
    const initial = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "initial-anchor",
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "next-anchor",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId={conversationId}
        firstUnreadUuid="initial-anchor"
        unreadCount={2}
      />,
    );

    initial.rerender(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({ uuid: "initial-anchor", read: true }),
          createWorkspaceMessage({
            uuid: "next-anchor",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId={conversationId}
        firstUnreadUuid="next-anchor"
        unreadCount={1}
      />,
    );

    initial.unmount();

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({ uuid: "initial-anchor", read: true }),
          createWorkspaceMessage({
            uuid: "next-anchor",
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId={conversationId}
        firstUnreadUuid="next-anchor"
        unreadCount={1}
      />,
    );

    const unreadDivider = container.querySelector<HTMLElement>("[data-unread-divider='true']");
    const nextAnchor = container.querySelector<HTMLElement>("[data-message-uuid='next-anchor']");

    expect(unreadDivider?.nextElementSibling as HTMLElement | null).toContainElement(nextAnchor);
  });

  it("does not create an unread divider for messages received after entering a read chat", () => {
    const { container, rerender } = render(
      <WorkspaceMessageList
        messages={[createWorkspaceMessage({ uuid: "read-message", read: true })]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        unreadCount={0}
      />,
    );

    rerender(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({ uuid: "read-message", read: true }),
          createWorkspaceMessage({ uuid: "new-unread-message" }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        firstUnreadUuid="new-unread-message"
        unreadCount={1}
      />,
    );

    expect(container.querySelector("[data-unread-divider='true']")).not.toBeInTheDocument();
  });

  it("dismisses the divider only after a user scroll passes its boundary", async () => {
    const { container } = render(
      <WorkspaceMessageList
        messages={[createWorkspaceMessage({ uuid: "unread-anchor" })]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        firstUnreadUuid="unread-anchor"
        unreadCount={1}
      />,
    );

    const feed = container.querySelector("[role='feed']");
    const unreadDivider = container.querySelector<HTMLElement>("[data-unread-divider='true']");

    if (feed == null || unreadDivider == null) {
      throw new Error("Unread divider test nodes were not found");
    }

    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 100 });
    vi.spyOn(feed, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 100,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(unreadDivider, "getBoundingClientRect").mockReturnValue({
      top: -20,
      bottom: -1,
      left: 0,
      right: 100,
      width: 100,
      height: 19,
      x: 0,
      y: -20,
      toJSON: () => ({}),
    });

    expect(unreadDivider).toBeInTheDocument();

    fireEvent.wheel(feed, { deltaY: 120 });

    await waitFor(() => {
      expect(container.querySelector("[data-unread-divider='true']")).not.toBeInTheDocument();
    });
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
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(link!);

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockRestore();
  });

  it("keeps Workspace message permalinks as internal links", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const workspaceMessageUuid = "11111111-1111-4111-8111-111111111111";
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-permalink-message",
            markdown: `[jump](https://workspace.example/org/org-a/project/project-a/message/${workspaceMessageUuid})`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const link = container.querySelector<HTMLAnchorElement>(
      `[data-workspace-message-link='true'][href='https://workspace.example/org/org-a/project/project-a/message/${workspaceMessageUuid}']`,
    );

    expect(link).toHaveAttribute("data-workspace-message-uuid", workspaceMessageUuid);
    expect(link).not.toHaveAttribute("target");

    link?.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link!);

    expect(openSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it("opens canonical Workspace URN entities through UUID callbacks", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const messageUuid = "22222222-2222-4222-8222-222222222222";
    const onOpenMentionUser = vi.fn();
    const onOpenMessageInChat = vi.fn();
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-urn-entities-message",
            markdown: `> [Alice](urn:user:${userUuid}) [jump](urn:message:${messageUuid}):\n> quoted`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onOpenMentionUser, onOpenMessageInChat }}
      />,
    );

    const mention = container.querySelector<HTMLElement>("[data-workspace-mention='true']");
    const messageLink = container.querySelector<HTMLAnchorElement>(
      "[data-workspace-message-link='true']",
    );

    expect(mention).toHaveAttribute("data-workspace-user-uuid", userUuid);
    expect(messageLink).toHaveAttribute("data-workspace-message-uuid", messageUuid);

    fireEvent.click(mention!);
    fireEvent.click(messageLink!);

    expect(onOpenMentionUser).toHaveBeenCalledWith(userUuid);
    expect(onOpenMessageInChat).toHaveBeenCalledWith(messageUuid);
  });

  it("opens stream and topic URNs through the Workspace reference callback", () => {
    const streamUuid = "33333333-3333-4333-8333-333333333333";
    const topicUuid = "44444444-4444-4444-8444-444444444444";
    const onOpenWorkspaceReference = vi.fn();
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-conversation-urn-message",
            markdown: `[general](urn:stream:${streamUuid}) [Bugs](urn:topic:${streamUuid}:${topicUuid})`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onOpenWorkspaceReference }}
      />,
    );

    const references = container.querySelectorAll<HTMLElement>("[data-workspace-reference='true']");

    expect(references).toHaveLength(2);
    expect(references[0]).toHaveAttribute("data-workspace-reference-kind", "stream");
    expect(references[0]).toHaveAttribute("data-workspace-stream-uuid", streamUuid);
    expect(references[1]).toHaveAttribute("data-workspace-reference-kind", "topic");
    expect(references[1]).toHaveAttribute("data-workspace-topic-uuid", topicUuid);

    fireEvent.click(references[0]!);
    fireEvent.click(references[1]!);

    expect(onOpenWorkspaceReference).toHaveBeenNthCalledWith(1, {
      kind: "stream",
      streamUuid,
    });
    expect(onOpenWorkspaceReference).toHaveBeenNthCalledWith(2, {
      kind: "topic",
      streamUuid,
      topicUuid,
    });
  });

  it("opens a canonical topic URN through the Workspace reference callback", () => {
    const topicUuid = "44444444-4444-4444-8444-444444444444";
    const onOpenWorkspaceReference = vi.fn();
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-canonical-topic-urn-message",
            markdown: `[Bugs](urn:topic:${topicUuid})`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onOpenWorkspaceReference }}
      />,
    );

    const reference = container.querySelector<HTMLAnchorElement>("a[href]");

    expect(reference).not.toBeNull();
    expect(reference).toHaveAttribute("data-workspace-reference", "true");
    expect(reference).toHaveAttribute("data-workspace-reference-kind", "topic");
    expect(reference).toHaveAttribute("data-workspace-topic-uuid", topicUuid);
    expect(reference).not.toHaveAttribute("data-workspace-stream-uuid");

    fireEvent.click(reference!);

    expect(onOpenWorkspaceReference).toHaveBeenCalledWith({
      kind: "topic",
      topicUuid,
    });
  });

  it("keeps a Workspace conversation reference safe when no open callback is wired", () => {
    const streamUuid = "55555555-5555-4555-8555-555555555555";
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-conversation-urn-without-callback",
            markdown: `[general](urn:stream:${streamUuid})`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const reference = container.querySelector<HTMLElement>("[data-workspace-reference='true']");
    const initialHash = window.location.hash;

    expect(reference).toHaveAttribute("href", `#workspace-reference-stream-${streamUuid}`);
    fireEvent.click(reference!);

    expect(window.location.hash).toBe(initialHash);
  });

  it("does not render dangerous protocols as navigable links", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "dangerous-link-message",
            markdown: [
              "[data](data:text/html;base64,PHNjcmlwdD4=)",
              "[file](file:///etc/passwd)",
              "[blob](blob:https://example.com/id)",
              "[js](javascript:alert(1))",
              "[protocol-relative](//evil.example/path)",
            ].join(" "),
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
      />,
    );

    const body = container.querySelector("[data-message-body='true']");

    expect(body).toHaveTextContent("data file blob js protocol-relative");
    expect(body?.querySelector("a[href]")).not.toBeInTheDocument();

    fireEvent.click(body!);

    expect(openSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it("downloads Workspace attachment references through UUID-based file action", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const onDownloadFile = vi.fn();
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-attachment-message",
            markdown: `[report.pdf](urn:file:${fileUuid}?name=report.pdf)`,
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
    expect(attachment).toHaveAttribute("title", "Файл: report.pdf");
    expect(attachment).not.toHaveAttribute("href");
    expect(container).not.toHaveTextContent(`urn:file:${fileUuid}`);
    expect(container.innerHTML).not.toContain("/api/workspace/v1/messenger/files");
    expect(
      container.querySelector(`[${["data", "message", "id"].join("-")}]`),
    ).not.toBeInTheDocument();

    fireEvent.click(attachment);

    expect(openSpy).not.toHaveBeenCalled();
    expect(onDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "attachment",
        fileUuid,
        name: "report.pdf",
      }),
    );
    expect(article).toHaveAttribute("data-message-uuid", "workspace-attachment-message");

    openSpy.mockRestore();
  });

  it("activates Workspace attachment placeholders with Enter and Space", () => {
    const onDownloadFile = vi.fn();
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-keyboard-attachment-message",
            markdown: `[report.pdf](urn:file:${fileUuid}?name=report.pdf)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onDownloadFile }}
      />,
    );

    const attachment = screen.getByRole("button", { name: "Файл: report.pdf" });

    fireEvent.keyDown(attachment, { key: "Enter" });
    fireEvent.keyDown(attachment, { key: " " });

    expect(onDownloadFile).toHaveBeenCalledTimes(2);
    expect(onDownloadFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: "attachment", fileUuid, name: "report.pdf" }),
    );
    expect(onDownloadFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: "attachment", fileUuid, name: "report.pdf" }),
    );
  });

  it("does not start a duplicate Workspace file download while the callback is active", async () => {
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    const resolveDownloads: (() => void)[] = [];
    const onDownloadFile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDownloads.push(resolve);
        }),
    );
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-duplicate-attachment-message",
            markdown: `[report.pdf](urn:file:${fileUuid}?name=report.pdf)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onDownloadFile }}
      />,
    );

    const attachment = screen.getByRole("button", { name: "Файл: report.pdf" });

    fireEvent.click(attachment);
    fireEvent.click(attachment);

    expect(onDownloadFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDownloads[0]?.();
      await Promise.resolve();
    });

    fireEvent.click(attachment);

    expect(onDownloadFile).toHaveBeenCalledTimes(2);
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
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
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
    expect(media).not.toHaveAttribute("href");
    expect(
      container.querySelector("img.workspace-message-file-placeholder__image"),
    ).toHaveAttribute("src", AUTH_IMAGE_PLACEHOLDER_SRC);
    expect(container.innerHTML).not.toContain(`urn:image:${fileUuid}`);
    expect(container.innerHTML).not.toContain("/api/workspace/v1/messenger/files");

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

  it("opens Workspace image media through the viewer callback when available", () => {
    const onDownloadFile = vi.fn();
    const onOpenWorkspaceMedia = vi.fn();
    const fileUuid = "44444444-4444-4444-8444-444444444444";
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-viewer-message",
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onDownloadFile, onOpenWorkspaceMedia }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Изображение" }));

    expect(onOpenWorkspaceMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "media",
        fileUuid,
        name: "screen.png",
        mediaKind: "image",
        contentType: "image/png",
      }),
      {
        items: [
          {
            messageUuid: "workspace-media-viewer-message",
            file: expect.objectContaining({
              fileUuid,
              name: "screen.png",
              mediaKind: "image",
            }),
          },
        ],
        startIndex: 0,
      },
    );
    expect(onDownloadFile).not.toHaveBeenCalled();
  });

  it("opens a Workspace image gallery with all conversation images and clicked index", () => {
    const onOpenWorkspaceMedia = vi.fn();
    const firstFileUuid = "11111111-1111-4111-8111-111111111111";
    const secondFileUuid = "22222222-2222-4222-8222-222222222222";
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-gallery-first-message",
            markdown: `![first.png](urn:image:${firstFileUuid}?name=first.png&content_type=image%2Fpng)`,
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "workspace-gallery-second-message",
            markdown: `![second.png](urn:image:${secondFileUuid}?name=second.png&content_type=image%2Fpng)`,
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onOpenWorkspaceMedia }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Изображение" })[1]!);

    expect(onOpenWorkspaceMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUuid: secondFileUuid,
        name: "second.png",
      }),
      {
        items: [
          {
            messageUuid: "workspace-gallery-first-message",
            file: expect.objectContaining({
              fileUuid: firstFileUuid,
              name: "first.png",
            }),
          },
          {
            messageUuid: "workspace-gallery-second-message",
            file: expect.objectContaining({
              fileUuid: secondFileUuid,
              name: "second.png",
            }),
          },
        ],
        startIndex: 1,
      },
    );
  });

  it("dedupes Workspace gallery images by fileUuid while preserving first occurrence", () => {
    const onOpenWorkspaceMedia = vi.fn();
    const fileUuid = "33333333-3333-4333-8333-333333333333";
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-gallery-original-message",
            markdown: `![original.png](urn:image:${fileUuid}?name=original.png&content_type=image%2Fpng)`,
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "workspace-gallery-duplicate-message",
            markdown: `![duplicate.png](urn:image:${fileUuid}?name=duplicate.png&content_type=image%2Fpng)`,
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onOpenWorkspaceMedia }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Изображение" })[1]!);

    expect(onOpenWorkspaceMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUuid,
        name: "duplicate.png",
      }),
      {
        items: [
          {
            messageUuid: "workspace-gallery-original-message",
            file: expect.objectContaining({
              fileUuid,
              name: "original.png",
            }),
          },
        ],
        startIndex: 0,
      },
    );
  });

  it("does not collect Workspace gallery items from plain rendered text", () => {
    const onOpenWorkspaceMedia = vi.fn();
    const fakeFileUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const realFileUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-gallery-code-message",
            markdown: `\`urn:image:${fakeFileUuid}?name=fake.png&content_type=image%2Fpng\``,
            createdAt: "2026-07-03T09:00:00.000Z",
          }),
          createWorkspaceMessage({
            uuid: "workspace-gallery-real-message",
            markdown: `![real.png](urn:image:${realFileUuid}?name=real.png&content_type=image%2Fpng)`,
            createdAt: "2026-07-03T09:01:00.000Z",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onOpenWorkspaceMedia }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Изображение" }));

    expect(onOpenWorkspaceMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUuid: realFileUuid,
      }),
      {
        items: [
          {
            messageUuid: "workspace-gallery-real-message",
            file: expect.objectContaining({
              fileUuid: realFileUuid,
            }),
          },
        ],
        startIndex: 0,
      },
    );
    expect(onOpenWorkspaceMedia).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fileUuid: fakeFileUuid,
      }),
      expect.anything(),
    );
  });

  it("loads Workspace image previews through an authorized blob loader", async () => {
    const fileUuid = "44444444-4444-4444-8444-444444444444";
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-image-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );
    const { container, unmount } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-preview-message",
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    const placeholder = screen.getByRole("button", { name: "Изображение" });

    expect(onLoadWorkspaceFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "media",
        fileUuid,
        name: "screen.png",
        mediaKind: "image",
        contentType: "image/png",
      }),
      expect.any(AbortSignal),
    );
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(container.querySelector("img[data-workspace-file-preview='true']")).not.toBeNull();
    });
    const previewImage = container.querySelector<HTMLImageElement>(
      "img[data-workspace-file-preview='true']",
    );
    expect(previewImage).not.toBeNull();
    expect(previewImage).toHaveAttribute("loading", "eager");

    const image = await screen.findByRole("img", { name: "screen.png" });
    expect(image).toHaveClass("message-media-preview");
    expect(image).toHaveClass("workspace-message-file-preview-image");
    expect(image).toHaveAttribute("src", "blob:workspace-image-preview");
    expect(image).not.toHaveAttribute("aria-hidden");
    expect(image).not.toHaveAttribute("data-workspace-preview-pending");
    expect(placeholder).toHaveAttribute("data-workspace-preview-status", "loaded");
    expect(placeholder).toHaveClass("workspace-message-file-preview-loaded");
    expect(placeholder.querySelectorAll("img:not([hidden])")).toHaveLength(1);
    const upgradedPlaceholderImage = placeholder.querySelector(
      "img.workspace-message-file-placeholder__image",
    );
    expect(upgradedPlaceholderImage).toBe(image);
    expect(upgradedPlaceholderImage).not.toHaveAttribute("hidden");
    expect(upgradedPlaceholderImage).toHaveAttribute("src", "blob:workspace-image-preview");
    expect(container.innerHTML).not.toContain(`urn:image:${fileUuid}`);
    expect(container.innerHTML).not.toContain("/api/workspace/v1/messenger/files");

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-image-preview");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("loads Workspace image preview when download blob has octet-stream MIME", async () => {
    const fileUuid = "44444444-4444-4444-8444-444444444444";
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      expect(value).toBeInstanceOf(Blob);
      expect((value as Blob).type).toBe("image/png");
      return "blob:workspace-image-preview";
    });
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "application/octet-stream",
      }),
    );
    const { container, unmount } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-preview-octet-stream-message",
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img[data-workspace-file-preview='true']")).not.toBeNull();
    });

    const image = container.querySelector<HTMLImageElement>(
      "img[data-workspace-file-preview='true']",
    );
    expect(image).toHaveAttribute("src", "blob:workspace-image-preview");

    unmount();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("revokes a Workspace preview URL only once when image fallback runs before unmount", async () => {
    const fileUuid = "44444444-4444-4444-8444-444444444444";
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-fallback-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );
    const { container, unmount } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-preview-fallback-cleanup-message",
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img[data-workspace-file-preview='true']")).not.toBeNull();
    });

    const previewImage = container.querySelector<HTMLImageElement>(
      "img[data-workspace-file-preview='true']",
    );
    expect(previewImage).not.toBeNull();

    fireEvent.error(previewImage!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Изображение" })).toHaveAttribute(
        "data-workspace-preview-status",
        "error",
      );
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-fallback-preview");

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("defers Workspace image preview loading until the placeholder enters the viewport", async () => {
    const observers: DeferredIntersectionObserver[] = [];
    const disconnect = vi.fn();

    class DeferredIntersectionObserver implements IntersectionObserver {
      readonly root: Element | Document | null = null;
      readonly rootMargin: string;
      readonly scrollMargin = "";
      readonly thresholds: readonly number[] = [];
      readonly callback: IntersectionObserverCallback;
      observedElement: Element | null = null;
      observe = vi.fn((element: Element) => {
        this.observedElement = element;
      });
      unobserve = vi.fn();
      disconnect = disconnect;
      takeRecords = vi.fn((): IntersectionObserverEntry[] => []);

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.callback = callback;
        this.rootMargin = options?.rootMargin ?? "";
        observers.push(this);
      }
    }

    vi.stubGlobal("IntersectionObserver", DeferredIntersectionObserver);

    const fileUuid = "44444444-4444-4444-8444-444444444444";
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-image-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );
    const { container, unmount } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-preview-message",
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    const placeholder = screen.getByRole("button", { name: "Изображение" });

    expect(placeholder).toHaveAttribute("data-workspace-preview-status", "queued");
    const observer = observers.find((candidate) => candidate.observedElement === placeholder);
    expect(observer).not.toBeUndefined();
    expect(observer?.observe).toHaveBeenCalledWith(placeholder);
    expect(onLoadWorkspaceFilePreview).not.toHaveBeenCalled();

    act(() => {
      observer?.callback(
        [
          {
            boundingClientRect: placeholder.getBoundingClientRect(),
            intersectionRect: placeholder.getBoundingClientRect(),
            isIntersecting: true,
            intersectionRatio: 1,
            rootBounds: null,
            target: placeholder,
            time: 1,
          },
        ],
        observer,
      );
    });

    await waitFor(() => {
      expect(onLoadWorkspaceFilePreview).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(container.querySelector("img[data-workspace-file-preview='true']")).not.toBeNull();
    });

    expect(disconnect).toHaveBeenCalled();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-image-preview");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("keeps Workspace image preview mounted when file references rebuild with the same file key", async () => {
    const fileUuid = "44444444-4444-4444-8444-444444444444";
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-stable-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );
    const message = createWorkspaceMessage({
      uuid: "workspace-media-stable-preview-message",
      markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
    });
    const { container, rerender, unmount } = render(
      <WorkspaceMessageList
        messages={[message]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveMention={() => null}
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img[data-workspace-file-preview='true']")).not.toBeNull();
    });
    const previewImage = container.querySelector<HTMLImageElement>(
      "img[data-workspace-file-preview='true']",
    );
    expect(previewImage).not.toBeNull();
    expect(onLoadWorkspaceFilePreview).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceMessageList
        messages={[message]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveMention={() => null}
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    expect(container.querySelector("img[data-workspace-file-preview='true']")).toBe(previewImage);
    expect(onLoadWorkspaceFilePreview).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-stable-preview");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("cleans the old Workspace image preview when the runtime loader callback changes", async () => {
    const fileUuid = "44444444-4444-4444-8444-444444444444";
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-old-loader-preview")
      .mockReturnValueOnce("blob:workspace-new-loader-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const firstLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );
    const secondLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["next-image-bytes"], {
        type: "image/png",
      }),
    );
    const message = createWorkspaceMessage({
      uuid: "workspace-media-loader-stable-preview-message",
      markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
    });
    const { container, rerender, unmount } = render(
      <WorkspaceMessageList
        messages={[message]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview: firstLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img[data-workspace-file-preview='true']")).not.toBeNull();
    });
    const previewImage = container.querySelector<HTMLImageElement>(
      "img[data-workspace-file-preview='true']",
    );
    expect(previewImage).not.toBeNull();
    expect(firstLoadWorkspaceFilePreview).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceMessageList
        messages={[message]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview: secondLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(secondLoadWorkspaceFilePreview).toHaveBeenCalledTimes(1);
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-old-loader-preview");
    expect(container.querySelector("img[data-workspace-file-preview='true']")).toBe(previewImage);
    expect(container.querySelector("img[data-workspace-file-preview='true']")).toHaveAttribute(
      "src",
      "blob:workspace-new-loader-preview",
    );
    expect(container.querySelector("img[src='blob:workspace-old-loader-preview']")).toBeNull();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-new-loader-preview");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("recreates Workspace image preview when the file UUID changes", async () => {
    const firstFileUuid = "44444444-4444-4444-8444-444444444444";
    const secondFileUuid = "77777777-7777-4777-8777-777777777777";
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-first-preview")
      .mockReturnValueOnce("blob:workspace-second-preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );
    const { container, rerender, unmount } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-changing-preview-message",
            markdown: `![screen.png](urn:image:${firstFileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    expect(container.querySelector("img[data-workspace-file-preview='true']")).toHaveAttribute(
      "src",
      "blob:workspace-first-preview",
    );

    rerender(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-changing-preview-message",
            markdown: `![screen.png](urn:image:${secondFileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-first-preview");
    expect(container.querySelector("img[data-workspace-file-preview='true']")).toHaveAttribute(
      "src",
      "blob:workspace-second-preview",
    );
    expect(onLoadWorkspaceFilePreview).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fileUuid: firstFileUuid }),
      expect.any(AbortSignal),
    );
    expect(onLoadWorkspaceFilePreview).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fileUuid: secondFileUuid }),
      expect.any(AbortSignal),
    );

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-second-preview");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("keeps Workspace image preview source on blob URL when the loader knows a backend URL", async () => {
    const fileUuid = "55555555-5555-4555-8555-555555555555";
    const backendUrl = `/api/workspace/v1/messenger/files/${fileUuid}/actions/download`;
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-safe");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(new Blob([backendUrl]));

    const { container, unmount } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-safe-src-message",
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onLoadWorkspaceFilePreview }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img[data-workspace-file-preview='true']")).not.toBeNull();
    });
    const previewImage = container.querySelector<HTMLImageElement>(
      "img[data-workspace-file-preview='true']",
    );
    expect(previewImage).not.toBeNull();

    const image = await screen.findByRole("img", { name: "screen.png" });

    expect(image.getAttribute("src")).toBe("blob:workspace-safe");
    expect(image.getAttribute("src")).not.toContain("/api/workspace/v1/messenger/files");

    unmount();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("falls back to downloadable Workspace media placeholder when preview load fails", async () => {
    const onDownloadFile = vi.fn();
    const onLoadWorkspaceFilePreview = vi.fn().mockRejectedValue(new Error("preview failed"));
    const fileUuid = "66666666-6666-4666-8666-666666666666";
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-media-preview-failed-message",
            markdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onDownloadFile, onLoadWorkspaceFilePreview }}
      />,
    );

    const placeholder = screen.getByRole("button", { name: "Изображение" });

    await waitFor(() => {
      expect(placeholder).toHaveAttribute("data-workspace-preview-status", "error");
    });
    expect(screen.queryByRole("img", { name: "screen.png" })).not.toBeInTheDocument();

    fireEvent.click(placeholder);

    expect(onDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "media",
        fileUuid,
        name: "screen.png",
        mediaKind: "image",
        contentType: "image/png",
      }),
    );
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

  it("opens unresolved canonical UUID Workspace mentions through the UUID callback", () => {
    const onOpenMentionUser = vi.fn();
    const userUuid = "33333333-3333-4333-8333-333333333333";
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "unresolved-canonical-mention-message",
            markdown: `Привет <@${userUuid}>`,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveMention={() => null}
        actions={{ onOpenMentionUser }}
      />,
    );

    const mention = screen.getByRole("button", { name: `@${userUuid}` });

    expect(mention).toHaveAttribute("data-workspace-user-uuid", userUuid);
    expect(mention).not.toHaveAttribute("data-user-id");

    fireEvent.click(mention);

    expect(onOpenMentionUser).toHaveBeenCalledWith(userUuid);
    expect(container.querySelector("[data-user-id]")).not.toBeInTheDocument();
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

  it("renders Workspace reaction chips inside the message bubble", () => {
    const onToggleMessageReaction = vi.fn();

    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "reaction-chip-message",
            markdown: "Reacted text",
            reactions: { "👍": 1 },
            ownReactionUuidsByEmojiName: { "👍": "reaction-uuid-1" },
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onToggleMessageReaction }}
      />,
    );

    const article = container.querySelector("[data-message-uuid='reaction-chip-message']");
    const reactionChip = article?.querySelector("[data-workspace-message-reaction-chip='true']");
    const reactionFooter = article?.querySelector(
      "[data-workspace-message-reaction-footer='true']",
    );
    const messageTime = article?.querySelector("[data-message-time='true']");

    expect(reactionChip).toBeInTheDocument();
    expect(reactionChip).toHaveTextContent("👍");
    expect(reactionChip).toHaveTextContent("1");
    expect(reactionFooter).toContainElement(reactionChip as HTMLElement);
    expect(reactionFooter).toContainElement(messageTime as HTMLElement);

    fireEvent.click(reactionChip!);

    expect(onToggleMessageReaction).toHaveBeenCalledWith("reaction-chip-message", "👍");
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
    expect(onToggleMessageReaction).toHaveBeenCalledWith("own-menu-message", "👍");
  });

  it("sends native emoji from the Workspace reaction picker", async () => {
    const onToggleMessageReaction = vi.fn();

    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "picker-reaction-message",
            markdown: "Picker reaction message",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{ onToggleMessageReaction }}
      />,
    );

    openWorkspaceMessageMenu();
    fireEvent.click(screen.getByLabelText("More reactions"));
    fireEvent.click(await screen.findByRole("button", { name: "Pick emoji" }));

    expect(onToggleMessageReaction).toHaveBeenCalledWith("picker-reaction-message", "😀");
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
    const onAddReplyMessage = vi.fn();
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
          onAddReplyMessage,
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
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add reply" }));
    expect(onAddReplyMessage).toHaveBeenCalledWith("selected-callback-message", "selected phrase");

    selectMessageBodyText(container, "selected-callback-message", "selected phrase");
    fireEvent.contextMenu(bubble!, { clientX: 120, clientY: 80 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy text" }));
    expect(onCopyMessageText).toHaveBeenCalledWith("selected-callback-message", "selected phrase");
  });

  it("groups Workspace menu actions with old divider order", async () => {
    render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "divider-order-message",
            authorUuid: "current-user-uuid",
            userUuid: "current-user-uuid",
            isOwn: true,
            markdown: "Divider order body",
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        actions={{
          onReplyMessage: vi.fn(),
          onAddReplyMessage: vi.fn(),
          onForwardMessage: vi.fn(),
          onToggleMessageSelection: vi.fn(),
          onEditMessage: vi.fn(),
          onRequestDeleteMessage: vi.fn(),
          onToggleMessageReaction: vi.fn(),
        }}
      />,
    );

    openWorkspaceMessageMenu();

    const menu = await screen.findByRole("menu");
    const actionAndSeparatorNodes = Array.from(
      menu.querySelectorAll('[role="menuitem"], [role="separator"]'),
    );

    expect(
      actionAndSeparatorNodes.map((node) =>
        node.getAttribute("role") === "separator" ? "separator" : node.textContent,
      ),
    ).toEqual([
      "Reply",
      "Add reply",
      "Forward",
      "separator",
      "Copy text",
      "Select",
      "separator",
      "Edit message",
      "Delete",
    ]);
  });

  it("calls Workspace menu callbacks with message uuid", async () => {
    const onReplyMessage = vi.fn();
    const onAddReplyMessage = vi.fn();
    const onForwardMessage = vi.fn();
    const onOpenMessageInChat = vi.fn();
    const onToggleMessageSelection = vi.fn();
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
          onAddReplyMessage,
          onForwardMessage,
          onOpenMessageInChat,
          onToggleMessageSelection,
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
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add reply" }));
    expect(onAddReplyMessage).toHaveBeenCalledWith("uuid-callback-message", undefined);

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Forward" }));
    expect(onForwardMessage).toHaveBeenCalledWith("uuid-callback-message", undefined);

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in chat" }));
    expect(onOpenMessageInChat).toHaveBeenCalledWith("uuid-callback-message");

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy text" }));
    expect(onCopyMessageText).toHaveBeenCalledWith("uuid-callback-message", "Callback body");

    openWorkspaceMessageMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Select" }));
    expect(onToggleMessageSelection).toHaveBeenCalledWith("uuid-callback-message");

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

  it("renders Workspace Jitsi URLs with the old call bubble visual surface", () => {
    const jitsiUrl = "https://meet.workspace.example.com/workspace-design-sync-room";
    const onOpenJitsiCall = vi.fn();
    const { container } = render(
      <WorkspaceMessageList
        messages={[
          createWorkspaceMessage({
            uuid: "workspace-jitsi-message",
            authorUuid: "peer-user-uuid",
            userUuid: "peer-user-uuid",
            isOwn: false,
            markdown: jitsiUrl,
          }),
        ]}
        currentUserUuid="current-user-uuid"
        conversationId="topic:stream-uuid-1:topic-uuid-1"
        resolveAuthorLabel={() => "Bob Reed"}
        actions={{
          jitsiServerBaseUrl: "https://meet.workspace.example.com/jitsi/",
          jitsiLocationName: "Roadmap",
          onOpenJitsiCall,
        }}
      />,
    );

    const jitsiCallButton = screen.getByRole("button", { name: "Join call" });
    const bubble = jitsiCallButton.closest("[data-workspace-message-bubble='true']");
    expect(bubble).toHaveClass("rounded-[18px]");
    expect(bubble).toHaveClass("rounded-bl-[6px]");
    expect(bubble).toHaveClass("bg-msg-call-bg");
    expect(bubble).not.toHaveClass("bg-bg-elevated");
    expect(jitsiCallButton).toHaveTextContent(/workspace design sync room/i);
    expect(jitsiCallButton).toHaveTextContent(/roadmap/i);
    expect(
      screen.getByTestId("workspace-jitsi-call-participants-workspace-jitsi-message"),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-workspace-jitsi-call='true']")).toBeNull();

    fireEvent.click(jitsiCallButton);

    expect(onOpenJitsiCall).toHaveBeenCalledWith(jitsiUrl, "Roadmap");
  });
});
