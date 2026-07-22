import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetWorkspaceComposerDraftStoreForTests,
  selectWorkspaceComposerDraft,
  useWorkspaceComposerDraftStore,
} from "~/entities/composer-draft/composer-draft.model";
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
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { createJitsiCallKey, useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { t } from "~/i18n/i18n";
import { OpenSearchContext } from "~/shared/contexts/open-search";
import { RightDrawerContext } from "~/shared/contexts/right-drawer";
import type { RightDrawerContextValue } from "~/shared/contexts/right-drawer.types";
import {
  deleteWorkspaceMessengerCacheDatabase,
  openWorkspaceMessengerCacheDb,
  resetWorkspaceMessengerCacheDbSingletonForTests,
} from "~/shared/lib/workspace-messenger-cache-db";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import type { ChatHeaderProps } from "~/widgets/chat-view/chat-header.types";
import { ChatPage } from "./chat-page.ui";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";
import type { ChatPageWorkspaceMessageListSectionProps } from "./chat-page-workspace-message-list-section.types";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const DIRECT_STREAM_UUID = "88888888-8888-4888-8888-888888888888";
const DIRECT_TOPIC_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
  loadWorkspaceMessages: vi.fn().mockResolvedValue({ status: "applied" }),
  loadWorkspaceMessageWindowAroundMessage: vi.fn().mockResolvedValue({
    status: "applied",
    ownerKey: "owner-key",
    conversationId:
      "topic:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    anchorUuid: "55555555-5555-4555-8555-555555555555",
    beforePageMarker: null,
    afterPageMarker: null,
    beforeLimit: null,
    afterLimit: null,
  }),
  loadWorkspaceMessageWindowPage: vi.fn().mockResolvedValue({
    status: "applied",
    ownerKey: "owner-key",
    conversationId:
      "topic:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    direction: "before",
    nextPageMarker: null,
    pageLimit: 50,
  }),
  loadWorkspaceFile: vi.fn(),
  downloadWorkspaceFile: vi.fn(),
  uploadWorkspaceFile: vi.fn(),
  sendMessengerMessage: vi.fn(),
  streamBindingsForRoute: vi.fn(),
  syncWorkspaceComposerDraft: vi.fn().mockResolvedValue(undefined),
  deleteWorkspaceComposerDraftFromServer: vi.fn().mockResolvedValue(true),
}));

