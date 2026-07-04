import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerBootstrapPayload,
  MessengerMessage,
} from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { OpenSearchContext } from "~/shared/contexts/open-search";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import type { ChatHeaderProps } from "~/widgets/chat-view/chat-header.types";
import { ChatPage } from "./chat-page.ui";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";
import type { ChatPageWorkspaceMessageListSectionProps } from "./chat-page-workspace-message-list-section.types";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const DIRECT_STREAM_UUID = "88888888-8888-4888-8888-888888888888";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
const USER_B_UUID = "44444444-4444-4444-8444-444444444444";
const STREAM_BINDING_A_UUID = "66666666-6666-4666-8666-666666666666";
const STREAM_BINDING_B_UUID = "77777777-7777-4777-8777-777777777777";

const captured = vi.hoisted(() => ({
  composerProps: null as ChatPageComposerSectionProps | null,
  headerProps: null as ChatHeaderProps | null,
  messageListProps: null as ChatPageWorkspaceMessageListSectionProps | null,
  oldChatListStore: vi.fn(() => {
    throw new Error("legacy chat-list store must not be used");
  }),
  loadWorkspaceMessages: vi.fn().mockResolvedValue({ status: "applied" }),
  streamBindingsForRoute: vi.fn(),
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

vi.mock("~/entities/messenger/messenger-stream-bindings-loader.lib", () => ({
  useMessengerStreamBindingsForRoute: captured.streamBindingsForRoute,
}));

vi.mock("~/widgets/chat-view/chat-header.ui", () => ({
  ChatHeader: (props: ChatHeaderProps) => {
    captured.headerProps = props;
    return (
      <header data-testid="chat-header">
        <span>{props.channelName}</span>
        {props.topic != null ? <span>{props.topic}</span> : null}
      </header>
    );
  },
}));

vi.mock("./chat-page-workspace-message-list-section.ui", () => ({
  ChatPageWorkspaceMessageListSection: (props: ChatPageWorkspaceMessageListSectionProps) => {
    captured.messageListProps = props;
    return (
      <div data-testid="workspace-message-list-section">
        {props.messages.map((message) => (
          <article key={message.uuid} data-message-uuid={message.uuid}>
            {message.markdown}
          </article>
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
    streamBindings: [
      {
        uuid: STREAM_BINDING_A_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_UUID,
        whoUuid: USER_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
      {
        uuid: STREAM_BINDING_B_UUID,
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        userUuid: USER_B_UUID,
        whoUuid: USER_B_UUID,
        role: "member",
        notificationMode: "all_messages",
        createdAt: "2026-06-30T09:00:00.000Z",
        updatedAt: "2026-06-30T09:00:00.000Z",
      },
    ],
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
  };
}

function createDirectPrivateBootstrapPayload(): MessengerBootstrapPayload {
  const payload = createBootstrapPayload();
  const stream = payload.streams[0]!;

  return {
    ...payload,
    streams: [
      {
        ...stream,
        uuid: DIRECT_STREAM_UUID,
        name: "Bob",
        audience: "private",
        isPrivate: true,
        directUserUuid: USER_B_UUID,
      },
    ],
    streamBindings: [],
    topics: [],
  };
}

function createMessage(): MessengerMessage {
  return {
    uuid: "55555555-5555-4555-8555-555555555555",
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: USER_B_UUID,
    userUuid: USER_B_UUID,
    markdown: "workspace message",
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
  };
}

function renderWorkspaceChatPageWithShellContexts(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <OpenSearchContext.Provider value={vi.fn()}>
        <RightDrawerContext.Provider
          value={{
            open: false,
            setOpen: vi.fn(),
            openInfo: vi.fn(),
            openUserProfile: vi.fn(),
          }}
        >
          <ChatPage />
        </RightDrawerContext.Provider>
      </OpenSearchContext.Provider>
    </MemoryRouter>,
  );
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
    useUsersStore.getState().replaceUsers([
      createUser({
        uuid: USER_UUID,
        full_name: "Alice Stone",
        email: "alice@example.com",
        status: "active",
      }),
      createUser({
        uuid: USER_B_UUID,
        full_name: "Bob Reed",
        email: "bob@example.com",
        status: "idle",
      }),
    ]);
    useWorkspaceMessageStore
      .getState()
      .replaceOrMergeConversationMessagesPage(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
        createMessage(),
      ]);
    captured.composerProps = null;
    captured.headerProps = null;
    captured.messageListProps = null;
    captured.oldChatListStore.mockClear();
    captured.loadWorkspaceMessages.mockClear();
    captured.streamBindingsForRoute.mockClear();
  });

  afterEach(() => {
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  it("renders Workspace topic data through the Workspace-native message section", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(screen.getByTestId("chat-page")).toHaveClass(
      "max-w-chat-page",
      "flex-1",
      "overflow-hidden",
    );
    expect(screen.getByTestId("old-composer-section")).toBeInTheDocument();
    expect(screen.getByText("workspace message")).toBeInTheDocument();
    expect(screen.getByText("#general")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(captured.headerProps).toMatchObject({
      channelName: "#general",
      topic: "Roadmap",
      hideTopic: false,
      participantsCount: 2,
      onlineCount: 1,
      rightPanelOpen: false,
    });
    expect(captured.headerProps?.onOpenSearch).toEqual(expect.any(Function));
    expect(captured.headerProps?.onToggleRightPanel).toEqual(expect.any(Function));
    expect(captured.headerProps?.onOpenRightPanel).toEqual(expect.any(Function));
    expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    expect(captured.messageListProps?.currentUserUuid).toBe(USER_UUID);
    expect(captured.messageListProps?.resolveAuthorLabel?.(USER_B_UUID)).toBe("Bob Reed");
    expect(captured.messageListProps?.messages[0]).toMatchObject({
      uuid: "55555555-5555-4555-8555-555555555555",
      markdown: "workspace message",
    });
    expect(captured.messageListProps?.messages[0]).not.toHaveProperty("id");
    expect(captured.messageListProps?.messages[0]).not.toHaveProperty("content");
    expect(captured.messageListProps?.firstUnreadUuid).toBe("55555555-5555-4555-8555-555555555555");
    expect(captured.messageListProps?.unreadCount).toBe(1);
    expect(captured.messageListProps?.onReplyMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onEditMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onRequestDeleteMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onCopyMessageText).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onToggleMessageReaction).toEqual(expect.any(Function));
    expect(captured.composerProps?.readOnlyReason).toBeUndefined();
    expect(captured.composerProps?.composerCapabilities?.upload?.mode).toBe("unsupported");
    expect(captured.composerProps?.onSend).toEqual(expect.any(Function));
    expect(captured.composerProps?.onSubmitEdit).toEqual(expect.any(Function));
    expect(captured.oldChatListStore).not.toHaveBeenCalled();
    expect(captured.streamBindingsForRoute).toHaveBeenCalledWith({
      route: {
        kind: "topic",
        orgId: "org-a",
        projectId: "project-a",
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      },
    });
    await waitFor(() => expect(captured.loadWorkspaceMessages).toHaveBeenCalledTimes(1));
  });

  it("maps Workspace direct private header view to old dmPartner header props", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
    );

    expect(await screen.findByTestId("chat-header")).toBeInTheDocument();
    expect(captured.headerProps?.dmPartner).toEqual({
      name: "Bob Reed",
      avatarUrl: null,
      presenceState: "idle",
    });
    expect(captured.headerProps?.hideParticipants).toBe(true);
    expect(captured.headerProps).not.toHaveProperty("participantsCount");
    expect(captured.headerProps).not.toHaveProperty("onlineCount");
    expect(captured.oldChatListStore).not.toHaveBeenCalled();
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
