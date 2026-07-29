import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ComposerDraftActions from "~/entities/composer-draft/composer-draft-actions.lib";
import {
  resetWorkspaceComposerDraftStoreForTests,
  useWorkspaceComposerDraftStore,
} from "~/entities/composer-draft/composer-draft.model";
import type { WorkspaceComposerDraft } from "~/entities/composer-draft/composer-draft.types";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import {
  type WorkspaceAuthSession,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { ActivityPage } from "./activity-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchWorkspaceStarredMessages = vi.hoisted(() => vi.fn());
const openWorkspaceForward = vi.hoisted(() => vi.fn());
const loadWorkspaceComposerDrafts = vi.hoisted(() => vi.fn());
const deleteWorkspaceComposerDraft = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/activity/activity-workspace-starred.api", () => ({
  fetchWorkspaceStarredMessages,
}));

vi.mock("~/entities/composer-draft/composer-draft-loader.lib", () => ({
  loadWorkspaceComposerDrafts,
}));

vi.mock("~/entities/composer-draft/composer-draft-actions.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof ComposerDraftActions>();
  return {
    ...actual,
    deleteWorkspaceComposerDraft,
  };
});

vi.mock("~/features/workspace-forward-message/workspace-forward-message.model", () => ({
  useWorkspaceForwardMessageStore: (
    selector: (state: { open: typeof openWorkspaceForward }) => unknown,
  ) => selector({ open: openWorkspaceForward }),
}));

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

function renderActivityPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/activity/:filter" element={<ActivityPage />} />
        <Route path="/org/:orgId/project/:projectId/activity/:filter" element={<ActivityPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

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

function seedWorkspaceDraft(overrides: Partial<WorkspaceComposerDraft> = {}): void {
  const ownerKey = workspaceRuntimeOwnerKey(WORKSPACE_SESSION);
  const draft: WorkspaceComposerDraft = {
    key: `${ownerKey}:draft-1`,
    draftUuid: "draft-1",
    ownerKey,
    conversationId: "topic:stream-1:topic-1",
    streamUuid: "stream-1",
    topicUuid: "topic-1",
    snapshotId: "snapshot-1",
    content: {
      text: "Review the release notes",
      replySession: { tabs: [], activeTabId: null },
    },
    etag: '"1"',
    disposition: "editable",
    syncStatus: "saved",
    serverUpdatedAt: "2026-06-22T10:10:00Z",
    updatedAt: Date.parse("2026-06-22T10:10:00Z"),
    ...overrides,
  };

  useWorkspaceComposerDraftStore.setState({
    draftsByKey: { [draft.key]: draft },
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

describe("ActivityPage", () => {
  beforeEach(() => {
    useWorkspaceAuthStore.getState().clear();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    resetWorkspaceComposerDraftStoreForTests();
    fetchWorkspaceStarredMessages.mockReset();
    openWorkspaceForward.mockReset();
    loadWorkspaceComposerDrafts.mockReset();
    loadWorkspaceComposerDrafts.mockResolvedValue(undefined);
    deleteWorkspaceComposerDraft.mockReset();
    deleteWorkspaceComposerDraft.mockReturnValue(true);
    navigateSpy.mockReset();
  });

  afterEach(() => {
    useWorkspaceAuthStore.getState().clear();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
    resetWorkspaceComposerDraftStoreForTests();
    fetchWorkspaceStarredMessages.mockReset();
    openWorkspaceForward.mockReset();
    loadWorkspaceComposerDrafts.mockReset();
    deleteWorkspaceComposerDraft.mockReset();
    navigateSpy.mockReset();
  });

  it("loads starred messages from Workspace without requesting a legacy page", async () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    mockWorkspaceStarredPage([
      createWorkspaceMessage({
        uuid: "message-55",
        payload: { kind: "markdown", content: "Starred message" },
      }),
    ]);

    renderActivityPage("/activity/starred");

    await waitFor(() => {
      expect(screen.getByText("Starred message")).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /unstar/i })).not.toBeInTheDocument();
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

    renderActivityPage("/activity/starred");

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

    renderActivityPage("/activity/starred");

    await waitFor(() => {
      expect(screen.getByText("Forward Workspace starred")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(openWorkspaceForward).toHaveBeenCalledWith({
      messageUuids: ["message-56"],
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["mentions", "Mentions are not connected to Workspace messaging yet."],
    ["reactions", "Reactions are not connected to Workspace messaging yet."],
  ] as const)("shows an explicit unsupported state for /activity/%s", (filter, message) => {
    renderActivityPage(`/activity/${filter}`);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(fetchWorkspaceStarredMessages).not.toHaveBeenCalled();
  });

  it("opens the native Workspace drafts page", () => {
    renderActivityPage("/activity/drafts");

    expect(screen.getByText("Drafts")).toBeInTheDocument();
    expect(screen.getByText("Workspace session is not ready yet.")).toBeInTheDocument();
    expect(fetchWorkspaceStarredMessages).not.toHaveBeenCalled();
  });

  it("uses full-width layout container for activity content", () => {
    const { container } = renderActivityPage("/activity/drafts");
    const pageRoot = container.querySelector("header")?.parentElement;

    expect(pageRoot).not.toBeNull();
    expect(pageRoot).toHaveClass("w-full");
    expect(pageRoot).toHaveClass("flex-1");
    expect(pageRoot).not.toHaveClass("max-w-narrow-page");
  });

  it("loads drafts explicitly and keeps compact sidebar context on the card", async () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    const ownerKey = workspaceRuntimeOwnerKey(WORKSPACE_SESSION);
    act(() => {
      useMessengerStore.setState((state) => ({
        streamsById: {
          ...state.streamsById,
          "stream-1": { ...state.streamsById["stream-1"]!, color: 0x2563eb },
        },
      }));
      useWorkspaceComposerDraftStore.setState({
        draftsByKey: {
          [`${ownerKey}:draft-1`]: {
            key: `${ownerKey}:draft-1`,
            draftUuid: "draft-1",
            ownerKey,
            conversationId: "topic:stream-1:topic-1",
            streamUuid: "stream-1",
            topicUuid: "topic-1",
            snapshotId: "snapshot-1",
            content: {
              text: "Review the release notes",
              replySession: { tabs: [], activeTabId: null },
            },
            etag: '"1"',
            disposition: "editable",
            syncStatus: "saved",
            serverUpdatedAt: "2026-06-22T10:10:00Z",
            updatedAt: Date.parse("2026-06-22T10:10:00Z"),
          },
        },
      });
    });

    renderActivityPage("/org/acme/project/project-1/activity/drafts");

    await waitFor(() => {
      expect(loadWorkspaceComposerDrafts).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeContext: expect.objectContaining({ projectId: "project-1" }),
        }),
      );
    });
    expect(screen.getByText("Channel")).toBeInTheDocument();
    expect(screen.getByText("#engineering")).toBeInTheDocument();
    expect(screen.getByText("bugs")).toBeInTheDocument();
    expect(screen.getByText("Review the release notes")).toBeInTheDocument();
    expect(screen.getByText("#")).toHaveAttribute("style", "background-color: rgb(37, 99, 235);");
    expect(screen.getByRole("button", { name: "Edit draft" })).toBeInTheDocument();
  });

  it("shows only deletion retry for a failed consumed draft", () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    seedWorkspaceDraft({ disposition: "consumed", syncStatus: "failed" });

    renderActivityPage("/org/acme/project/project-1/activity/drafts");

    expect(screen.getByText("Could not delete")).toBeInTheDocument();
    expect(screen.getByText("Review the release notes").closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry deletion" }));

    expect(deleteWorkspaceComposerDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: expect.objectContaining({ projectId: WORKSPACE_SESSION.projectId }),
      }),
      "draft-1",
    );
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("shows no actions for a consumed draft being deleted", () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    seedWorkspaceDraft({ disposition: "consumed", syncStatus: "deleting" });

    renderActivityPage("/org/acme/project/project-1/activity/drafts");

    expect(screen.getByText("Deleting")).toBeInTheDocument();
    expect(screen.getByText("Review the release notes").closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry deletion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
  });

  it("keeps conflict actions without opening a consumed draft", () => {
    setWorkspaceSession();
    seedWorkspaceMessengerContext();
    seedWorkspaceDraft({ disposition: "consumed", syncStatus: "conflict" });

    renderActivityPage("/org/acme/project/project-1/activity/drafts");

    expect(screen.getByText("Review the release notes").closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use server version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep my version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete draft" })).toBeInTheDocument();
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

    const { rerender } = renderActivityPage("/activity/starred");

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

      const { container } = renderActivityPage("/activity/starred");

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
});
