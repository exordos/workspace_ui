import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFeedStore } from "~/entities/feed/feed.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceForwardMessageStore } from "~/features/workspace-forward-message/workspace-forward-message.model";
import { FeedPage } from "./feed-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchFeedMessages = vi.hoisted(() => vi.fn());
const hydrateFeedMessagesFromCache = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/feed/feed.api", async () => {
  const actual = await vi.importActual<typeof import("~/entities/feed/feed.api")>(
    "~/entities/feed/feed.api",
  );
  return {
    ...actual,
    fetchFeedMessages,
    hydrateFeedMessagesFromCache,
  };
});

const ACCOUNT_ID = "account-a";
const INSTANCE_ID = "instance-a";
const ORG_ID = "org-a";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STREAM_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOPIC_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight",
);
const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

function createSession(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
  return {
    accountId: ACCOUNT_ID,
    instanceId: INSTANCE_ID,
    organizationId: ORG_ID,
    organizationOrigin: "https://org.example.com",
    projectId: PROJECT_ID,
    userUuid: USER_UUID,
    accessToken: "access-token",
    login: "user@example.com",
    profile: {
      uuid: USER_UUID,
      username: "user",
      firstName: "Current",
      lastName: "User",
      email: "user@example.com",
      status: "active",
    },
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createUser(overrides: Partial<User> = {}): User {
  return {
    uuid: AUTHOR_UUID,
    username: "alice",
    firstName: "Alice",
    lastName: "Reader",
    displayName: "Alice Reader",
    email: "alice@example.com",
    avatarUrl: null,
    status: "active",
    statusEmoji: null,
    statusText: null,
    lastPingAt: "2026-07-02T10:00:00Z",
    createdAt: "2026-07-02T10:00:00Z",
    updatedAt: "2026-07-02T10:00:00Z",
    ...overrides,
  };
}

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function createFeedMessage(overrides: MessageOverrides = {}): MessengerMessage {
  const { markdown, payload, ...rest } = overrides;
  return {
    uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: PROJECT_ID,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: AUTHOR_UUID,
    userUuid: USER_UUID,
    payload: payload ?? { kind: "markdown", content: markdown ?? "Workspace feed message" },
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-02T10:00:00Z",
    updatedAt: "2026-07-02T10:00:00Z",
    ...rest,
  };
}

function createPage(
  messages: MessengerMessage[],
  nextPageMarker: string | null = null,
): {
  messages: MessengerMessage[];
  nextPageMarker: string | null;
  hasMore: boolean;
  pageLimit: number | null;
} {
  return {
    messages,
    nextPageMarker,
    hasMore: nextPageMarker != null,
    pageLimit: 50,
  };
}

function setRuntime(session: WorkspaceAuthSession = createSession()): string {
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
  return workspaceRuntimeOwnerKey(session);
}

function renderFeedPage() {
  return render(
    <MemoryRouter initialEntries={[`/org/${ORG_ID}/project/${PROJECT_ID}/feed`]}>
      <Routes>
        <Route path="/org/:orgId/project/:projectId/feed" element={<FeedPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function resetStores(): void {
  useFeedStore.getState().clear();
  useMessengerStore.getState().clear();
  useUsersStore.getState().clear();
  useWorkspaceAuthStore.setState({
    sessions: [],
    currentAccountId: null,
    runtimeGeneration: 0,
  });
  useWorkspaceForwardMessageStore.getState().reset();
}

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

function mockElementScrollTo(
  impl: (this: HTMLElement, options: ScrollToOptions) => void,
): () => void {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: impl,
  });

  return () => {
    if (scrollToDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollToDescriptor);
      return;
    }
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  };
}

describe("FeedPage", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    fetchFeedMessages.mockReset();
    hydrateFeedMessagesFromCache.mockReset();
    hydrateFeedMessagesFromCache.mockResolvedValue([]);
    resetStores();
  });

  it("loads Workspace feed messages after runtime becomes available", async () => {
    const message = createFeedMessage({ markdown: "Deferred Workspace feed load" });
    fetchFeedMessages.mockResolvedValue(createPage([message]));

    renderFeedPage();
    expect(fetchFeedMessages).not.toHaveBeenCalled();

    act(() => {
      setRuntime();
    });

    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeContext: expect.objectContaining({ projectId: PROJECT_ID }),
          pageLimit: 50,
          signal: expect.any(AbortSignal),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Deferred Workspace feed load")).toBeInTheDocument();
    });
  });

  it("renders Workspace author names from authorUuid only", async () => {
    setRuntime();
    useUsersStore.getState().replaceUsers([createUser()]);
    fetchFeedMessages.mockResolvedValue(createPage([createFeedMessage()]));

    renderFeedPage();

    await waitFor(() => {
      expect(screen.getByText("Alice Reader")).toBeInTheDocument();
    });
  });

  it("opens the Workspace topic route from a feed row", async () => {
    setRuntime();
    fetchFeedMessages.mockResolvedValue(createPage([createFeedMessage()]));

    renderFeedPage();

    await waitFor(() => {
      expect(screen.getByText("Workspace feed message")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Workspace feed message"));

    expect(navigateSpy).toHaveBeenCalledWith(
      `/org/${ORG_ID}/project/${PROJECT_ID}/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`,
    );
  });

  it("renders Workspace feed message summary without raw file urls", async () => {
    const imageFileUuid = "11111111-1111-4111-8111-111111111111";
    setRuntime();
    fetchFeedMessages.mockResolvedValue(
      createPage([
        createFeedMessage({
          markdown: `![screen.png](urn:image:${imageFileUuid}?name=screen.png) Вот скрин`,
        }),
      ]),
    );

    renderFeedPage();

    await waitFor(() => {
      expect(screen.getByText("Изображение: Вот скрин")).toBeInTheDocument();
    });
    expect(screen.queryByText(/urn:image:/)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(imageFileUuid))).not.toBeInTheDocument();
  });

  it("opens Workspace forward from a feed row", async () => {
    setRuntime();
    const message = createFeedMessage();
    const openForwardSpy = vi.spyOn(useWorkspaceForwardMessageStore.getState(), "open");
    fetchFeedMessages.mockResolvedValue(createPage([message]));

    renderFeedPage();

    const button = await screen.findByRole("button", { name: "Forward" });

    fireEvent.click(button);
    expect(openForwardSpy).toHaveBeenCalledWith({ messageUuids: [message.uuid] });
    expect(navigateSpy).not.toHaveBeenCalled();
    openForwardSpy.mockRestore();
  });

  it("renders cached feed from the Workspace owner while refresh is in flight", () => {
    const ownerKey = setRuntime();
    useFeedStore.setState({
      ownerKey,
      messages: [createFeedMessage({ markdown: "Cached Workspace feed item" })],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      nextPageMarker: "cursor-a",
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
    });
    fetchFeedMessages.mockResolvedValue(createPage([createFeedMessage()]));

    renderFeedPage();

    expect(screen.getByText("Cached Workspace feed item")).toBeInTheDocument();
  });

  it("clears cached feed when the Workspace owner changes", async () => {
    const previousOwnerKey = workspaceRuntimeOwnerKey(
      createSession({ accountId: "old-account", runtimeGeneration: 1 }),
    );
    setRuntime(createSession({ accountId: "new-account", runtimeGeneration: 2 }));
    useFeedStore.setState({
      ownerKey: previousOwnerKey,
      messages: [createFeedMessage({ markdown: "Previous owner feed item" })],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: false,
      nextPageMarker: null,
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
    });
    fetchFeedMessages.mockResolvedValue(createPage([createFeedMessage({ markdown: "New owner" })]));

    renderFeedPage();

    await waitFor(() => {
      expect(screen.queryByText("Previous owner feed item")).not.toBeInTheDocument();
    });
  });

  it("requests more messages with the Workspace page marker", async () => {
    const ownerKey = setRuntime();
    const olderMessage = createFeedMessage({
      uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      markdown: "Older Workspace feed item",
      createdAt: "2026-07-02T09:00:00Z",
      updatedAt: "2026-07-02T09:00:00Z",
    });
    useFeedStore.setState({
      ownerKey,
      messages: [createFeedMessage({ markdown: "Loaded Workspace feed item" })],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      nextPageMarker: "cursor-a",
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
    });
    fetchFeedMessages
      .mockResolvedValueOnce(createPage([createFeedMessage()], "cursor-a"))
      .mockResolvedValueOnce(createPage([olderMessage]));

    const { container } = renderFeedPage();
    const list = container.querySelector("ul") as HTMLUListElement;
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 0 });

    fireEvent.scroll(list);

    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          pageMarker: "cursor-a",
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Older Workspace feed item")).toBeInTheDocument();
    });
  });

  it("ignores stale older page completion after Workspace owner changes", async () => {
    const oldOwnerKey = setRuntime();
    const newSession = createSession({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "org-b",
      projectId: "33333333-3333-4333-8333-333333333333",
      runtimeGeneration: 2,
    });
    const newOwnerKey = workspaceRuntimeOwnerKey(newSession);
    let resolveOldPage!: (page: ReturnType<typeof createPage>) => void;
    const oldPage = new Promise<ReturnType<typeof createPage>>((resolve) => {
      resolveOldPage = resolve;
    });
    let resolveNewPage!: (page: ReturnType<typeof createPage>) => void;
    const newPage = new Promise<ReturnType<typeof createPage>>((resolve) => {
      resolveNewPage = resolve;
    });

    useFeedStore.setState({
      ownerKey: oldOwnerKey,
      messages: [createFeedMessage({ markdown: "Old owner loaded item" })],
      isInitialLoading: false,
      isRefreshing: false,
      isLoadingMore: false,
      hasMore: true,
      nextPageMarker: "cursor-old",
      requestVersion: 0,
      lastLoadedAt: Date.now(),
      error: null,
    });
    fetchFeedMessages.mockImplementation(
      ({
        pageMarker,
        runtimeContext,
      }: {
        pageMarker?: string;
        runtimeContext?: { accountId?: string };
      }) => {
        if (pageMarker === "cursor-old") return oldPage;
        if (pageMarker === "cursor-new") return newPage;
        return Promise.resolve(
          createPage(
            [createFeedMessage()],
            runtimeContext?.accountId === newSession.accountId ? "cursor-new" : "cursor-old",
          ),
        );
      },
    );

    const { container } = renderFeedPage();
    const list = container.querySelector("ul") as HTMLUListElement;
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 0 });

    fireEvent.scroll(list);
    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledWith(
        expect.objectContaining({ pageMarker: "cursor-old" }),
      );
    });

    act(() => {
      setRuntime(newSession);
      useFeedStore.setState({
        ownerKey: newOwnerKey,
        messages: [createFeedMessage({ markdown: "New owner loaded item" })],
        isInitialLoading: false,
        isRefreshing: false,
        isLoadingMore: false,
        hasMore: true,
        nextPageMarker: "cursor-new",
        requestVersion: 0,
        lastLoadedAt: Date.now(),
        error: null,
      });
    });

    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 200 });
    fireEvent.scroll(list);
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(list);

    await waitFor(() => {
      expect(fetchFeedMessages).toHaveBeenCalledWith(
        expect.objectContaining({ pageMarker: "cursor-new" }),
      );
    });

    await act(async () => {
      resolveOldPage(
        createPage([
          createFeedMessage({
            uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            markdown: "Stale old owner item",
            createdAt: "2026-07-02T09:00:00Z",
          }),
        ]),
      );
      await oldPage;
    });

    expect(screen.queryByText("Stale old owner item")).not.toBeInTheDocument();
    expect(useFeedStore.getState().ownerKey).toBe(newOwnerKey);
    expect(useFeedStore.getState().isLoadingMore).toBe(true);
    expect(useFeedStore.getState().nextPageMarker).toBe("cursor-new");

    await act(async () => {
      resolveNewPage(
        createPage([
          createFeedMessage({
            uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            markdown: "Current new owner older item",
            createdAt: "2026-07-02T09:00:00Z",
          }),
        ]),
      );
      await newPage;
    });

    await waitFor(() => {
      expect(screen.getByText("Current new owner older item")).toBeInTheDocument();
    });
    expect(useFeedStore.getState().isLoadingMore).toBe(false);
  });

  it("initializes the feed list at the latest messages", async () => {
    const restoreScrollHeight = mockElementScrollHeight(1200);
    const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      Object.defineProperty(this, "scrollTop", {
        configurable: true,
        writable: true,
        value: options.top ?? 0,
      });
    });
    const restoreScrollTo = mockElementScrollTo(scrollTo);
    try {
      setRuntime();
      fetchFeedMessages.mockResolvedValue(
        createPage([
          createFeedMessage({
            uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            markdown: "Feed first item",
            createdAt: "2026-07-02T09:00:00Z",
          }),
          createFeedMessage({ markdown: "Feed latest item" }),
        ]),
      );

      const { container } = renderFeedPage();

      await waitFor(() => {
        expect(screen.getByText("Feed latest item")).toBeInTheDocument();
      });

      const list = container.querySelector("ul");
      expect(list).not.toBeNull();
      expect((list as HTMLUListElement).scrollTop).toBe(1200);
      expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "instant" });
    } finally {
      restoreScrollTo();
      restoreScrollHeight();
    }
  });
});
