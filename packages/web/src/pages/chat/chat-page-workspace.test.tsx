import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerBootstrapPayload,
  MessengerMessage,
} from "~/entities/messenger/messenger.types";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { renderWithProviders } from "~/test/render";
import { ChatPage } from "./chat-page.ui";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";
import type { ChatPageMessageListSectionProps } from "./chat-page-message-list-section.types";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "33333333-3333-4333-8333-333333333333";

const captured = vi.hoisted(() => ({
  composerProps: null as ChatPageComposerSectionProps | null,
  messageListProps: null as ChatPageMessageListSectionProps | null,
  oldChatListStore: vi.fn(() => {
    throw new Error("legacy chat-list store must not be used");
  }),
  loadWorkspaceMessages: vi.fn().mockResolvedValue({ status: "applied" }),
}));

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: captured.oldChatListStore,
}));

vi.mock("~/entities/messenger/messenger-messages-loader.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/entities/messenger/messenger-messages-loader.lib")>();
  return {
    ...actual,
    loadMessengerConversationMessages: captured.loadWorkspaceMessages,
  };
});

vi.mock("~/widgets/chat-view/chat-header.ui", () => ({
  ChatHeader: ({ channelName, topic }: { channelName: string; topic?: string }) => (
    <header data-testid="chat-header">
      <span>{channelName}</span>
      {topic != null ? <span>{topic}</span> : null}
    </header>
  ),
}));

vi.mock("./chat-page-message-list-section.ui", () => ({
  ChatPageMessageListSection: (props: ChatPageMessageListSectionProps) => {
    captured.messageListProps = props;
    return (
      <div data-testid="old-message-list-section">
        {props.messages.map((message) => (
          <article key={message.id}>{message.content}</article>
        ))}
      </div>
    );
  },
}));

vi.mock("./chat-page-composer-section.ui", () => ({
  ChatPageComposerSection: (props: ChatPageComposerSectionProps) => {
    captured.composerProps = props;
    return <div data-testid="old-composer-section" />;
  },
}));

function createSession(): WorkspaceAuthSession {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "project-a",
    userUuid: USER_UUID,
    login: "user@example.com",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    runtimeGeneration: 1,
    profile: {
      uuid: USER_UUID,
      username: "alice",
      firstName: "Alice",
      lastName: "Stone",
      email: "alice@example.com",
    },
  };
}

function createBootstrapPayload(): MessengerBootstrapPayload {
  return {
    streams: [
      {
        uuid: STREAM_UUID,
        projectId: "project-a",
        ownerUuid: USER_UUID,
        userUuid: USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        name: "general",
        description: "",
        unreadCount: 1,
        sourceName: "native",
        source: { kind: "native" },
        audience: "channel",
        isPrivate: false,
        inviteOnly: false,
        announce: false,
        isArchived: false,
        directUserUuid: null,
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    streamBindings: [],
    topics: [
      {
        uuid: TOPIC_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_UUID,
        name: "Roadmap",
        unreadCount: 1,
        isDefault: false,
        isDone: false,
        notificationMode: "default",
        lastMessageUuid: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
    conversations: [],
    folders: [],
    users: [
      {
        uuid: USER_UUID,
        username: "alice",
        status: "active",
        firstName: "Alice",
        lastName: "Stone",
        email: "alice@example.com",
        lastPingAt: null,
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
  };
}

function createMessage(): MessengerMessage {
  return {
    uuid: "55555555-5555-4555-8555-555555555555",
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: USER_UUID,
    userUuid: USER_UUID,
    markdown: "workspace message",
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
  };
}

describe("ChatPage Workspace route", () => {
  beforeEach(() => {
    const session = createSession();
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, createBootstrapPayload());
    useWorkspaceMessageStore
      .getState()
      .replaceOrMergeConversationMessagesPage(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
        createMessage(),
      ]);
    captured.composerProps = null;
    captured.messageListProps = null;
    captured.oldChatListStore.mockClear();
    captured.loadWorkspaceMessages.mockClear();
  });

  afterEach(() => {
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    useMessengerStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  it("renders Workspace topic data through the old chat sections", async () => {
    renderWithProviders(<ChatPage />, {
      route: `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    });

    expect(await screen.findByTestId("old-message-list-section")).toBeInTheDocument();
    expect(screen.getByTestId("chat-page")).toHaveClass(
      "max-w-chat-page",
      "flex-1",
      "overflow-hidden",
    );
    expect(screen.getByTestId("old-composer-section")).toBeInTheDocument();
    expect(screen.getByText("workspace message")).toBeInTheDocument();
    expect(screen.getByText("#general")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(captured.messageListProps?.activeTopic).toBe("Roadmap");
    expect(captured.composerProps?.readOnlyReason).toBeUndefined();
    expect(captured.composerProps?.composerCapabilities?.upload?.mode).toBe("unsupported");
    expect(captured.composerProps?.onSend).toEqual(expect.any(Function));
    expect(captured.composerProps?.onSubmitEdit).toEqual(expect.any(Function));
    expect(captured.oldChatListStore).not.toHaveBeenCalled();
    await waitFor(() => expect(captured.loadWorkspaceMessages).toHaveBeenCalledTimes(1));
  });

  it("keeps old chat routes in a controlled Workspace state", () => {
    renderWithProviders(<ChatPage />, {
      route: "/stream/general/topic/roadmap",
    });

    expect(screen.getByText("This chat link is invalid")).toBeInTheDocument();
    expect(captured.composerProps?.readOnlyReason).toBe(
      "Sending is not available from this chat link yet.",
    );
    expect(captured.messageListProps).toBeNull();
    expect(captured.oldChatListStore).not.toHaveBeenCalled();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });
});
