import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDownloadStore } from "~/entities/download/download.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerOutboxStore } from "~/entities/messenger/messenger-outbox.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type {
  MessengerBootstrapPayload,
  MessengerMessage,
} from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { t } from "~/i18n/i18n";
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
const MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";
const SECOND_MESSAGE_UUID = "99999999-9999-4999-8999-999999999991";
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
  downloadWorkspaceFile: vi.fn(),
  uploadWorkspaceFile: vi.fn(),
  sendMessengerMessage: vi.fn(),
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

vi.mock("~/shared/api/messenger-files.api", () => ({
  downloadWorkspaceFile: captured.downloadWorkspaceFile,
  uploadWorkspaceFile: captured.uploadWorkspaceFile,
}));

vi.mock("~/entities/messenger/messenger-message-actions.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/entities/messenger/messenger-message-actions.lib")>();
  return {
    ...actual,
    sendMessengerMessage: captured.sendMessengerMessage,
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
        {props.outgoingMessages?.map((message) => (
          <article key={message.localId} data-outgoing-message-id={message.localId}>
            {message.markdown}:{message.status}
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
    uuid: MESSAGE_UUID,
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

function createSecondMessage(): MessengerMessage {
  return {
    ...createMessage(),
    uuid: SECOND_MESSAGE_UUID,
    markdown: "second workspace message",
    createdAt: "2026-06-30T10:01:00.000Z",
    updatedAt: "2026-06-30T10:01:00.000Z",
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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
    useMessengerOutboxStore.getState().clear();
    captured.composerProps = null;
    captured.headerProps = null;
    captured.messageListProps = null;
    captured.oldChatListStore.mockClear();
    captured.loadWorkspaceMessages.mockClear();
    captured.downloadWorkspaceFile.mockReset();
    captured.downloadWorkspaceFile.mockResolvedValue({
      blob: new Blob(["workspace file"], { type: "text/plain" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="workspace-report.txt"',
        "content-length": "14",
      }),
    });
    captured.uploadWorkspaceFile.mockReset();
    captured.uploadWorkspaceFile.mockResolvedValue({
      uuid: "99999999-9999-4999-8999-999999999999",
      name: "workspace-report.txt",
      content_type: "text/plain",
      size_bytes: 14,
    });
    captured.sendMessengerMessage.mockReset();
    captured.sendMessengerMessage.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      message: null,
    });
    useWorkspaceForwardMessageStore.getState().reset();
    captured.streamBindingsForRoute.mockClear();
    useDownloadStore.getState().clearDownloads();
  });

  afterEach(() => {
    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useMessengerOutboxStore.getState().clear();
    useDownloadStore.getState().clearDownloads();
    useMediaViewerStore.getState().close();
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
    expect(captured.messageListProps?.resolveMention?.("Bob Reed")).toMatchObject({
      userUuid: USER_B_UUID,
      displayText: "Bob Reed",
    });
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
    expect(captured.messageListProps?.onOpenMessageInChat).toBeUndefined();
    expect(captured.messageListProps?.onToggleMessageReaction).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onDownloadFile).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenUnsupportedFilePreview).toEqual(expect.any(Function));
    expect(captured.composerProps?.readOnlyReason).toBeUndefined();
    expect(captured.composerProps?.composerCapabilities?.upload?.mode).toBe("enabled");
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

  it("adds a local outgoing row before Workspace send resolves", async () => {
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.onSend).toEqual(expect.any(Function)));
    act(() => {
      void captured.composerProps?.onSend("fast local text", "");
    });

    await waitFor(() => {
      expect(captured.messageListProps?.outgoingMessages?.[0]).toEqual(
        expect.objectContaining({
          markdown: "fast local text",
          status: "sending",
        }),
      );
    });
    expect(captured.messageListProps?.outgoingMessages?.[0]?.localId).toMatch(/^outgoing:/);

    act(() => {
      sendRequest.resolve({
        status: "applied",
        ownerKey: "owner-key",
        message: {
          ...createMessage(),
          uuid: "server-message-uuid",
          authorUuid: USER_UUID,
          userUuid: USER_UUID,
          isOwn: true,
        },
      });
    });

    await waitFor(() => {
      expect(captured.messageListProps?.outgoingMessages?.[0]).toEqual(
        expect.objectContaining({
          localId: expect.stringMatching(/^outgoing:/),
          status: "sent",
          resolvedServerMessageUuid: "server-message-uuid",
        }),
      );
    });
  });

  it("uploads composer files before Workspace send and appends logical markdown refs", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const pdfFile = new File(["pdf"], 'report<>:"q1?.pdf', { type: "application/pdf" });
    const imageFile = new File([pngBytes], "screen.png", { type: "image/png" });
    captured.uploadWorkspaceFile
      .mockResolvedValueOnce({
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "report.pdf",
        content_type: "application/pdf",
        size_bytes: 3,
      })
      .mockResolvedValueOnce({
        uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "screen.png",
        content_type: "image/png",
        size_bytes: 8,
      });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.onSend).toEqual(expect.any(Function)));
    await act(async () => {
      await captured.composerProps?.onSend("  hello  ", "", [pdfFile, imageFile]);
    });

    await waitFor(() => expect(captured.uploadWorkspaceFile).toHaveBeenCalledTimes(2));
    expect(captured.uploadWorkspaceFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        accessToken: "access-token",
        devTargetOrigin: "https://org-a.example.com",
        projectId: "project-a",
        signal: expect.any(AbortSignal),
      }),
      {
        file: pdfFile,
        streamUuid: STREAM_UUID,
      },
    );
    expect(captured.uploadWorkspaceFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
      {
        file: imageFile,
        streamUuid: STREAM_UUID,
      },
    );
    await waitFor(() =>
      expect(captured.sendMessengerMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          streamUuid: STREAM_UUID,
          topicUuid: TOPIC_UUID,
          markdown:
            "hello\n[report____q1_.pdf](workspace-file://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?content_type=application%2Fpdf)\n![screen.png](workspace-file://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?content_type=image%2Fpng)",
        }),
      ),
    );
    expect(captured.sendMessengerMessage.mock.calls[0]?.[0].markdown).not.toContain("/files/");
    expect(captured.sendMessengerMessage.mock.calls[0]?.[0].markdown).not.toContain(
      "/user_uploads",
    );
    await waitFor(() => expect(captured.composerProps?.uploadProgress).toBeNull());
  });

  it("does not send Workspace message when composer file upload fails", async () => {
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    captured.uploadWorkspaceFile.mockRejectedValueOnce(new Error("upload failed"));

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.onSend).toEqual(expect.any(Function)));
    await act(async () => {
      await captured.composerProps?.onSend("hello", "", [file]);
    });

    await waitFor(() => {
      expect(captured.messageListProps?.outgoingMessages?.[0]).toEqual(
        expect.objectContaining({
          markdown: "hello",
          status: "failed",
          error: "upload failed",
        }),
      );
    });
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("aborts an in-flight Workspace upload when the runtime context changes", async () => {
    const file = new File(["workspace file"], "report.txt", { type: "text/plain" });
    let uploadSignal: AbortSignal | undefined;
    captured.uploadWorkspaceFile.mockImplementation((requestOptions: { signal?: AbortSignal }) => {
      uploadSignal = requestOptions.signal;
      return new Promise((_, reject) => {
        requestOptions.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.onSend).toEqual(expect.any(Function)));
    act(() => {
      void captured.composerProps?.onSend("hello", "", [file]);
    });

    await waitFor(() => {
      expect(captured.uploadWorkspaceFile).toHaveBeenCalledTimes(1);
      expect(uploadSignal).toBeInstanceOf(AbortSignal);
      expect(uploadSignal?.aborted).toBe(false);
    });

    act(() => {
      const nextSession = {
        ...createSession(),
        accessToken: "next-access-token",
        runtimeGeneration: 2,
      };
      useWorkspaceAuthStore.setState({
        sessions: [nextSession],
        currentAccountId: nextSession.accountId,
        runtimeGeneration: 2,
      });
    });

    await waitFor(() => {
      expect(uploadSignal?.aborted).toBe(true);
    });
    await waitFor(() => {
      expect(captured.messageListProps?.outgoingMessages?.[0]?.status).toBe("failed");
    });
  });

  it("opens Workspace reply mode as composer quote state without injecting quote into draft", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onReplyMessage?.(
        "55555555-5555-4555-8555-555555555555",
        "selected excerpt",
      );
    });

    await waitFor(() => {
      expect(captured.composerProps?.replyQuote).toMatchObject({
        id: "55555555-5555-4555-8555-555555555555",
        content: "selected excerpt",
        sender_full_name: "Bob Reed",
        permalinkUrl: "/org/org-a/project/project-a/message/55555555-5555-4555-8555-555555555555",
        quoteFormat: "workspace",
      });
    });
    expect(captured.composerProps?.draftInitialValue).toBeUndefined();

    act(() => {
      captured.composerProps?.onClearReply();
    });

    await waitFor(() => {
      expect(captured.composerProps?.replyQuote).toBeNull();
    });
  });

  it("opens Workspace forward store for one message with selected text", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onForwardMessage).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onForwardMessage?.(MESSAGE_UUID, "selected excerpt");
    });

    await waitFor(() => {
      expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
        isOpen: true,
        messageUuids: [MESSAGE_UUID],
        selectedText: "selected excerpt",
        onSuccess: undefined,
      });
    });
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("opens Workspace forward store for selected message UUIDs", async () => {
    useWorkspaceMessageStore
      .getState()
      .replaceOrMergeConversationMessagesPage(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
        createMessage(),
        createSecondMessage(),
      ]);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onToggleMessageSelection).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onToggleMessageSelection?.(SECOND_MESSAGE_UUID);
      captured.messageListProps?.onToggleMessageSelection?.(MESSAGE_UUID);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Forward" }));

    await waitFor(() => {
      expect(useWorkspaceForwardMessageStore.getState()).toMatchObject({
        isOpen: true,
        messageUuids: [SECOND_MESSAGE_UUID, MESSAGE_UUID],
        selectedText: undefined,
      });
    });
    expect(useWorkspaceForwardMessageStore.getState().onSuccess).toEqual(expect.any(Function));
    expect(captured.messageListProps?.selectedMessageUuids?.size).toBe(2);

    act(() => {
      useWorkspaceForwardMessageStore.getState().onSuccess?.();
    });

    await waitFor(() => {
      expect(captured.messageListProps?.selectedMessageUuids?.size).toBe(0);
    });
    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
  });

  it("downloads Workspace file attachments through the Workspace file API", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onDownloadFile).toEqual(expect.any(Function)),
    );
    captured.messageListProps?.onDownloadFile?.({
      kind: "attachment",
      href: "workspace-file://33333333-3333-4333-8333-333333333333",
      fileUuid: "33333333-3333-4333-8333-333333333333",
      name: "hint.txt",
    });

    await waitFor(() => {
      expect(captured.downloadWorkspaceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
          signal: expect.any(AbortSignal),
        }),
        "33333333-3333-4333-8333-333333333333",
      );
    });

    await waitFor(() => {
      expect(useDownloadStore.getState().entries[0]).toMatchObject({
        path: "workspace-file:33333333-3333-4333-8333-333333333333",
        fileName: "hint.txt",
        status: "downloaded",
        receivedBytes: 14,
        totalBytes: 14,
      });
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-file");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("downloads Workspace media placeholders through the same Workspace file API", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:workspace-file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onDownloadFile).toEqual(expect.any(Function)),
    );
    captured.messageListProps?.onDownloadFile?.({
      kind: "media",
      href: "workspace-file://44444444-4444-4444-8444-444444444444?content_type=image/png",
      fileUuid: "44444444-4444-4444-8444-444444444444",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image",
    });

    await waitFor(() => {
      expect(captured.downloadWorkspaceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
          signal: expect.any(AbortSignal),
        }),
        "44444444-4444-4444-8444-444444444444",
      );
    });

    await waitFor(() => {
      expect(useDownloadStore.getState().entries[0]).toMatchObject({
        path: "workspace-file:44444444-4444-4444-8444-444444444444",
        fileName: "screen.png",
        status: "downloaded",
        receivedBytes: 14,
        totalBytes: 14,
      });
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-file");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("loads Workspace image preview blobs through the current runtime context", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const controller = new AbortController();
    const blob = await captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      {
        kind: "media",
        href: "workspace-file://55555555-5555-4555-8555-555555555555?content_type=image/png",
        fileUuid: "55555555-5555-4555-8555-555555555555",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      },
      controller.signal,
    );

    expect(captured.downloadWorkspaceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        devTargetOrigin: "https://org-a.example.com",
        projectId: "project-a",
        signal: controller.signal,
      }),
      "55555555-5555-4555-8555-555555555555",
    );
    expect(blob).toBeInstanceOf(Blob);
  });

  it("opens Workspace image media in the old media viewer with a blob display URL", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-viewer-image");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.downloadWorkspaceFile.mockResolvedValueOnce({
      blob: new Blob(["image-bytes"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="screen.png"',
        "content-length": "11",
      }),
    });

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.({
        kind: "media",
        href: "workspace-file://44444444-4444-4444-8444-444444444444?content_type=image/png",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => {
      expect(captured.downloadWorkspaceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
          signal: expect.any(AbortSignal),
        }),
        "44444444-4444-4444-8444-444444444444",
      );
    });
    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
    });

    const viewerItem = useMediaViewerStore.getState().items[0];
    expect(viewerItem).toMatchObject({
      url: "blob:workspace-viewer-image",
      type: "image",
      previewUrl: "blob:workspace-viewer-image",
      alt: "screen.png",
      downloadFileName: "screen.png",
      workspaceFile: {
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "screen.png",
        contentType: "image/png",
        objectUrl: "blob:workspace-viewer-image",
      },
    });
    expect(viewerItem?.url).not.toContain("/api/messenger/v1/files");
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    unmount();

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-viewer-image");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("opens a Workspace image gallery in the old media viewer with the clicked index", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-gallery-first")
      .mockReturnValueOnce("blob:workspace-gallery-second");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.downloadWorkspaceFile
      .mockResolvedValueOnce({
        blob: new Blob(["first-image"], { type: "image/png" }),
        headers: new Headers({
          "content-disposition": 'attachment; filename="first.png"',
          "content-length": "11",
        }),
      })
      .mockResolvedValueOnce({
        blob: new Blob(["second-image"], { type: "image/png" }),
        headers: new Headers({
          "content-disposition": 'attachment; filename="second.png"',
          "content-length": "12",
        }),
      });

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(
        {
          kind: "media",
          href: "workspace-file://22222222-2222-4222-8222-222222222222?content_type=image/png",
          fileUuid: "22222222-2222-4222-8222-222222222222",
          name: "second.png",
          contentType: "image/png",
          mediaKind: "image",
        },
        {
          startIndex: 1,
          items: [
            {
              messageUuid: "workspace-gallery-first-message",
              file: {
                kind: "media",
                href: "workspace-file://11111111-1111-4111-8111-111111111111?content_type=image/png",
                fileUuid: "11111111-1111-4111-8111-111111111111",
                name: "first.png",
                contentType: "image/png",
                mediaKind: "image",
              },
            },
            {
              messageUuid: "workspace-gallery-second-message",
              file: {
                kind: "media",
                href: "workspace-file://22222222-2222-4222-8222-222222222222?content_type=image/png",
                fileUuid: "22222222-2222-4222-8222-222222222222",
                name: "second.png",
                contentType: "image/png",
                mediaKind: "image",
              },
            },
          ],
        },
      );
    });

    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
    });

    expect(captured.downloadWorkspaceFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        accessToken: "access-token",
        devTargetOrigin: "https://org-a.example.com",
        projectId: "project-a",
        signal: expect.any(AbortSignal),
      }),
      "11111111-1111-4111-8111-111111111111",
    );
    expect(captured.downloadWorkspaceFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        accessToken: "access-token",
        devTargetOrigin: "https://org-a.example.com",
        projectId: "project-a",
        signal: expect.any(AbortSignal),
      }),
      "22222222-2222-4222-8222-222222222222",
    );
    expect(useMediaViewerStore.getState().currentIndex).toBe(1);
    expect(useMediaViewerStore.getState().items).toMatchObject([
      {
        url: "blob:workspace-gallery-first",
        previewUrl: "blob:workspace-gallery-first",
        downloadFileName: "first.png",
        workspaceFile: {
          fileUuid: "11111111-1111-4111-8111-111111111111",
          objectUrl: "blob:workspace-gallery-first",
        },
      },
      {
        url: "blob:workspace-gallery-second",
        previewUrl: "blob:workspace-gallery-second",
        downloadFileName: "second.png",
        workspaceFile: {
          fileUuid: "22222222-2222-4222-8222-222222222222",
          objectUrl: "blob:workspace-gallery-second",
        },
      },
    ]);
    expect(useMediaViewerStore.getState().items[0]?.url).not.toContain("/api/messenger/v1/files");
    expect(useMediaViewerStore.getState().items[1]?.url).not.toContain("/api/messenger/v1/files");

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-first");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-second");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("aborts an in-flight Workspace viewer fetch when the runtime context changes", async () => {
    let viewerSignal: AbortSignal | undefined;
    captured.downloadWorkspaceFile.mockImplementation(
      (requestOptions: { signal?: AbortSignal }) => {
        viewerSignal = requestOptions.signal;
        return new Promise((_, reject) => {
          requestOptions.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    );

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.({
        kind: "media",
        href: "workspace-file://44444444-4444-4444-8444-444444444444?content_type=image/png",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => {
      expect(captured.downloadWorkspaceFile).toHaveBeenCalledTimes(1);
      expect(viewerSignal).toBeInstanceOf(AbortSignal);
      expect(viewerSignal?.aborted).toBe(false);
    });

    act(() => {
      const nextSession = {
        ...createSession(),
        accessToken: "next-access-token",
        runtimeGeneration: 2,
      };
      useWorkspaceAuthStore.setState({
        sessions: [nextSession],
        currentAccountId: nextSession.accountId,
        runtimeGeneration: 2,
      });
    });

    await waitFor(() => {
      expect(viewerSignal?.aborted).toBe(true);
    });
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
  });

  it("reports unsupported Workspace media preview through the explicit fallback callback", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenUnsupportedFilePreview).toEqual(expect.any(Function)),
    );
    captured.messageListProps?.onOpenUnsupportedFilePreview?.({
      kind: "media",
      href: "workspace-file://44444444-4444-4444-8444-444444444444",
      fileUuid: "44444444-4444-4444-8444-444444444444",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image",
    });

    expect(
      await screen.findByText(
        "Workspace media preview is not connected yet. Download the file instead.",
      ),
    ).toBeInTheDocument();
    expect(captured.downloadWorkspaceFile).not.toHaveBeenCalled();
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
    expect(captured.headerProps?.rightPanelLabel).toBe(t("info.partnerInfo"));
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
