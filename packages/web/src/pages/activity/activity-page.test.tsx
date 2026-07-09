import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import {
  type WorkspaceAuthSession,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { createMessage, createUser } from "~/test/factories";
import { ActivityPage } from "./activity-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const loadLegacyActivityEmptyPage = vi.hoisted(() => vi.fn());
const fetchWorkspaceStarredMessages = vi.hoisted(() => vi.fn());
const hydrateActivityMessagesFromCache = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const unstarMessageUnsupported = vi.hoisted(() => vi.fn());
const openWorkspaceForward = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/activity/activity.api", () => ({
  loadLegacyActivityEmptyPage,
}));

vi.mock("~/entities/activity/activity-workspace-starred.api", () => ({
  fetchWorkspaceStarredMessages,
}));

vi.mock("~/features/workspace-forward-message/workspace-forward-message.model", () => ({
  useWorkspaceForwardMessageStore: (
    selector: (state: { open: typeof openWorkspaceForward }) => unknown,
  ) => selector({ open: openWorkspaceForward }),
}));

vi.mock("~/entities/activity/activity-cache.lib", async () => {
  const actual = await vi.importActual<typeof import("~/entities/activity/activity-cache.lib")>(
    "~/entities/activity/activity-cache.lib",
  );
  return {
    ...actual,
    hydrateActivityMessagesFromCache,
  };
});

vi.mock("~/shared/api/messenger-messages.api", async () => {
  const actual = await vi.importActual<typeof import("~/shared/api/messenger-messages.api")>(
    "~/shared/api/messenger-messages.api",
  );
  return {
    ...actual,
    unstarMessageUnsupported,
  };
});

const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);

function mockElementScrollHeight(value: number): () => void {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return value;
    },
  });

  return () => {
    if (scrollHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeightDescriptor);
      return;
    }
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  };
}

const WORKSPACE_SESSION: WorkspaceAuthSession = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "acme",
  organizationOrigin: "https://acme.example.com",
  projectId: "project-1",
  userUuid: "user-1",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  runtimeGeneration: 1,
  login: "alice@example.com",
  profile: {
    uuid: "user-1",
    username: "alice",
    firstName: "Alice",
    lastName: null,
    email: "alice@example.com",
  },
};

function setWorkspaceSession(session: WorkspaceAuthSession = WORKSPACE_SESSION): void {
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
}

function createWorkspaceMessage(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: "message-1",
    project_id: WORKSPACE_SESSION.projectId,
    stream_uuid: "stream-1",
    topic_uuid: "topic-1",
    author_uuid: "user-2",
    payload: { kind: "markdown", content: "Workspace starred message" },
    user_uuid: WORKSPACE_SESSION.userUuid,
    read: true,
    pinned: false,
    starred: true,
    is_own: false,
    reactions: {},
    created_at: "2026-06-22T10:10:00Z",
    updated_at: "2026-06-22T10:10:00Z",
    ...overrides,
  };
}

function seedWorkspaceMessengerContext(): void {
  const stream: MessengerStream = {
    uuid: "stream-1",
    projectId: WORKSPACE_SESSION.projectId,
    ownerUuid: WORKSPACE_SESSION.userUuid,
    userUuid: WORKSPACE_SESSION.userUuid,
    role: "member",
    notificationMode: "all_messages",
    name: "engineering",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "2026-06-22T10:00:00Z",
    updatedAt: "2026-06-22T10:00:00Z",
  };
  const topic: MessengerTopic = {
    uuid: "topic-1",
    projectId: WORKSPACE_SESSION.projectId,
    streamUuid: "stream-1",
    userUuid: WORKSPACE_SESSION.userUuid,
    name: "bugs",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "2026-06-22T10:00:00Z",
    updatedAt: "2026-06-22T10:00:00Z",
  };

  useMessengerStore.setState({
    ownerKey: `${WORKSPACE_SESSION.organizationId}:${WORKSPACE_SESSION.projectId}:${WORKSPACE_SESSION.userUuid}`,
    streamsById: { [stream.uuid]: stream },
    streamIds: [stream.uuid],
    topicsById: { [topic.uuid]: topic },
    topicIds: [topic.uuid],
  });
}