function createTestWorkspaceFileResourceCache() {
  const entries = new Map<
    string,
    { abortController: AbortController; promise: Promise<{ blob: Blob; headers: Headers }> }
  >();

  return {
    load(options: {
      ownerKey: string;
      runtimeGeneration: number;
      fileUuid: string;
      requestOptions: unknown;
      signal?: AbortSignal;
    }): Promise<{ blob: Blob; headers: Headers }> {
      if (options.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }

      const key = JSON.stringify([options.ownerKey, options.runtimeGeneration, options.fileUuid]);
      let entry = entries.get(key);
      if (entry == null) {
        const abortController = new AbortController();
        const promise = captured.loadWorkspaceFile({
          ...options,
          signal: abortController.signal,
        });
        entry = { abortController, promise };
        entries.set(key, entry);
        void promise.catch(() => {
          if (entries.get(key)?.promise === promise) {
            entries.delete(key);
          }
        });
      }

      if (options.signal == null) {
        return entry.promise;
      }

      return new Promise((resolve, reject) => {
        const onAbort = () => {
          options.signal?.removeEventListener("abort", onAbort);
          reject(new DOMException("Aborted", "AbortError"));
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        void entry?.promise.then(
          (value) => {
            options.signal?.removeEventListener("abort", onAbort);
            if (options.signal?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            resolve(value);
          },
          (error: unknown) => {
            options.signal?.removeEventListener("abort", onAbort);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    },
    clear() {
      for (const entry of entries.values()) {
        entry.abortController.abort();
      }
      entries.clear();
    },
  };
}

vi.mock("~/entities/messenger/messenger-messages-loader.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/entities/messenger/messenger-messages-loader.lib")>();
  return {
    ...actual,
    loadMessengerConversationMessages: captured.loadWorkspaceMessages,
    loadMessengerMessageWindowAroundMessage: captured.loadWorkspaceMessageWindowAroundMessage,
    loadMessengerMessageWindowPage: captured.loadWorkspaceMessageWindowPage,
  };
});

vi.mock("~/shared/api/messenger-files.api", () => ({
  downloadWorkspaceFile: captured.downloadWorkspaceFile,
  uploadWorkspaceFile: captured.uploadWorkspaceFile,
}));

vi.mock("~/shared/lib/workspace-file-loader.lib", () => ({
  loadWorkspaceFile: captured.loadWorkspaceFile,
  createWorkspaceFileResourceCache: createTestWorkspaceFileResourceCache,
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

vi.mock("~/entities/composer-draft/composer-draft-sync.lib", () => ({
  syncWorkspaceComposerDraft: captured.syncWorkspaceComposerDraft,
  deleteWorkspaceComposerDraftFromServer: captured.deleteWorkspaceComposerDraftFromServer,
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
            {message.payload.content}
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
    topics: [
      {
        ...payload.topics[0]!,
        uuid: DIRECT_TOPIC_UUID,
        streamUuid: DIRECT_STREAM_UUID,
        name: "private",
        unreadCount: 0,
        isDefault: true,
      },
    ],
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
    payload: { kind: "markdown", content: "workspace message" },
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
    payload: { kind: "markdown", content: "second workspace message" },
    createdAt: "2026-06-30T10:01:00.000Z",
    updatedAt: "2026-06-30T10:01:00.000Z",
  };
}

function seedSecondMessage() {
  useWorkspaceMessageStore
    .getState()
    .replaceOrMergeConversationMessagesPage(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
      createMessage(),
      createSecondMessage(),
    ]);
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

let navigateTo: ReturnType<typeof useNavigate> | null = null;

function WorkspaceNavigationProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateTo = navigate;
    return () => {
      navigateTo = null;
    };
  }, [navigate]);
  return null;
}

function renderWorkspaceChatPageWithShellContexts(
  route: string,
  rightDrawerOverrides: Partial<RightDrawerContextValue> = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <WorkspaceNavigationProbe />
      <WorkspaceLocationProbe />
      <OpenSearchContext.Provider value={vi.fn()}>
        <RightDrawerContext.Provider
          value={{
            open: false,
            setOpen: vi.fn(),
            openInfo: vi.fn(),
            openUserProfile: vi.fn(),
            openWorkspaceUserProfile: vi.fn(),
            ...rightDrawerOverrides,
          }}
        >
          <ChatPage />
        </RightDrawerContext.Provider>
      </OpenSearchContext.Provider>
    </MemoryRouter>,
  );
}

function WorkspaceLocationProbe() {
  const location = useLocation();
  return <span data-testid="workspace-location">{location.pathname}</span>;
}

describe("ChatPage Workspace route", () => {
  beforeEach(async () => {
    resetWorkspaceComposerDraftStoreForTests();
    const session = createSession();
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().replaceBootstrapState(ownerKey, createBootstrapPayload());
    useWorkspaceJitsiSettingsStore.getState().clear();
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
    await useWorkspaceComposerDraftStore.getState().clear();
    useJitsiCallStore.getState().clear();
    captured.composerProps = null;
    captured.headerProps = null;
    captured.messageListProps = null;
    captured.loadWorkspaceMessages.mockClear();
    captured.loadWorkspaceMessageWindowAroundMessage.mockReset();
    captured.loadWorkspaceMessageWindowAroundMessage.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      anchorUuid: MESSAGE_UUID,
      beforePageMarker: null,
      afterPageMarker: null,
      beforeLimit: null,
      afterLimit: null,
    });
    captured.loadWorkspaceMessageWindowPage.mockReset();
    captured.loadWorkspaceMessageWindowPage.mockResolvedValue({
      status: "applied",
      ownerKey: "owner-key",
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      direction: "before",
      nextPageMarker: null,
      pageLimit: 50,
    });
    captured.downloadWorkspaceFile.mockReset();
    captured.downloadWorkspaceFile.mockResolvedValue({
      blob: new Blob(["workspace file"], { type: "text/plain" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="workspace-report.txt"',
        "content-length": "14",
      }),
    });
    captured.loadWorkspaceFile.mockReset();
    captured.loadWorkspaceFile.mockResolvedValue({
      blob: new Blob(["workspace preview"], { type: "image/png" }),
      headers: new Headers(),
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
      message: createMessage(),
    });
    captured.syncWorkspaceComposerDraft.mockReset();
    captured.syncWorkspaceComposerDraft.mockResolvedValue(undefined);
    captured.deleteWorkspaceComposerDraftFromServer.mockReset();
    captured.deleteWorkspaceComposerDraftFromServer.mockImplementation(
      (params: { draft: { ownerKey: string; draftUuid: string } }) => {
        useWorkspaceComposerDraftStore
          .getState()
          .removeDraftByUuid(params.draft.ownerKey, params.draft.draftUuid);
        return Promise.resolve(true);
      },
    );
    useWorkspaceForwardMessageStore.getState().reset();
    captured.streamBindingsForRoute.mockClear();
    useDownloadStore.getState().clearDownloads();
  });

  afterEach(async () => {
    navigateTo = null;
    useWorkspaceForwardMessageStore.getState().reset();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    useMessengerStore.getState().clear();
    useWorkspaceJitsiSettingsStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useMessengerOutboxStore.getState().clear();
    resetWorkspaceComposerDraftStoreForTests();
    await useWorkspaceComposerDraftStore.getState().clear();
    useJitsiCallStore.getState().clear();
    useDownloadStore.getState().clearDownloads();
    useMediaViewerStore.getState().close();
    try {
      const db = await openWorkspaceMessengerCacheDb();
      db.close();
    } catch {
      // No open database.
    }
    resetWorkspaceMessengerCacheDbSingletonForTests();
    await deleteWorkspaceMessengerCacheDatabase();
  });

  it("renders Workspace topic data through the Workspace-native message section", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(screen.getByTestId("chat-page")).toHaveClass(
      "min-w-chat-page",
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
    expect(captured.headerProps?.onCallClick).toBeUndefined();
    expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    expect(captured.messageListProps?.presentation).toBeUndefined();
    expect(captured.messageListProps?.resolveTopicLabel).toBeUndefined();
    expect(captured.messageListProps?.currentUserUuid).toBe(USER_UUID);
    expect(captured.messageListProps?.resolveAuthorLabel?.(USER_B_UUID)).toBe("Bob Reed");
    expect(captured.messageListProps?.resolveMention?.("Bob Reed")).toMatchObject({
      userUuid: USER_B_UUID,
      displayText: "Bob Reed",
    });
    expect(captured.messageListProps?.messages[0]).toMatchObject({
      uuid: "55555555-5555-4555-8555-555555555555",
      payload: { kind: "markdown", content: "workspace message" },
    });
    expect(captured.messageListProps?.messages[0]).not.toHaveProperty("id");
    expect(captured.messageListProps?.messages[0]).not.toHaveProperty("content");
    expect(captured.messageListProps?.firstUnreadUuid).toBe("55555555-5555-4555-8555-555555555555");
    expect(captured.messageListProps?.unreadCount).toBe(1);
    expect(captured.messageListProps?.onReplyMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onAddReplyMessage).toBeUndefined();
    expect(captured.messageListProps?.onEditMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onRequestDeleteMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onCopyMessageText).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenMessageInChat).toBeUndefined();
    expect(captured.messageListProps?.onOpenMentionUser).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onToggleMessageReaction).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onDownloadFile).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onOpenUnsupportedFilePreview).toEqual(expect.any(Function));
    expect(captured.composerProps?.readOnlyReason).toBeUndefined();
    expect(captured.composerProps?.optimisticClearOnSend).toBe(true);
    expect(captured.composerProps?.composerCapabilities?.upload?.mode).toBe("enabled");
    expect(captured.composerProps?.composerCapabilities?.preview?.mode).toBe("enabled");
    expect(captured.composerProps?.resolveMention?.("Bob Reed")).toMatchObject({
      userUuid: USER_B_UUID,
      displayText: "Bob Reed",
    });
    expect(captured.composerProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function));
    expect(captured.composerProps?.onSend).toEqual(expect.any(Function));
    expect(captured.composerProps?.onCreateCallLink).toBeUndefined();
    expect(captured.composerProps?.onSubmitEdit).toEqual(expect.any(Function));
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

  it("enables topic presentation settings and opens a topic from the stream prompt", async () => {
    renderWorkspaceChatPageWithShellContexts(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(captured.messageListProps?.conversationId).toBe(`stream:${STREAM_UUID}`);
    expect(captured.messageListProps?.presentation).toEqual({
      topicDividers: true,
      topicLabels: true,
    });
    expect(captured.messageListProps?.resolveTopicLabel?.(TOPIC_UUID)).toBe("Roadmap");
    expect(captured.messageListProps?.resolveTopicLabel?.("missing-topic")).toBeNull();
    expect(screen.queryByTestId("old-composer-section")).not.toBeInTheDocument();
    expect(screen.getByTestId("stream-topic-prompt")).toHaveTextContent("Select topic:");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /#\s*Roadmap/ }));
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-location")).toHaveTextContent(
        `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      ),
    );
  });

  it("focuses a Workspace message route from the active store without loading a window", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    expect(await screen.findByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(screen.getByText("workspace message")).toBeInTheDocument();
    expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
    expect(captured.messageListProps?.focusedMessageUuid).toBe(MESSAGE_UUID);
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("loads a Workspace message window when the anchor is indexed but absent from the conversation list", async () => {
    useWorkspaceMessageStore.getState().clear();
    useWorkspaceMessageStore.getState().upsertMessageBody(createMessage());

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    const request = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        messageUuid: MESSAGE_UUID,
        runtimeContext: expect.objectContaining({
          projectId: "project-a",
          userUuid: USER_UUID,
        }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(request?.conversationId).toBeUndefined();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("loads a Workspace message window when the message route anchor is absent", async () => {
    useWorkspaceMessageStore.getState().clear();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() =>
      expect(captured.loadWorkspaceMessageWindowAroundMessage).toHaveBeenCalledTimes(1),
    );
    const request = captured.loadWorkspaceMessageWindowAroundMessage.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        messageUuid: MESSAGE_UUID,
        runtimeContext: expect.objectContaining({
          projectId: "project-a",
          userUuid: USER_UUID,
        }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(request?.conversationId).toBeUndefined();

    await waitFor(() => {
      expect(captured.messageListProps?.conversationId).toBe(`topic:${STREAM_UUID}:${TOPIC_UUID}`);
      expect(captured.messageListProps?.focusedMessageUuid).toBe(MESSAGE_UUID);
    });
    expect(screen.getByTestId("workspace-message-list-section")).toBeInTheDocument();
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("loads older pages from the message window before marker", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceMessageStore.getState().setConversationWindowMarkers(conversationId, {
      beforePageMarker: "older-window-cursor",
      afterPageMarker: null,
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() => expect(captured.messageListProps?.hasOlderMessages).toBe(true));
    expect(captured.messageListProps?.hasNewerMessages).toBe(false);

    act(() => {
      captured.messageListProps?.onLoadOlder();
    });

    await waitFor(() => expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledTimes(1));
    expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        direction: "before",
        pageMarker: "older-window-cursor",
        runtimeContext: expect.objectContaining({ projectId: "project-a" }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("loads newer pages from the message window after marker", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceMessageStore.getState().setConversationWindowMarkers(conversationId, {
      beforePageMarker: null,
      afterPageMarker: "newer-window-cursor",
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/message/${MESSAGE_UUID}`,
    );

    await waitFor(() => expect(captured.messageListProps?.hasNewerMessages).toBe(true));
    expect(captured.messageListProps?.hasOlderMessages).toBe(false);

    act(() => {
      captured.messageListProps?.onLoadNewer();
    });

    await waitFor(() => expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledTimes(1));
    expect(captured.loadWorkspaceMessageWindowPage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        direction: "after",
        pageMarker: "newer-window-cursor",
        runtimeContext: expect.objectContaining({ projectId: "project-a" }),
        getRuntimeContext: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });

  it("keeps normal topic routes on conversation history loading only", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.loadWorkspaceMessages).toHaveBeenCalledTimes(1));
    expect(captured.loadWorkspaceMessageWindowAroundMessage).not.toHaveBeenCalled();
    expect(captured.loadWorkspaceMessageWindowPage).not.toHaveBeenCalled();
  });

  it("opens Workspace mention profile through the right drawer UUID path", async () => {
    const openWorkspaceUserProfile = vi.fn();
    const openUserProfile = vi.fn();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
      {
        openWorkspaceUserProfile,
        openUserProfile,
      },
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenMentionUser).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenMentionUser?.(USER_B_UUID);
    });

    expect(openWorkspaceUserProfile).toHaveBeenCalledWith(USER_B_UUID);
    expect(openUserProfile).not.toHaveBeenCalled();
  });

  it("opens a canonical topic reference through the topic store", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceReference).toEqual(expect.any(Function)),
    );

    act(() => {
      captured.messageListProps?.onOpenWorkspaceReference?.({
        kind: "topic",
        topicUuid: TOPIC_UUID,
      });
    });

    expect(screen.getByTestId("workspace-location")).toHaveTextContent(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
  });

  it("does not navigate when a canonical topic is absent from the topic store", async () => {
    const unknownTopicUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const initialRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    renderWorkspaceChatPageWithShellContexts(initialRoute);

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceReference).toEqual(expect.any(Function)),
    );

    act(() => {
      captured.messageListProps?.onOpenWorkspaceReference?.({
        kind: "topic",
        topicUuid: unknownTopicUuid,
      });
    });

    expect(screen.getByTestId("workspace-location")).toHaveTextContent(initialRoute);
  });

  it("does not navigate when a topic reference contains a mismatched stream", async () => {
    const initialRoute = `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;
    const mismatchedStreamUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    renderWorkspaceChatPageWithShellContexts(initialRoute);

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceReference).toEqual(expect.any(Function)),
    );

    act(() => {
      captured.messageListProps?.onOpenWorkspaceReference?.({
        kind: "topic",
        topicUuid: TOPIC_UUID,
        streamUuid: mismatchedStreamUuid,
      });
    });

    expect(screen.getByTestId("workspace-location")).toHaveTextContent(initialRoute);
  });

  it("sends and opens a Workspace Jitsi call from the direct private header", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123);

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
      );

      await waitFor(() => expect(captured.headerProps?.onCallClick).toEqual(expect.any(Function)));
      expect(captured.composerProps?.onCreateCallLink).toBeUndefined();
      expect(screen.queryByTestId("old-composer-section")).not.toBeInTheDocument();
      expect(screen.getByTestId("stream-topic-prompt")).toBeInTheDocument();
      expect(captured.messageListProps?.presentation).toEqual({
        topicDividers: true,
        topicLabels: true,
      });
      expect(captured.messageListProps?.resolveTopicLabel?.(DIRECT_TOPIC_UUID)).toBe("private");

      act(() => {
        captured.headerProps?.onCallClick?.();
      });

      const expectedUrl = `https://meet.workspace.example.com/workspace-org-a-project-a-${DIRECT_STREAM_UUID}-${DIRECT_TOPIC_UUID}-123`;
      await waitFor(() =>
        expect(captured.sendMessengerMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            streamUuid: DIRECT_STREAM_UUID,
            topicUuid: DIRECT_TOPIC_UUID,
            markdown: expectedUrl,
            includeStreamConversation: true,
          }),
        ),
      );
      await waitFor(() =>
        expect(useJitsiCallStore.getState().activeCall).toMatchObject({
          callKey: createJitsiCallKey({ meetingUrl: expectedUrl, ownerKey }),
          meetingUrl: expectedUrl,
          locationName: "Bob Reed",
          ownerKey,
          meetUrl: "https://meet.workspace.example.com",
          displayName: "Alice Stone",
          startedAtMs: 123,
        }),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("does not send a Workspace Jitsi call link when another call is active", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const existingResult = useJitsiCallStore.getState().requestOpenCall({
      meetingUrl: "https://meet.workspace.example.com/existing-room",
      locationName: "Existing call",
      ownerKey,
      meetUrl: "https://meet.workspace.example.com",
      displayName: "Alice Stone",
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
    );

    await waitFor(() => expect(captured.headerProps?.onCallClick).toEqual(expect.any(Function)));
    act(() => {
      captured.headerProps?.onCallClick?.();
    });

    expect(captured.sendMessengerMessage).not.toHaveBeenCalled();
    expect(useJitsiCallStore.getState().activeCall).toBe(existingResult.activeCall);
  });

  it("does not send duplicate Workspace Jitsi call links while the first send is pending", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage | null;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(456);

    try {
      renderWorkspaceChatPageWithShellContexts(
        `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
      );

      await waitFor(() => expect(captured.headerProps?.onCallClick).toEqual(expect.any(Function)));
      act(() => {
        captured.headerProps?.onCallClick?.();
        captured.headerProps?.onCallClick?.();
      });

      expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1);

      await act(async () => {
        sendRequest.resolve({
          status: "applied",
          ownerKey,
          message: createMessage(),
        });
        await sendRequest.promise;
        await Promise.resolve();
      });

      const expectedUrl = `https://meet.workspace.example.com/workspace-org-a-project-a-${DIRECT_STREAM_UUID}-${DIRECT_TOPIC_UUID}-456`;
      expect(useJitsiCallStore.getState().activeCall).toMatchObject({
        callKey: createJitsiCallKey({ meetingUrl: expectedUrl, ownerKey }),
        meetingUrl: expectedUrl,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("does not open a Workspace Jitsi call when the send resolves after abort", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore
      .getState()
      .replaceBootstrapState(ownerKey, createDirectPrivateBootstrapPayload());
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(ownerKey, "https://meet.workspace.example.com/jitsi/");
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage | null;
    }>();
    let sendSignal: AbortSignal | undefined;
    captured.sendMessengerMessage.mockImplementationOnce((request: { signal: AbortSignal }) => {
      sendSignal = request.signal;
      return sendRequest.promise;
    });

    const rendered = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${DIRECT_STREAM_UUID}`,
    );

    await waitFor(() => expect(captured.headerProps?.onCallClick).toEqual(expect.any(Function)));
    act(() => {
      captured.headerProps?.onCallClick?.();
    });
    await waitFor(() => {
      expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1);
      expect(sendSignal).toBeInstanceOf(AbortSignal);
    });

    act(() => {
      rendered.unmount();
    });
    expect(sendSignal?.aborted).toBe(true);

    await act(async () => {
      sendRequest.resolve({
        status: "applied",
        ownerKey,
        message: createMessage(),
      });
      await sendRequest.promise;
      await Promise.resolve();
    });

    expect(useJitsiCallStore.getState().activeCall).toBeNull();
  });

  it("removes the local outgoing row after Workspace send resolves", async () => {
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    let onBeforeMessageIndexed: ((message: MessengerMessage) => void) | undefined;
    const serverMessage = {
      ...createMessage(),
      uuid: "server-message-uuid",
      authorUuid: USER_UUID,
      userUuid: USER_UUID,
      isOwn: true,
    };
    captured.sendMessengerMessage.mockImplementationOnce(
      (request: { onBeforeMessageIndexed?: (message: MessengerMessage) => void }) => {
        onBeforeMessageIndexed = request.onBeforeMessageIndexed;
        return sendRequest.promise;
      },
    );

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
    const localId = captured.messageListProps?.outgoingMessages?.[0]?.localId;
    expect(localId).toMatch(/^outgoing:/);

    act(() => {
      onBeforeMessageIndexed?.(serverMessage);
      useWorkspaceMessageStore.getState().indexMessageIntoConversationBuckets(serverMessage);
      sendRequest.resolve({
        status: "applied",
        ownerKey: "owner-key",
        message: serverMessage,
      });
    });

    await waitFor(() => expect(captured.messageListProps?.outgoingMessages).toEqual([]));
    expect(captured.messageListProps?.resolveServerMessageRenderKey?.(serverMessage.uuid)).toBe(
      localId,
    );
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
            "hello\n[report____q1_.pdf](urn:file:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?name=report____q1_.pdf&content_type=application%2Fpdf&size=3)\n![screen.png](urn:image:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?name=screen.png&content_type=image%2Fpng&size=8)",
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
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    await expect(onSend("hello", "", [file])).rejects.toThrow();

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
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    act(() => {
      void Promise.resolve(onSend("hello", "", [file])).catch(() => undefined);
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

  it("opens Workspace reply mode as a tab without injecting quote into the draft", async () => {
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
      expect(captured.composerProps?.workspaceReplySession).toMatchObject({
        activeTabId: expect.any(String),
        tabs: [
          {
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            selectedText: "selected excerpt",
            answer: "",
          },
        ],
      });
    });
    expect(captured.messageListProps?.onReplyMessage).toEqual(expect.any(Function));
    expect(captured.messageListProps?.onAddReplyMessage).toEqual(expect.any(Function));
    expect(captured.composerProps?.replyQuote).toMatchObject({
      id: captured.composerProps?.workspaceReplySession?.activeTabId,
      content: "selected excerpt",
      sender_full_name: "Bob Reed",
      sender_uuid: USER_B_UUID,
      quoteFormat: "workspace",
    });
    expect(captured.composerProps?.draftInitialValue).toBe("");
    expect(captured.composerProps?.focusKey).toBe(
      captured.composerProps?.workspaceReplySession?.activeTabId,
    );

    act(() => {
      captured.composerProps?.onClearReply();
    });

    await waitFor(() => {
      expect(captured.composerProps?.replyQuote).toBeNull();
    });
  });

  it("keeps one draft per Workspace conversation when switching chats", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const topicConversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const streamConversationId = `stream:${STREAM_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, topicConversationId, {
      text: "topic draft",
      replySession: { tabs: [], activeTabId: null },
    });
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, streamConversationId, {
      text: "stream draft",
      replySession: { tabs: [], activeTabId: null },
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => expect(captured.composerProps?.draftInitialValue).toBe("topic draft"));

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });
    expect(await screen.findByTestId("stream-topic-prompt")).toBeInTheDocument();
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        streamConversationId,
      )?.content.text,
    ).toBe("stream draft");

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`);
    });
    await waitFor(() => expect(captured.composerProps?.draftInitialValue).toBe("topic draft"));
  });

  it("does not expose Workspace reply controls in a stream", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const topicConversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const streamConversationId = `stream:${STREAM_UUID}`;
    const createDraft = (activeTabId: string) => ({
      text: "",
      replySession: {
        activeTabId,
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "quote A",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "answer A",
          },
          {
            id: "reply-tab-b",
            messageUuid: SECOND_MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "quote B",
            createdAt: "2026-07-15T12:01:00.000Z",
            answer: "answer B",
          },
        ],
      },
    });
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, topicConversationId, createDraft("reply-tab-a"));
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, streamConversationId, createDraft("reply-tab-b"));

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });
    expect(await screen.findByTestId("stream-topic-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("old-composer-section")).not.toBeInTheDocument();
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        topicConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("reply-tab-a");
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        streamConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("reply-tab-b");
  });

  it("restores the Workspace reply session from the current conversation draft", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, `topic:${STREAM_UUID}:${TOPIC_UUID}`, {
        text: "",
        replySession: {
          activeTabId: "reply-tab-a",
          tabs: [
            {
              id: "reply-tab-a",
              messageUuid: MESSAGE_UUID,
              senderUuid: USER_B_UUID,
              senderName: "Bob Reed",
              quotedContent: "workspace message",
              createdAt: "2026-07-15T12:00:00.000Z",
              answer: "restored answer",
            },
          ],
        },
      });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toMatchObject({
        activeTabId: "reply-tab-a",
        tabs: [{ answer: "restored answer", messageUuid: MESSAGE_UUID }],
      });
      expect(captured.composerProps?.draftInitialValue).toBe("restored answer");
    });
  });

  it("starts a new composer session after IndexedDB hydration restores a text draft", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const db = await openWorkspaceMessengerCacheDb();
    const transaction = db.transaction("composerDrafts", "readwrite");
    transaction.objectStore("composerDrafts").put({
      id: `${ownerKey}:${conversationId}`,
      ownerKey,
      conversationId,
      snapshotId: "persisted-text-draft",
      updatedAt: Date.now(),
      content: {
        text: "restored after reload",
        replySession: { tabs: [], activeTabId: null },
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () =>
        reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
      );
      transaction.addEventListener("abort", () =>
        reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
      );
    });
    useWorkspaceComposerDraftStore.getState().clear();

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() => {
      expect(captured.composerProps?.draftInitialValue).toBe("restored after reload");
      expect(captured.composerProps?.draftSessionKey).toContain(":hydrated:text");
    });
  });

  it("does not overwrite local input when draft hydration resolves late", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().clear();
    const originalHydrateDraft = useWorkspaceComposerDraftStore.getState().hydrateDraft;
    const hydration = createDeferred<null>();
    useWorkspaceComposerDraftStore.setState({
      hydrateDraft: vi.fn().mockReturnValue(hydration.promise),
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() => expect(captured.composerProps?.draftSessionKey).not.toBeNull());
    await act(async () => {
      captured.composerProps?.onComposerValueChange("typed before hydration");
      await Promise.resolve();
    });
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.text,
    ).toBe("typed before hydration");
    expect(captured.composerProps?.draftInitialValue).toBe("typed before hydration");
    await act(async () => {
      hydration.resolve(null);
      await hydration.promise;
    });

    expect(captured.composerProps?.draftInitialValue).toBe("typed before hydration");
    expect(captured.composerProps?.draftSessionKey).toContain(":hydrated:text");
    useWorkspaceComposerDraftStore.setState({ hydrateDraft: originalHydrateDraft });
  });

  it("enqueues draft synchronization from composer input without a chat sync effect", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.composerProps?.onComposerValueChange("queued locally");
    });

    await waitFor(() => {
      expect(captured.syncWorkspaceComposerDraft).toHaveBeenCalledTimes(1);
      expect(captured.syncWorkspaceComposerDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({
            ownerKey,
            conversationId,
            content: expect.objectContaining({ text: "queued locally" }),
          }),
        }),
      );
    });
  });

  it("queues deletion of the sent draft without waiting for the composer visit to end", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "send this draft",
      replySession: { tabs: [], activeTabId: null },
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");

    await act(async () => {
      await expect(onSend("send this draft", "")).resolves.toBeUndefined();
    });

    expect(captured.deleteWorkspaceComposerDraftFromServer).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          ownerKey,
          conversationId,
          content: expect.objectContaining({ text: "send this draft" }),
        }),
      }),
    );
    await waitFor(() => expect(captured.composerProps?.draftInitialValue).toBe(""));
  });

  it("keeps a newer draft when an earlier send succeeds", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "first draft",
      replySession: { tabs: [], activeTabId: null },
    });
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    const sendPromise = Promise.resolve(onSend("first draft", ""));
    await waitFor(() => expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1));

    act(() => {
      captured.composerProps?.onComposerValueChange("newer draft");
    });
    act(() => {
      sendRequest.resolve({ status: "applied", ownerKey, message: createMessage() });
    });
    await expect(sendPromise).resolves.toEqual({ shouldClearComposer: false });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.text,
    ).toBe("newer draft");
  });

  it("removes a sent reply draft after the composer clears its value and reply", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "",
      replySession: {
        activeTabId: "reply-tab-a",
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "sent reply",
          },
        ],
      },
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    const onSend = captured.composerProps?.onSend;
    const onComposerValueChange = captured.composerProps?.onComposerValueChange;
    const onClearReply = captured.composerProps?.onClearReply;
    if (onSend == null || onComposerValueChange == null || onClearReply == null) {
      throw new Error("Workspace composer handlers are missing");
    }

    await expect(onSend("sent reply", "")).resolves.toBeUndefined();
    act(() => {
      onComposerValueChange("");
      onClearReply();
    });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      ),
    ).toBeNull();
  });

  it("keeps a newer reply draft when an earlier send finishes", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "",
      replySession: {
        activeTabId: "reply-tab-a",
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "first reply",
          },
        ],
      },
    });
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    const onSend = captured.composerProps?.onSend;
    const onComposerValueChange = captured.composerProps?.onComposerValueChange;
    if (onSend == null || onComposerValueChange == null) {
      throw new Error("Workspace composer handlers are missing");
    }

    const sendPromise = Promise.resolve(onSend("first reply", ""));
    await waitFor(() => expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1));

    act(() => {
      onComposerValueChange("newer reply");
      sendRequest.resolve({ status: "applied", ownerKey, message: createMessage() });
    });
    await expect(sendPromise).resolves.toEqual({ shouldClearComposer: false });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.replySession,
    ).toMatchObject({
      activeTabId: "reply-tab-a",
      tabs: [{ id: "reply-tab-a", answer: "newer reply" }],
    });
  });

  it("keeps a newly added reply tab when an earlier send finishes", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    seedSecondMessage();
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, {
      text: "",
      replySession: {
        activeTabId: "reply-tab-a",
        tabs: [
          {
            id: "reply-tab-a",
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: "first reply",
          },
        ],
      },
    });
    const sendRequest = createDeferred<{
      status: "applied";
      ownerKey: string;
      message: MessengerMessage;
    }>();
    captured.sendMessengerMessage.mockReturnValueOnce(sendRequest.promise);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("reply-tab-a"),
    );

    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    const sendPromise = Promise.resolve(onSend("first reply", ""));
    await waitFor(() => expect(captured.sendMessengerMessage).toHaveBeenCalledTimes(1));

    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(2),
    );

    act(() => {
      sendRequest.resolve({ status: "applied", ownerKey, message: createMessage() });
    });
    await expect(sendPromise).resolves.toEqual({ shouldClearComposer: false });

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content.replySession,
    ).toMatchObject({
      activeTabId: expect.any(String),
      tabs: [
        { id: "reply-tab-a", answer: "first reply" },
        { messageUuid: SECOND_MESSAGE_UUID, answer: "" },
      ],
    });
  });

  it("keeps reply drafts unchanged when opening a stream", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const topicConversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const streamConversationId = `stream:${STREAM_UUID}`;
    const createReplyDraft = (tabId: string) => ({
      text: "",
      replySession: {
        activeTabId: tabId,
        tabs: [
          {
            id: tabId,
            messageUuid: MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob Reed",
            quotedContent: "workspace message",
            createdAt: "2026-07-15T12:00:00.000Z",
            answer: `${tabId} answer`,
          },
        ],
      },
    });
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, topicConversationId, createReplyDraft("topic-reply"));
    useWorkspaceComposerDraftStore
      .getState()
      .setDraft(ownerKey, streamConversationId, createReplyDraft("stream-reply"));
    useWorkspaceMessageStore
      .getState()
      .replaceOrMergeConversationMessagesPage(streamConversationId, [
        { ...createMessage(), isOwn: true },
      ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() =>
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("topic-reply"),
    );

    await act(async () => {
      await navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}`);
    });
    expect(await screen.findByTestId("stream-topic-prompt")).toBeInTheDocument();

    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        topicConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("topic-reply");
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        streamConversationId,
      )?.content.replySession.activeTabId,
    ).toBe("stream-reply");
  });

  it("restores reply tabs when editing an older own Workspace message", async () => {
    const restoredMarkdown = [
      `> [Alice](urn:user:${USER_UUID}) [wrote](urn:message:${MESSAGE_UUID}):`,
      "> quoted A",
      "",
      "answer A",
      "",
      `> [Bob](urn:user:${USER_B_UUID}) [said](urn:message:${SECOND_MESSAGE_UUID}):`,
      "> quoted B",
      "",
      "answer B",
    ].join("\n");
    useWorkspaceMessageStore
      .getState()
      .replaceOrMergeConversationMessagesPage(`topic:${STREAM_UUID}:${TOPIC_UUID}`, [
        {
          ...createMessage(),
          isOwn: true,
          payload: { kind: "markdown", content: restoredMarkdown },
        },
      ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await screen.findByTestId("workspace-message-list-section");

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });

    await waitFor(() => {
      expect(captured.composerProps?.editSession).toMatchObject({
        preserveWorkspaceReplyContext: true,
        initialMarkdown: "answer A",
      });
      expect(captured.composerProps?.workspaceReplySession?.tabs).toEqual([
        expect.objectContaining({
          messageUuid: MESSAGE_UUID,
          quotedContent: "quoted A",
          answer: "answer A",
        }),
        expect.objectContaining({
          messageUuid: SECOND_MESSAGE_UUID,
          quotedContent: "quoted B",
          answer: "answer B",
        }),
      ]);
    });

    act(() => {
      captured.composerProps?.onComposerValueChange("changed answer A");
    });
    await waitFor(() => {
      expect(captured.composerProps?.outgoingBodyOverride).toContain("changed answer A");
    });

    const secondTabId = captured.composerProps?.workspaceReplySession?.tabs[1]?.id;
    if (secondTabId == null) throw new Error("Second restored reply tab is missing");
    act(() => {
      captured.composerProps?.onSelectWorkspaceReplyTab?.(secondTabId);
    });
    await waitFor(() => {
      expect(captured.composerProps?.editSession).toMatchObject({
        preserveWorkspaceReplyContext: true,
        initialMarkdown: "answer B",
        sessionKey: `reply:${secondTabId}`,
      });
    });
  });

  it("restores the existing composer draft after cancelling restored reply editing", async () => {
    const ownerKey = workspaceRuntimeOwnerKey(createSession());
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    const existingDraft = {
      text: "",
      replySession: {
        activeTabId: "draft-tab",
        tabs: [
          {
            id: "draft-tab",
            messageUuid: SECOND_MESSAGE_UUID,
            senderUuid: USER_B_UUID,
            senderName: "Bob",
            quotedContent: "saved quote",
            createdAt: "2026-07-16T10:00:00.000Z",
            answer: "saved answer",
          },
        ],
      },
    };
    useWorkspaceComposerDraftStore.getState().setDraft(ownerKey, conversationId, existingDraft);
    useWorkspaceMessageStore.getState().replaceOrMergeConversationMessagesPage(conversationId, [
      {
        ...createMessage(),
        isOwn: true,
        payload: {
          kind: "markdown",
          content: [
            `> [Alice](urn:user:${USER_UUID}) [wrote](urn:message:${MESSAGE_UUID}):`,
            "> old quote",
            "",
            "old answer",
          ].join("\n"),
        },
      },
    ]);

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe("draft-tab");
    });

    act(() => {
      captured.messageListProps?.onEditMessage?.(MESSAGE_UUID);
    });
    await waitFor(() => {
      expect(captured.composerProps?.editSession?.preserveWorkspaceReplyContext).toBe(true);
    });

    act(() => {
      captured.composerProps?.onCancelEdit();
    });
    await waitFor(() => {
      expect(captured.composerProps?.editSession).toBeNull();
      expect(captured.composerProps?.workspaceReplySession).toMatchObject(
        existingDraft.replySession,
      );
      expect(captured.composerProps?.draftInitialValue).toBe("saved answer");
    });
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        ownerKey,
        conversationId,
      )?.content,
    ).toEqual(existingDraft);
  });

  it("replaces the active Workspace reply quote while preserving its answer", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID, "excerpt A");
    });
    const firstTabId = captured.composerProps?.workspaceReplySession?.activeTabId;
    act(() => {
      captured.composerProps?.onComposerValueChange("answer A");
    });
    act(() => {
      captured.messageListProps?.onReplyMessage?.(SECOND_MESSAGE_UUID, "excerpt B");
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toMatchObject({
        activeTabId: firstTabId,
        tabs: [
          {
            id: firstTabId,
            messageUuid: SECOND_MESSAGE_UUID,
            selectedText: "excerpt B",
            answer: "answer A",
          },
        ],
      });
    });
  });

  it("adds a Workspace reply tab with an empty answer", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID, "excerpt A");
      captured.composerProps?.onComposerValueChange?.("answer A");
    });
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID, "excerpt B");
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(2);
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(
        captured.composerProps?.workspaceReplySession?.tabs[1]?.id,
      );
      expect(captured.composerProps?.workspaceReplySession?.tabs[0]?.answer).toBe("answer A");
      expect(captured.composerProps?.workspaceReplySession?.tabs[1]).toMatchObject({
        messageUuid: SECOND_MESSAGE_UUID,
        answer: "",
      });
    });
  });

  it("switches Workspace reply tabs and shows the selected answer", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer A");
    });
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer B");
    });
    const firstTabId = captured.composerProps?.workspaceReplySession?.tabs[0]?.id;
    const secondTabId = captured.composerProps?.workspaceReplySession?.tabs[1]?.id;

    act(() => {
      if (firstTabId != null) captured.composerProps?.onSelectWorkspaceReplyTab?.(firstTabId);
    });
    await waitFor(() => {
      expect(captured.composerProps?.draftInitialValue).toBe("answer A");
      expect(captured.composerProps?.focusKey).toBe(firstTabId);
    });

    act(() => {
      if (secondTabId != null) captured.composerProps?.onSelectWorkspaceReplyTab?.(secondTabId);
    });
    await waitFor(() => {
      expect(captured.composerProps?.draftInitialValue).toBe("answer B");
      expect(captured.composerProps?.focusKey).toBe(secondTabId);
    });
  });

  it("suppresses composer focus during keyboard tab navigation and restores it for pointer and reply actions", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    await waitFor(() =>
      expect(captured.messageListProps?.onAddReplyMessage).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });

    const firstTabId = captured.composerProps?.workspaceReplySession?.tabs[0]?.id;
    const secondTabId = captured.composerProps?.workspaceReplySession?.tabs[1]?.id;
    if (firstTabId == null || secondTabId == null) {
      throw new Error("Workspace reply tabs were not created");
    }
    const selectWorkspaceReplyTab = captured.composerProps?.onSelectWorkspaceReplyTab;
    if (selectWorkspaceReplyTab == null) {
      throw new Error("Workspace reply tab select handler is missing");
    }

    expect(captured.composerProps?.focusKey).toBe(secondTabId);

    act(() => {
      selectWorkspaceReplyTab(firstTabId, "keyboard");
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(firstTabId);
      expect(captured.composerProps?.focusKey).toBeNull();
    });

    act(() => {
      selectWorkspaceReplyTab(secondTabId, "keyboard");
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(secondTabId);
      expect(captured.composerProps?.focusKey).toBeNull();
    });

    act(() => {
      captured.messageListProps?.onReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession?.activeTabId).toBe(secondTabId);
      expect(captured.composerProps?.focusKey).toBe(secondTabId);
    });

    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(MESSAGE_UUID);
    });
    await waitFor(() => {
      const activeTabId = captured.composerProps?.workspaceReplySession?.activeTabId;
      expect(activeTabId).not.toBeNull();
      expect(captured.composerProps?.focusKey).toBe(activeTabId);
    });

    act(() => {
      selectWorkspaceReplyTab(firstTabId);
    });
    await waitFor(() => expect(captured.composerProps?.focusKey).toBe(firstTabId));
  });

  it("removes the last Workspace reply tab and closes the session", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    const tabId = captured.composerProps?.workspaceReplySession?.activeTabId;
    act(() => {
      if (tabId != null) captured.composerProps?.onRemoveWorkspaceReplyTab?.(tabId);
    });

    await waitFor(() => {
      expect(captured.composerProps?.workspaceReplySession).toEqual({
        tabs: [],
        activeTabId: null,
      });
      expect(captured.composerProps?.outgoingBodyOverride).toBeUndefined();
    });
  });

  it("sends Workspace reply pairs in their current tab order", async () => {
    seedSecondMessage();
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer A");
    });
    act(() => {
      captured.messageListProps?.onAddReplyMessage?.(SECOND_MESSAGE_UUID);
    });
    act(() => {
      captured.composerProps?.onComposerValueChange("answer B");
    });
    const outgoingBody = captured.composerProps?.outgoingBodyOverride;
    expect(outgoingBody).toContain("answer A");
    expect(outgoingBody).toContain("answer B");
    expect(outgoingBody?.indexOf("answer A")).toBeLessThan(outgoingBody?.indexOf("answer B") ?? -1);
    await act(async () => {
      await captured.composerProps?.onSend?.(outgoingBody ?? "", "");
    });

    expect(captured.sendMessengerMessage).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: outgoingBody }),
    );
  });

  it("clears Workspace reply tabs after a successful send", async () => {
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
      captured.composerProps?.onComposerValueChange?.("answer");
    });
    await act(async () => {
      await captured.composerProps?.onSend?.(
        captured.composerProps?.outgoingBodyOverride ?? "",
        "",
      );
      captured.composerProps?.onComposerValueChange?.("");
      captured.composerProps?.onClearReply?.();
    });

    expect(captured.composerProps?.workspaceReplySession).toEqual({
      tabs: [],
      activeTabId: null,
    });
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        workspaceRuntimeOwnerKey(createSession()),
        `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      ),
    ).toBeNull();
  });

  it("keeps Workspace reply tabs when sending fails", async () => {
    captured.sendMessengerMessage.mockRejectedValueOnce(new Error("send failed"));
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
      captured.composerProps?.onComposerValueChange?.("answer");
    });
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    await expect(onSend(captured.composerProps?.outgoingBodyOverride ?? "", "")).rejects.toThrow();

    expect(captured.composerProps?.workspaceReplySession?.tabs).toHaveLength(1);
    expect(captured.composerProps?.workspaceReplySession?.tabs[0]?.answer).toBe("answer");
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        workspaceRuntimeOwnerKey(createSession()),
        `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      )?.content.replySession.tabs[0]?.answer,
    ).toBe("answer");
  });

  it("treats a false Workspace send as failed and keeps the active reply answer", async () => {
    captured.sendMessengerMessage.mockResolvedValueOnce({
      status: "skipped",
      ownerKey: "owner-key",
      reason: "stale-owner",
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await screen.findByTestId("workspace-message-list-section");
    act(() => {
      captured.messageListProps?.onReplyMessage?.(MESSAGE_UUID);
      captured.composerProps?.onComposerValueChange?.("answer");
    });
    const onSend = captured.composerProps?.onSend;
    if (onSend == null) throw new Error("Workspace composer send handler is missing");
    await expect(onSend(captured.composerProps?.outgoingBodyOverride ?? "", "")).rejects.toThrow();

    expect(captured.messageListProps?.outgoingMessages?.[0]).toEqual(
      expect.objectContaining({ status: "failed" }),
    );
    expect(captured.composerProps?.workspaceReplySession?.tabs[0]?.answer).toBe("answer");
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
      href: "urn:file:33333333-3333-4333-8333-333333333333?name=hint.txt",
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
      href: "urn:image:44444444-4444-4444-8444-444444444444?name=screen.png&content_type=image%2Fpng",
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
        href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png&content_type=image%2Fpng",
        fileUuid: "55555555-5555-4555-8555-555555555555",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      },
      controller.signal,
    );

    expect(captured.loadWorkspaceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: workspaceRuntimeOwnerKey(createSession()),
        runtimeGeneration: 1,
        fileUuid: "55555555-5555-4555-8555-555555555555",
        requestOptions: expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(captured.loadWorkspaceFile.mock.calls[0]?.[0].signal).not.toBe(controller.signal);
    expect(captured.downloadWorkspaceFile).not.toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });

  it("reuses one Workspace image preview blob request for the same file within the runtime", async () => {
    const imageBlob = new Blob(["cached-image"], { type: "image/png" });
    captured.loadWorkspaceFile.mockResolvedValueOnce({
      blob: imageBlob,
      headers: new Headers({
        "content-disposition": 'attachment; filename="screen.png"',
        "content-length": "12",
      }),
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const firstController = new AbortController();
    const secondController = new AbortController();
    const file = {
      kind: "media" as const,
      href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png&content_type=image%2Fpng",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };

    await expect(
      Promise.all([
        captured.messageListProps?.onLoadWorkspaceFilePreview?.(file, firstController.signal),
        captured.messageListProps?.onLoadWorkspaceFilePreview?.(file, secondController.signal),
      ]),
    ).resolves.toEqual([imageBlob, imageBlob]);

    expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
  });

  it("keeps the page loader consumer alive when one DOM preview is canceled", async () => {
    const request = createDeferred<{ blob: Blob; headers: Headers }>();
    let loaderSignal: AbortSignal | undefined;
    captured.loadWorkspaceFile.mockImplementation((options: { signal?: AbortSignal }) => {
      loaderSignal = options.signal;
      return request.promise;
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const firstController = new AbortController();
    const secondController = new AbortController();
    const file = {
      kind: "media" as const,
      href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    const firstPreview = captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      file,
      firstController.signal,
    );
    const secondPreview = captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      file,
      secondController.signal,
    );

    await waitFor(() => expect(loaderSignal).toBeInstanceOf(AbortSignal));
    firstController.abort();
    request.resolve({
      blob: new Blob(["cached-image"], { type: "image/png" }),
      headers: new Headers(),
    });

    await expect(firstPreview).rejects.toMatchObject({ name: "AbortError" });
    await expect(secondPreview).resolves.toBeInstanceOf(Blob);
    expect(loaderSignal?.aborted).toBe(false);
    expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
  });

  it("handles a late shared preview failure after an already canceled consumer", async () => {
    const request = createDeferred<{ blob: Blob; headers: Headers }>();
    captured.loadWorkspaceFile.mockImplementation(() => request.promise);
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    const canceledController = new AbortController();
    canceledController.abort();
    const file = {
      kind: "media" as const,
      href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png",
      fileUuid: "55555555-5555-4555-8555-555555555555",
      name: "screen.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };

    const canceledPreview = captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      file,
      canceledController.signal,
    );
    await expect(canceledPreview).rejects.toMatchObject({ name: "AbortError" });

    request.reject(new Error("late preview failure"));
    await expect(request.promise).rejects.toThrow("late preview failure");
    await Promise.resolve();
  });

  it("aborts the page preview loader when the runtime changes", async () => {
    const request = createDeferred<{ blob: Blob; headers: Headers }>();
    let loaderSignal: AbortSignal | undefined;
    captured.loadWorkspaceFile.mockImplementation((options: { signal?: AbortSignal }) => {
      loaderSignal = options.signal;
      return request.promise;
    });
    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onLoadWorkspaceFilePreview).toEqual(expect.any(Function)),
    );
    void captured.messageListProps?.onLoadWorkspaceFilePreview?.(
      {
        kind: "media",
        href: "urn:image:55555555-5555-4555-8555-555555555555?name=screen.png",
        fileUuid: "55555555-5555-4555-8555-555555555555",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      },
      new AbortController().signal,
    );

    await waitFor(() => expect(loaderSignal).toBeInstanceOf(AbortSignal));
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

    await waitFor(() => expect(loaderSignal?.aborted).toBe(true));
    request.resolve({
      blob: new Blob(["stale-image"], { type: "image/png" }),
      headers: new Headers(),
    });
  });

  it("opens Workspace image media in the old media viewer with a blob display URL", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-viewer-image");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile.mockResolvedValueOnce({
      blob: new Blob(["image-bytes"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="server-screen.png"',
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
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=hint-screen.png&content_type=image%2Fpng",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "hint-screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => {
      expect(captured.loadWorkspaceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileUuid: "44444444-4444-4444-8444-444444444444",
          signal: expect.any(AbortSignal),
          requestOptions: expect.objectContaining({
            accessToken: "access-token",
            devTargetOrigin: "https://org-a.example.com",
            projectId: "project-a",
          }),
        }),
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
      alt: "hint-screen.png",
      downloadFileName: "server-screen.png",
      workspaceFile: {
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "server-screen.png",
        contentType: "image/png",
        objectUrl: "blob:workspace-viewer-image",
      },
    });
    expect(viewerItem?.url).not.toContain("/api/workspace/v1/messenger/files");
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    unmount();

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-viewer-image");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("keeps the file hint when the Workspace response has no filename", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-viewer-fallback");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile.mockResolvedValueOnce({
      blob: new Blob(["image-bytes"], { type: "image/png" }),
      headers: new Headers(),
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
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=hint-screen.png",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "hint-screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => expect(useMediaViewerStore.getState().isOpen).toBe(true));
    expect(useMediaViewerStore.getState().items[0]).toMatchObject({
      downloadFileName: "hint-screen.png",
      workspaceFile: { name: "hint-screen.png" },
    });

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-viewer-fallback");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("opens a Workspace image gallery in the old media viewer with the clicked index", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-gallery-second")
      .mockReturnValueOnce("blob:workspace-gallery-first");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile
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
          href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png&content_type=image%2Fpng",
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
                href: "urn:image:11111111-1111-4111-8111-111111111111?name=first.png&content_type=image%2Fpng",
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
                href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png&content_type=image%2Fpng",
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

    expect(captured.loadWorkspaceFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileUuid: "11111111-1111-4111-8111-111111111111",
        signal: expect.any(AbortSignal),
        requestOptions: expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
        }),
      }),
    );
    expect(captured.loadWorkspaceFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileUuid: "22222222-2222-4222-8222-222222222222",
        signal: expect.any(AbortSignal),
        requestOptions: expect.objectContaining({
          accessToken: "access-token",
          devTargetOrigin: "https://org-a.example.com",
          projectId: "project-a",
        }),
      }),
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
    expect(useMediaViewerStore.getState().items[0]?.url).not.toContain(
      "/api/workspace/v1/messenger/files",
    );
    expect(useMediaViewerStore.getState().items[1]?.url).not.toContain(
      "/api/workspace/v1/messenger/files",
    );

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-first");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-second");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("opens the gallery after the selected image and fills other slots later", async () => {
    const firstImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const selectedImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:workspace-gallery-selected")
      .mockReturnValueOnce("blob:workspace-gallery-first");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    captured.loadWorkspaceFile.mockImplementation((options: { fileUuid: string }) => {
      return options.fileUuid.startsWith("11111111") ? firstImage.promise : selectedImage.promise;
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
          href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png",
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
                href: "urn:image:11111111-1111-4111-8111-111111111111?name=first.png",
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
                href: "urn:image:22222222-2222-4222-8222-222222222222?name=second.png",
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

    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(2));
    selectedImage.resolve({
      blob: new Blob(["selected-image"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="server-second.png"',
      }),
    });

    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
      expect(useMediaViewerStore.getState().items[1]?.url).toBe("blob:workspace-gallery-selected");
      expect(useMediaViewerStore.getState().items[1]?.downloadFileName).toBe("server-second.png");
      expect(useMediaViewerStore.getState().items[1]?.workspaceFile?.name).toBe(
        "server-second.png",
      );
    });
    expect(useMediaViewerStore.getState().items[0]?.url).toBe("");
    expect(useMediaViewerStore.getState().items[0]?.downloadFileName).toBe("first.png");
    expect(useMediaViewerStore.getState().items[0]?.workspaceFile?.name).toBe("first.png");

    firstImage.resolve({
      blob: new Blob(["first-image"], { type: "image/png" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="server-first.png"',
      }),
    });
    await waitFor(() => {
      expect(useMediaViewerStore.getState().items[0]?.url).toBe("blob:workspace-gallery-first");
      expect(useMediaViewerStore.getState().items[0]?.downloadFileName).toBe("server-first.png");
      expect(useMediaViewerStore.getState().items[0]?.workspaceFile?.name).toBe("server-first.png");
    });

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-selected");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-first");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("drops a stale Workspace gallery result after the conversation changes", async () => {
    const staleImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const staleFile = {
      kind: "media" as const,
      href: "urn:image:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?name=stale.png",
      fileUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "stale.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    captured.loadWorkspaceFile.mockReturnValue(staleImage.promise);

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(staleFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1));

    act(() => {
      navigateTo?.(`/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${DIRECT_TOPIC_UUID}`);
    });
    await act(async () => {
      staleImage.resolve({
        blob: new Blob(["stale-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await staleImage.promise;
    });

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();

    unmount();
    createObjectURL.mockRestore();
  });

  it("drops a stale Workspace gallery result after the runtime changes", async () => {
    const staleImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const staleFile = {
      kind: "media" as const,
      href: "urn:image:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?name=stale.png",
      fileUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "stale.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    captured.loadWorkspaceFile.mockReturnValue(staleImage.promise);

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(staleFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1));

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
    await act(async () => {
      staleImage.resolve({
        blob: new Blob(["stale-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await staleImage.promise;
    });

    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();

    unmount();
    createObjectURL.mockRestore();
  });

  it("ignores an old gallery result after a new gallery opens", async () => {
    const oldImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const newImage = createDeferred<{ blob: Blob; headers: Headers }>();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:workspace-gallery-new");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const oldFile = {
      kind: "media" as const,
      href: "urn:image:cccccccc-cccc-4ccc-8ccc-cccccccccccc?name=old.png",
      fileUuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "old.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    const newFile = {
      kind: "media" as const,
      href: "urn:image:dddddddd-dddd-4ddd-8ddd-dddddddddddd?name=new.png",
      fileUuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "new.png",
      contentType: "image/png",
      mediaKind: "image" as const,
    };
    captured.loadWorkspaceFile.mockImplementation((options: { fileUuid: string }) =>
      options.fileUuid === oldFile.fileUuid ? oldImage.promise : newImage.promise,
    );

    const { unmount } = renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(oldFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1));

    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.(newFile);
    });
    await waitFor(() => expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(2));

    await act(async () => {
      oldImage.resolve({
        blob: new Blob(["old-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await oldImage.promise;
    });
    expect(useMediaViewerStore.getState().isOpen).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      newImage.resolve({
        blob: new Blob(["new-image"], { type: "image/png" }),
        headers: new Headers(),
      });
      await newImage.promise;
    });
    await waitFor(() => {
      expect(useMediaViewerStore.getState().isOpen).toBe(true);
      expect(useMediaViewerStore.getState().items[0]?.workspaceFile?.fileUuid).toBe(
        newFile.fileUuid,
      );
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-gallery-new");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("aborts an in-flight Workspace viewer fetch when the runtime context changes", async () => {
    let viewerSignal: AbortSignal | undefined;
    captured.loadWorkspaceFile.mockImplementation((requestOptions: { signal?: AbortSignal }) => {
      viewerSignal = requestOptions.signal;
      return new Promise((_, reject) => {
        requestOptions.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    renderWorkspaceChatPageWithShellContexts(
      `/org/org-a/project/project-a/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );

    await waitFor(() =>
      expect(captured.messageListProps?.onOpenWorkspaceMedia).toEqual(expect.any(Function)),
    );
    act(() => {
      captured.messageListProps?.onOpenWorkspaceMedia?.({
        kind: "media",
        href: "urn:image:44444444-4444-4444-8444-444444444444?name=screen.png&content_type=image%2Fpng",
        fileUuid: "44444444-4444-4444-8444-444444444444",
        name: "screen.png",
        contentType: "image/png",
        mediaKind: "image",
      });
    });

    await waitFor(() => {
      expect(captured.loadWorkspaceFile).toHaveBeenCalledTimes(1);
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
      href: "urn:image:44444444-4444-4444-8444-444444444444?name=screen.png",
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
    expect(captured.loadWorkspaceMessages).not.toHaveBeenCalled();
  });
});