function mockWorkspaceStarredPage(messages: WorkspaceMessengerMessageDto[]): void {
  fetchWorkspaceStarredMessages.mockResolvedValue({
    messages,
    nextPageMarker: null,
    hasMore: false,
    pageLimit: null,
  });
}

describe("ActivityPage drafts routing", () => {
  beforeEach(() => {
    useActivityStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
    useMessengerStore.getState().clear();
    openWorkspaceForward.mockReset();
    unstarMessageUnsupported.mockRejectedValue(new Error("unsupported"));
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
  });

  afterEach(() => {
    navigateSpy.mockReset();
    loadLegacyActivityEmptyPage.mockReset();
    fetchWorkspaceStarredMessages.mockReset();
    hydrateActivityMessagesFromCache.mockReset();
    hydrateActivityMessagesFromCache.mockResolvedValue([]);
    unstarMessageUnsupported.mockReset();
    openWorkspaceForward.mockReset();
    unstarMessageUnsupported.mockRejectedValue(new Error("unsupported"));
    useDraftStore.getState().clear();
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useActivityStore.getState().clear();
    useWorkspaceAuthStore.getState().clear();
    useMessengerStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
  });

  it("navigates stream drafts using the canonical stream slug from the store", async () => {
    useChatListStore.setState({
      streamsMap: new Map([
        [
          10,
          {
            stream_id: 10,
            name: "engineering",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]),
    });

    useDraftStore.getState().setDrafts([
      {
        id: 1,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Draft content",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Draft content")).toBeInTheDocument();
      expect(
        screen.getByText((_, element) => element?.textContent === "#engineering · general"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Draft content"));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/general");
  });

  it("renders empty-topic drafts as the system general chat and routes them to __empty__", async () => {
    useChatListStore.setState({
      streamsMap: new Map([
        [
          10,
          {
            stream_id: 10,
            name: "engineering",
            lastMessage: "",
            time: "",
            ts: 0,
            topics: new Map(),
          },
        ],
      ]),
    });

    useDraftStore.getState().setDrafts([
      {
        id: 1,
        type: "stream",
        to: [10],
        topic: "",
        content: "Draft content",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Draft content")).toBeInTheDocument();
      expect(screen.getByText("General Chat")).toHaveClass("italic");
    });

    fireEvent.click(screen.getByText("Draft content"));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/__empty__");
  });

  it("does not read numeric DM draft ids from the Workspace user store", async () => {
    useUsersStore.getState().upsertUser(createUser({ user_id: 7, full_name: "Bob" }));
    useChatListStore.setState({ currentUserId: 42 });

    useDraftStore.getState().setDrafts([
      {
        id: 2,
        type: "private",
        to: [7, 42],
        topic: "",
        content: "DM draft text",
        timestamp: 1710000001,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("DM draft text")).toBeInTheDocument();
      expect(screen.getByText("Private ·")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Bob/)).not.toBeInTheDocument();
  });

  it("opens activity message in chat from context action", async () => {
    const page = [
      createMessage({
        id: 33,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "Open me",
        timestamp: 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    ];

    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: page,
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Open me")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open in chat" }));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/bugs?msg=33");
  });

  it("opens forward flow from activity message action", async () => {
    const page = [
      createMessage({
        id: 44,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "Forward me",
        timestamp: 1,
        type: "stream",
        display_recipient: "engineering",
      }),
    ];

    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: page,
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Forward me")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/bugs?msg=44&forward=44");
  });

  it("renders cached activity list immediately while newest refresh is in flight", () => {
    const cachedMention = createMessage({
      id: 88,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Cached mention",
      timestamp: 1,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;
    useActivityStore.getState().setFilterCache("mentions", [cachedMention], true);
    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: [cachedMention],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Cached mention")).toBeInTheDocument();
  });

  it("keeps current in-memory activity snapshot when cached snapshot is older", async () => {
    const freshReaction = createMessage({
      id: 30,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Fresh reaction",
      timestamp: 300,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;
    const oldReaction = createMessage({
      id: 10,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Old reaction",
      timestamp: 100,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;

    useChatListStore.setState({ currentUserId: 42 });
    useActivityStore.getState().setFilterCache("reactions", [freshReaction], true);
    useActivityStore.setState((state) => ({
      filters: {
        ...state.filters,
        reactions: { ...state.filters.reactions, lastLoadedAt: null },
      },
    }));
    hydrateActivityMessagesFromCache.mockResolvedValue([oldReaction]);
    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: [freshReaction],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(loadLegacyActivityEmptyPage).toHaveBeenCalled();
    });

    expect(screen.getByText("Fresh reaction")).toBeInTheDocument();
    expect(screen.queryByText("Old reaction")).not.toBeInTheDocument();
  });

  it("applies cached activity snapshot when it is fresher than in-memory state", async () => {
    const oldReaction = createMessage({
      id: 10,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Old reaction",
      timestamp: 100,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;
    const freshReaction = createMessage({
      id: 30,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      subject: "bugs",
      content: "Fresh reaction",
      timestamp: 300,
      type: "stream",
      display_recipient: "engineering",
    }) as ZulipRawMessage;

    useChatListStore.setState({ currentUserId: 42 });
    useActivityStore.getState().setFilterCache("reactions", [oldReaction], true);
    useActivityStore.setState((state) => ({
      filters: {
        ...state.filters,
        reactions: { ...state.filters.reactions, lastLoadedAt: null },
      },
    }));
    hydrateActivityMessagesFromCache.mockResolvedValue([freshReaction]);
    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: [freshReaction],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Fresh reaction")).toBeInTheDocument();
    });

    expect(screen.queryByText("Old reaction")).not.toBeInTheDocument();
  });

  it("loads starred messages from Workspace and keeps the row when unstar is unsupported", async () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    mockWorkspaceStarredPage([
      createWorkspaceMessage({
        uuid: "message-55",
        payload: { kind: "markdown", content: "Starred message" },
      }),
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Starred message")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /unstar/i }));

    await waitFor(() => {
      expect(unstarMessageUnsupported).toHaveBeenCalledWith("message-55");
    });
    expect(fetchWorkspaceStarredMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: expect.objectContaining({
          organizationId: WORKSPACE_SESSION.organizationId,
          projectId: WORKSPACE_SESSION.projectId,
          userUuid: WORKSPACE_SESSION.userUuid,
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchWorkspaceStarredMessages.mock.calls[0]?.[0]).not.toHaveProperty("pageLimit");
    expect(screen.getByText("Starred message")).toBeInTheDocument();
  });

  it("does not expose Workspace UUID fallbacks in starred rows", async () => {
    setWorkspaceSession();
    mockWorkspaceStarredPage([
      createWorkspaceMessage({
        uuid: "message-no-context",
        stream_uuid: "stream-missing",
        topic_uuid: "topic-missing",
        author_uuid: "author-missing",
        payload: { kind: "markdown", content: "Starred message without context" },
      }),
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Starred message without context")).toBeInTheDocument();
    });

    expect(screen.queryByText("stream-missing")).not.toBeInTheDocument();
    expect(screen.queryByText("topic-missing")).not.toBeInTheDocument();
    expect(screen.queryByText("author-missing")).not.toBeInTheDocument();
  });

  it("opens Workspace starred message in the Workspace messenger route", async () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    mockWorkspaceStarredPage([
      createWorkspaceMessage({
        uuid: "message-56",
        payload: { kind: "markdown", content: "Starred message persists" },
      }),
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Starred message persists")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open in chat" }));

    expect(navigateSpy).toHaveBeenCalledWith("/org/acme/project/project-1/message/message-56");
  });

  it("opens Workspace starred forward flow with message UUID", async () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    mockWorkspaceStarredPage([
      createWorkspaceMessage({
        uuid: "message-56",
        payload: { kind: "markdown", content: "Forward Workspace starred" },
      }),
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Forward Workspace starred")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(openWorkspaceForward).toHaveBeenCalledWith({
      messageUuids: ["message-56"],
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("does not apply stale Workspace starred load after runtime changes", async () => {
    let resolveFirstLoad:
      | ((value: {
          messages: WorkspaceMessengerMessageDto[];
          nextPageMarker: null;
          hasMore: false;
          pageLimit: number | null;
        }) => void)
      | undefined;
    const nextSession: WorkspaceAuthSession = {
      ...WORKSPACE_SESSION,
      accountId: "account-2",
      instanceId: "instance-2",
      organizationId: "bravo",
      projectId: "project-2",
      userUuid: "user-9",
      runtimeGeneration: 2,
    };

    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    fetchWorkspaceStarredMessages
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstLoad = resolve;
          }),
      )
      .mockResolvedValueOnce({
        messages: [
          createWorkspaceMessage({
            uuid: "message-b",
            project_id: nextSession.projectId,
            user_uuid: nextSession.userUuid,
            payload: { kind: "markdown", content: "Org B starred message" },
          }),
        ],
        nextPageMarker: null,
        hasMore: false,
        pageLimit: null,
      });

    const { rerender } = render(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchWorkspaceStarredMessages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      setWorkspaceSession(nextSession);
    });
    rerender(
      <MemoryRouter initialEntries={["/activity/starred"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Org B starred message")).toBeInTheDocument();
    });

    act(() => {
      resolveFirstLoad?.({
        messages: [
          createWorkspaceMessage({
            uuid: "message-a",
            payload: { kind: "markdown", content: "Org A starred message" },
          }),
        ],
        nextPageMarker: null,
        hasMore: false,
        pageLimit: null,
      });
    });

    expect(screen.getByText("Org B starred message")).toBeInTheDocument();
    expect(screen.queryByText("Org A starred message")).not.toBeInTheDocument();
  });

  it("does not fetch reactions until currentUserId is known", async () => {
    useChatListStore.setState({ currentUserId: null });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    loadLegacyActivityEmptyPage.mockClear();
    expect(loadLegacyActivityEmptyPage).not.toHaveBeenCalled();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: [
        createMessage({
          id: 50,
          sender_id: 42,
          content: "My reacted message",
          timestamp: 2,
        }),
      ],
      foundOldest: true,
    });

    act(() => {
      useChatListStore.getState().setCurrentUserId(42);
    });

    await waitFor(() => {
      expect(loadLegacyActivityEmptyPage).toHaveBeenCalledWith(
        "reactions",
        42,
        "newest",
        expect.any(Number),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("shows reactions-specific empty state copy", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: [],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Your messages that received emoji reactions will appear here/i),
      ).toBeInTheDocument();
    });
  });

  it("shows peer emoji reactions on the reactions activity list", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore
      .getState()
      .upsertUsers([
        createUser({ user_id: 7, full_name: "Bob" }),
        createUser({ user_id: 42, full_name: "Me" }),
      ]);
    loadLegacyActivityEmptyPage.mockResolvedValue({
      messages: [
        createMessage({
          id: 50,
          sender_id: 42,
          content: "My reacted message",
          timestamp: 2,
          reactions: [
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 42,
            },
            {
              emoji_name: "thumbs_up",
              emoji_code: "1f44d",
              reaction_type: "unicode_emoji",
              user_id: 7,
            },
          ],
        }),
      ],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/activity/reactions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("My reacted message")).toBeInTheDocument();
    });

    const reactionsRow = screen.getByTestId("activity-peer-reactions-50");
    expect(reactionsRow).toHaveTextContent("Bob");
    expect(reactionsRow).toHaveTextContent("👍");
    expect(reactionsRow).not.toHaveTextContent("Me");
  });

  it.each(["mentions", "reactions"] as const)(
    "initializes %s list at the latest messages",
    async (filter) => {
      const restoreScrollHeight = mockElementScrollHeight(1200);
      try {
        if (filter === "reactions") {
          useChatListStore.setState({ currentUserId: 42 });
        }
        const page = [
          createMessage({
            id: 10,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: `${filter} first`,
            timestamp: 1,
            type: "stream",
            display_recipient: "engineering",
          }),
          createMessage({
            id: 20,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: `${filter} latest`,
            timestamp: 2,
            type: "stream",
            display_recipient: "engineering",
          }),
        ];

        loadLegacyActivityEmptyPage.mockResolvedValue({
          messages: page,
          foundOldest: true,
        });

        const { container } = render(
          <MemoryRouter initialEntries={[`/activity/${filter}`]}>
            <Routes>
              <Route path="/activity/:filter" element={<ActivityPage />} />
            </Routes>
          </MemoryRouter>,
        );

        await waitFor(() => {
          expect(screen.getByText(`${filter} latest`)).toBeInTheDocument();
        });

        const list = container.querySelector("ul");
        expect(list).not.toBeNull();
        expect((list as HTMLUListElement).scrollTop).toBe(1200);
      } finally {
        restoreScrollHeight();
      }
    },
  );

  it("initializes Workspace starred list at the latest messages", async () => {
    const restoreScrollHeight = mockElementScrollHeight(1200);
    try {
      setWorkspaceSession();
      seedWorkspaceMessengerContext();
      mockWorkspaceStarredPage([
        createWorkspaceMessage({
          uuid: "message-10",
          payload: { kind: "markdown", content: "starred first" },
          created_at: "2026-06-22T10:00:00Z",
        }),
        createWorkspaceMessage({
          uuid: "message-20",
          payload: { kind: "markdown", content: "starred latest" },
          created_at: "2026-06-22T10:01:00Z",
        }),
      ]);

      const { container } = render(
        <MemoryRouter initialEntries={["/activity/starred"]}>
          <Routes>
            <Route path="/activity/:filter" element={<ActivityPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("starred latest")).toBeInTheDocument();
      });

      const list = container.querySelector("ul");
      expect(list).not.toBeNull();
      expect((list as HTMLUListElement).scrollTop).toBe(1200);
    } finally {
      restoreScrollHeight();
    }
  });

  it("initializes drafts list at the latest items", async () => {
    const restoreScrollHeight = mockElementScrollHeight(1200);
    try {
      useDraftStore.getState().setDrafts([
        {
          id: 1,
          type: "stream",
          to: [10],
          topic: "general",
          content: "Older draft",
          timestamp: 1710000000,
        },
        {
          id: 2,
          type: "stream",
          to: [10],
          topic: "general",
          content: "Latest draft",
          timestamp: 1710000100,
        },
      ]);

      const { container } = render(
        <MemoryRouter initialEntries={["/activity/drafts"]}>
          <Routes>
            <Route path="/activity/:filter" element={<ActivityPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Latest draft")).toBeInTheDocument();
      });

      const list = container.querySelector("ul");
      expect(list).not.toBeNull();
      expect((list as HTMLUListElement).scrollTop).toBe(1200);
    } finally {
      restoreScrollHeight();
    }
  });

  it("deletes a draft locally from the drafts list", async () => {
    useDraftStore.getState().setDrafts([
      {
        id: 7,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Pending delete draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Pending delete draft")).toBeInTheDocument();
    });

    const deleteButton = screen.getByTitle("Delete draft");
    fireEvent.click(deleteButton);

    expect(screen.queryByText("Pending delete draft")).not.toBeInTheDocument();
  });

  it("edits a draft locally from the drafts list", async () => {
    useDraftStore.getState().setDrafts([
      {
        id: 8,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Editable draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Editable draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Edit draft"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Edited draft content" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Edited draft content")).toBeInTheDocument();
  });

  it("edits a timestamp-only local draft from the drafts list", async () => {
    useDraftStore.getState().setDrafts([
      {
        id: null,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Local only draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Local only draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Edit draft"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Edited local draft" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Edited local draft")).toBeInTheDocument();
  });

  it("treats empty edited draft content as delete", async () => {
    useDraftStore.getState().setDrafts([
      {
        id: 12,
        type: "stream",
        to: [10],
        topic: "general",
        content: "Delete from edit draft",
        timestamp: 1710000000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/activity/drafts"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Delete from edit draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Edit draft"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.queryByText("Delete from edit draft")).not.toBeInTheDocument();
  });

  it("refetches activity messages when the page is marked stale", async () => {
    loadLegacyActivityEmptyPage
      .mockResolvedValueOnce({
        messages: [
          createMessage({
            id: 1,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: "Initial mention",
            timestamp: 1,
            type: "stream",
            display_recipient: "engineering",
          }),
        ],
        foundOldest: true,
      })
      .mockResolvedValueOnce({
        messages: [
          createMessage({
            id: 2,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: "Updated mention",
            timestamp: 2,
            type: "stream",
            display_recipient: "engineering",
          }),
        ],
        foundOldest: true,
      });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Initial mention")).toBeInTheDocument();
    });

    act(() => {
      useActivityStore.getState().markStale();
    });

    await waitFor(() => {
      expect(screen.getByText("Updated mention")).toBeInTheDocument();
    });

    expect(loadLegacyActivityEmptyPage).toHaveBeenCalledTimes(2);
  });

  it("does not apply cached mentions from the previous organization after switch", async () => {
    let resolveHydrate!: (messages: ZulipRawMessage[]) => void;
    const staleHydrate = new Promise<ZulipRawMessage[]>((resolve) => {
      resolveHydrate = resolve;
    });

    let resolveNextOrgFetch!: (value: {
      messages: ZulipRawMessage[];
      foundOldest: boolean;
    }) => void;
    const nextOrgFetch = new Promise<{ messages: ZulipRawMessage[]; foundOldest: boolean }>(
      (resolve) => {
        resolveNextOrgFetch = resolve;
      },
    );

    hydrateActivityMessagesFromCache
      .mockReturnValueOnce(staleHydrate)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    loadLegacyActivityEmptyPage.mockReturnValue(nextOrgFetch);

    useInstancesStore.setState({
      instances: [{ id: "instance-1" }, { id: "instance-2" }],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("instance-2");
      useActivityStore.getState().clear();
    });

    await act(async () => {
      resolveHydrate([
        createMessage({
          id: 901,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "Old org cached mention",
          timestamp: 1,
          type: "stream",
          display_recipient: "engineering",
        }),
      ]);
      await staleHydrate;
    });

    expect(useActivityStore.getState().filters.mentions.messages).toEqual([]);

    await act(async () => {
      resolveNextOrgFetch({
        messages: [
          createMessage({
            id: 902,
            sender_id: 99,
            sender_full_name: "Bob",
            stream_id: 20,
            subject: "support",
            content: "Current org mention",
            timestamp: 2,
            type: "stream",
            display_recipient: "support",
          }),
        ],
        foundOldest: true,
      });
      await nextOrgFetch;
    });

    await waitFor(() => {
      expect(screen.getByText("Current org mention")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old org cached mention")).not.toBeInTheDocument();
  });

  it("does not apply stale mentions refresh after organization switch", async () => {
    let resolveOldFetch!: (value: { messages: ZulipRawMessage[]; foundOldest: boolean }) => void;
    const oldFetch = new Promise<{ messages: ZulipRawMessage[]; foundOldest: boolean }>(
      (resolve) => {
        resolveOldFetch = resolve;
      },
    );

    let resolveNewFetch!: (value: { messages: ZulipRawMessage[]; foundOldest: boolean }) => void;
    const newFetch = new Promise<{ messages: ZulipRawMessage[]; foundOldest: boolean }>(
      (resolve) => {
        resolveNewFetch = resolve;
      },
    );

    hydrateActivityMessagesFromCache.mockResolvedValue([]);
    loadLegacyActivityEmptyPage.mockReturnValueOnce(oldFetch).mockReturnValueOnce(newFetch);

    useInstancesStore.setState({
      instances: [{ id: "instance-1" }, { id: "instance-2" }],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });

    render(
      <MemoryRouter initialEntries={["/activity/mentions"]}>
        <Routes>
          <Route path="/activity/:filter" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(loadLegacyActivityEmptyPage).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useInstancesStore.getState().setCurrentInstanceId("instance-2");
      useActivityStore.getState().clear();
    });

    await waitFor(() => {
      expect(loadLegacyActivityEmptyPage).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveOldFetch({
        messages: [
          createMessage({
            id: 903,
            sender_id: 42,
            sender_full_name: "Alice",
            stream_id: 10,
            subject: "bugs",
            content: "Old org refreshed mention",
            timestamp: 1,
            type: "stream",
            display_recipient: "engineering",
          }),
        ],
        foundOldest: true,
      });
      await oldFetch;
    });

    expect(useActivityStore.getState().filters.mentions.messages).toEqual([]);

    await act(async () => {
      resolveNewFetch({
        messages: [
          createMessage({
            id: 904,
            sender_id: 99,
            sender_full_name: "Bob",
            stream_id: 20,
            subject: "support",
            content: "Current org refreshed mention",
            timestamp: 2,
            type: "stream",
            display_recipient: "support",
          }),
        ],
        foundOldest: true,
      });
      await newFetch;
    });

    await waitFor(() => {
      expect(screen.getByText("Current org refreshed mention")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old org refreshed mention")).not.toBeInTheDocument();
  });
});
